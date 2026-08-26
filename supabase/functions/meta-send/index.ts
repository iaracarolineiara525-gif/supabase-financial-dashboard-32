import { adminClient, isE164, isTestMode, json, metaRequest, noContent, normalizePhone, phoneDigits, requirePinRole, requiredEnv, safeErrorMessage } from "../_shared/meta.ts";

function stringValue(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

async function requireApprovedTemplate(name: string, language: string) {
  const query = new URLSearchParams({ fields: "id,name,language,status,category,components", limit: "100", name });
  const { data } = await metaRequest(`/${requiredEnv("META_WABA_ID")}/message_templates?${query.toString()}`);
  const templates = Array.isArray(data.data) ? data.data as Array<Record<string, unknown>> : [];
  const match = templates.find((template) => template.name === name && (!language || template.language === language));
  if (!match || match.status !== "APPROVED") throw new Error("The Meta template must have status APPROVED before it can be sent");
  return match;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  try {
    const session = await requirePinRole(request, ["owner", "admin", "operator"]);
    const body = await request.json();
    const to = normalizePhone(stringValue(body.to, "to"));
    const text = typeof body.message === "string" ? body.message.trim() : "";
    const templateName = typeof body.templateName === "string" ? body.templateName.trim() : "";
    const languageCode = typeof body.languageCode === "string" ? body.languageCode.trim() : "pt_BR";
    const dryRun = body.dryRun !== false || isTestMode();
    const idempotencyKey = stringValue(body.idempotencyKey || request.headers.get("x-idempotency-key"), "idempotencyKey");

    if (!isE164(to)) throw new Error("The destination must use international E.164 format");
    if (!text && !templateName) throw new Error("message or templateName is required");
    if (text.length > 4096) throw new Error("message exceeds the 4096 character limit");

    const supabase = adminClient();
    const { data: contact, error: contactError } = await supabase.from("message_contacts").select("consent_status, subscription_status").eq("phone_e164", phoneDigits(to)).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (contactError) throw contactError;
    if (!dryRun && (!contact || contact.consent_status !== "consented" || contact.subscription_status !== "active")) throw new Error("Recipient needs an active consent record before a real send");
    if (!dryRun && templateName) await requireApprovedTemplate(templateName, languageCode);
    if (!dryRun && !templateName) {
      const { data: conversation, error: conversationError } = await supabase.from("message_conversations").select("service_window_expires_at").eq("phone_e164", phoneDigits(to)).maybeSingle();
      if (conversationError) throw conversationError;
      const expiresAt = typeof conversation?.service_window_expires_at === "string" ? new Date(conversation.service_window_expires_at).getTime() : 0;
      if (!expiresAt || expiresAt <= Date.now()) throw new Error("The 24-hour customer service window is closed. Use an approved Meta template instead.");
    }

    const { data: suppressed } = await supabase.from("message_suppression").select("id, reason").eq("phone_e164", phoneDigits(to)).maybeSingle();
    if (suppressed) throw new Error("Recipient is blocked by the suppression list");

    const { data: existing } = await supabase.from("message_outbox").select("id, status, external_id").eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing) {
      return json(request, { ok: true, duplicate: true, dryRun, message: existing });
    }

    if (!dryRun) {
      const configuredLimit = Number(Deno.env.get("META_SEND_RATE_LIMIT_PER_MINUTE") || "20");
      const { data: slot, error: slotError } = await supabase.rpc("v4_claim_send_slot", { p_operator_key: session.operatorKey, p_limit: Number.isFinite(configuredLimit) ? configuredLimit : 20 });
      if (slotError) throw slotError;
      const slotResult = (Array.isArray(slot) ? slot[0] : slot) as Record<string, unknown> | null;
      if (!slotResult?.ok) throw new Error(`Send rate limit reached. Retry in ${typeof slotResult?.retry_after_seconds === "number" ? slotResult.retry_after_seconds : 60} seconds.`);
    }

    const { data: messageRow, error: insertError } = await supabase.from("message_outbox").insert({
      actor_id: null,
      operator_key: session.operatorKey,
      to_phone_e164: phoneDigits(to),
      message_type: templateName ? "template" : "text",
      body_preview: text.slice(0, 500),
      template_name: templateName || null,
      idempotency_key: idempotencyKey,
      status: dryRun ? "simulada" : "pendente",
      dry_run: dryRun,
    }).select("id, status, idempotency_key").single();
    if (insertError) throw insertError;

    if (dryRun) {
      await supabase.from("message_audit_logs").insert({ actor_id: null, operator_key: session.operatorKey, action: "meta_message_dry_run", metadata: { outbox_id: messageRow.id, to: phoneDigits(to), template: templateName || null } });
      return json(request, { ok: true, dryRun: true, message: messageRow, notice: "Dry run completed. No real message was sent." });
    }

    const payload = templateName
      ? { messaging_product: "whatsapp", recipient_type: "individual", to: phoneDigits(to), type: "template", template: { name: templateName, language: { code: languageCode }, ...(Array.isArray(body.parameters) ? { components: [{ type: "body", parameters: body.parameters }] } : {}) } }
      : { messaging_product: "whatsapp", recipient_type: "individual", to: phoneDigits(to), type: "text", text: { body: text } };

    let providerData: Record<string, unknown>;
    try {
      const response = await metaRequest(`/${Deno.env.get("META_PHONE_NUMBER_ID")}/messages`, { method: "POST", body: JSON.stringify(payload) });
      providerData = response.data;
    } catch (providerError) {
      const providerMessage = safeErrorMessage(providerError);
      await supabase.from("message_outbox").update({ status: "falhou", last_error: providerMessage, updated_at: new Date().toISOString() }).eq("id", messageRow.id);
      await supabase.from("message_audit_logs").insert({ actor_id: null, operator_key: session.operatorKey, action: "meta_message_send_failed", metadata: { outbox_id: messageRow.id, error: providerMessage } });
      return json(request, { ok: false, dryRun: false, error: providerMessage, messageId: messageRow.id }, 502);
    }

    const externalId = Array.isArray(providerData.messages) && providerData.messages[0] && typeof providerData.messages[0] === "object" ? (providerData.messages[0] as Record<string, unknown>).id : null;
    const sentAt = new Date().toISOString();
    try {
      const { error: outboxUpdateError } = await supabase.from("message_outbox").update({ status: "processando", external_id: typeof externalId === "string" ? externalId : null, sent_at: sentAt, updated_at: sentAt }).eq("id", messageRow.id);
      if (outboxUpdateError) throw outboxUpdateError;
      const { data: conversation, error: conversationError } = await supabase.from("message_conversations").upsert({ phone_e164: phoneDigits(to), status: "open", last_message_at: sentAt, last_message_preview: (templateName ? `[Template] ${templateName}` : text).slice(0, 240), last_message_direction: "outbound", updated_at: sentAt }, { onConflict: "phone_e164" }).select("id").single();
      if (conversationError) throw conversationError;
      if (conversation) {
        const { error: historyError } = await supabase.from("message_conversation_messages").insert({ conversation_id: conversation.id, external_id: typeof externalId === "string" ? externalId : null, direction: "outbound", message_type: templateName ? "template" : "text", body: templateName ? `[Template] ${templateName}` : text, status: "processing", sender_phone_e164: phoneDigits(to), operator_key: session.operatorKey, outbox_id: messageRow.id, created_at: sentAt });
        if (historyError) throw historyError;
      }
      await supabase.from("message_audit_logs").insert({ actor_id: null, operator_key: session.operatorKey, action: "meta_message_sent_request", metadata: { outbox_id: messageRow.id, external_id: externalId, to: phoneDigits(to) } });
    } catch (persistenceError) {
      const persistenceMessage = safeErrorMessage(persistenceError);
      await supabase.from("message_audit_logs").insert({ actor_id: null, operator_key: session.operatorKey, action: "meta_message_persistence_failed", metadata: { outbox_id: messageRow.id, external_id: externalId, error: persistenceMessage } });
      return json(request, { ok: true, dryRun: false, message: { ...messageRow, status: "processando", externalId }, warning: "A Meta aceitou o envio, mas o histórico local precisa de reconciliação." });
    }
    return json(request, { ok: true, dryRun: false, message: { ...messageRow, status: "processando", externalId } });
  } catch (error) {
    return json(request, { ok: false, error: safeErrorMessage(error) }, 400);
  }
});
