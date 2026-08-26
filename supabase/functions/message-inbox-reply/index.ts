import { adminClient, isTestMode, isE164, json, metaRequest, noContent, normalizePhone, phoneDigits, requirePinRole, requiredEnv, safeErrorMessage } from "../_shared/meta.ts";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "POST") return json(request, { ok: false, error: "Method not allowed" }, 405);

  try {
    const session = await requirePinRole(request, ["owner", "admin", "operator"]);
    const body = await request.json() as Record<string, unknown>;
    const conversationId = requiredString(body.conversationId, "conversationId");
    const text = requiredString(body.message, "message");
    if (text.length > 4096) throw new Error("message exceeds the 4096 character limit");
    const idempotencyKey = requiredString(body.idempotencyKey || request.headers.get("x-idempotency-key"), "idempotencyKey");

    const supabase = adminClient();
    const { data: conversation, error: conversationError } = await supabase
      .from("message_conversations")
      .select("id, phone_e164, service_window_expires_at, status")
      .eq("id", conversationId)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation) return json(request, { ok: false, error: "Conversation not found" }, 404);
    if (conversation.status === "archived") throw new Error("Conversation is archived");

    const storedPhone = String(conversation.phone_e164);
    const normalizedPhone = normalizePhone(storedPhone.startsWith("+") ? storedPhone : `+${storedPhone}`);
    if (!isE164(normalizedPhone)) throw new Error("Conversation has an invalid WhatsApp number");
    const windowExpiresAt = typeof conversation.service_window_expires_at === "string" ? new Date(conversation.service_window_expires_at) : null;
    if (!windowExpiresAt || Number.isNaN(windowExpiresAt.getTime()) || windowExpiresAt.getTime() <= Date.now()) {
      throw new Error("The 24-hour customer service window is closed. Use an approved Meta template instead.");
    }

    const { data: suppressed, error: suppressionError } = await supabase
      .from("message_suppression")
      .select("id, reason")
      .eq("phone_e164", phoneDigits(normalizedPhone))
      .maybeSingle();
    if (suppressionError) throw suppressionError;
    if (suppressed) throw new Error("Recipient is blocked by the suppression list");

    const { data: existing } = await supabase
      .from("message_outbox")
      .select("id, status, external_id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) return json(request, { ok: true, duplicate: true, dryRun: existing.status === "simulada", message: existing });

    const dryRun = body.dryRun !== false || isTestMode();
    const now = new Date().toISOString();
    const { data: outbox, error: outboxError } = await supabase
      .from("message_outbox")
      .insert({
        actor_id: null,
        operator_key: session.operatorKey,
        to_phone_e164: phoneDigits(normalizedPhone),
        message_type: "text",
        body_preview: text.slice(0, 500),
        idempotency_key: idempotencyKey,
        status: dryRun ? "simulada" : "pendente",
        dry_run: dryRun,
      })
      .select("id, status, idempotency_key")
      .single();
    if (outboxError) throw outboxError;

    if (dryRun) {
      const { data: message, error: messageError } = await supabase
        .from("message_conversation_messages")
        .insert({ conversation_id: conversationId, direction: "outbound", message_type: "text", body: text, status: "simulated", sender_phone_e164: phoneDigits(normalizedPhone), operator_key: session.operatorKey, outbox_id: outbox.id, created_at: now })
        .select("id, external_id, direction, message_type, body, status, operator_key, created_at")
        .single();
      if (messageError) throw messageError;
      await supabase.from("message_conversations").update({ last_message_at: now, last_message_preview: text.slice(0, 240), last_message_direction: "outbound", updated_at: now }).eq("id", conversationId);
      await supabase.from("message_audit_logs").insert({ actor_id: null, operator_key: session.operatorKey, action: "message_inbox_reply_dry_run", metadata: { conversation_id: conversationId, outbox_id: outbox.id } });
      return json(request, { ok: true, dryRun: true, message: { ...message, outbox_id: outbox.id }, notice: "Modo de teste ativo. Nenhuma resposta foi enviada para a Meta." });
    }

    try {
      const { data } = await metaRequest(`/${requiredEnv("META_PHONE_NUMBER_ID")}/messages`, {
        method: "POST",
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: phoneDigits(normalizedPhone), type: "text", text: { preview_url: false, body: text } }),
      });
      const externalId = Array.isArray(data.messages) && data.messages[0] && typeof data.messages[0] === "object" ? (data.messages[0] as Record<string, unknown>).id : null;
      const status = "processando";
      await supabase.from("message_outbox").update({ status, external_id: typeof externalId === "string" ? externalId : null, sent_at: now, updated_at: now }).eq("id", outbox.id);
      const { data: message, error: messageError } = await supabase
        .from("message_conversation_messages")
        .insert({ conversation_id: conversationId, external_id: typeof externalId === "string" ? externalId : null, direction: "outbound", message_type: "text", body: text, status: "processing", sender_phone_e164: phoneDigits(normalizedPhone), operator_key: session.operatorKey, outbox_id: outbox.id, created_at: now })
        .select("id, external_id, direction, message_type, body, status, operator_key, created_at")
        .single();
      if (messageError) throw messageError;
      await supabase.from("message_conversations").update({ last_message_at: now, last_message_preview: text.slice(0, 240), last_message_direction: "outbound", updated_at: now }).eq("id", conversationId);
      await supabase.from("message_audit_logs").insert({ actor_id: null, operator_key: session.operatorKey, action: "message_inbox_reply_sent", metadata: { conversation_id: conversationId, outbox_id: outbox.id, external_id: externalId } });
      return json(request, { ok: true, dryRun: false, message: { ...message, outbox_id: outbox.id } });
    } catch (providerError) {
      const providerMessage = safeErrorMessage(providerError);
      await supabase.from("message_outbox").update({ status: "falhou", last_error: providerMessage, updated_at: new Date().toISOString() }).eq("id", outbox.id);
      await supabase.from("message_conversation_messages").insert({ conversation_id: conversationId, direction: "outbound", message_type: "text", body: text, status: "failed", sender_phone_e164: phoneDigits(normalizedPhone), operator_key: session.operatorKey, outbox_id: outbox.id, raw_payload: { error: providerMessage }, created_at: new Date().toISOString() });
      await supabase.from("message_audit_logs").insert({ actor_id: null, operator_key: session.operatorKey, action: "message_inbox_reply_failed", metadata: { conversation_id: conversationId, outbox_id: outbox.id, error: providerMessage } });
      return json(request, { ok: false, dryRun: false, error: providerMessage, messageId: outbox.id }, 502);
    }
  } catch (error) {
    return json(request, { ok: false, error: safeErrorMessage(error) }, 400);
  }
});
