import { adminClient, isE164, isTestMode, json, metaRequest, noContent, normalizePhone, phoneDigits, requirePinSession, safeErrorMessage } from "../_shared/meta.ts";

function stringValue(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  try {
    await requirePinSession(request);
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
    const { data: suppressed } = await supabase.from("message_suppression").select("id, reason").eq("phone_e164", phoneDigits(to)).maybeSingle();
    if (suppressed) throw new Error("Recipient is blocked by the suppression list");

    const { data: existing } = await supabase.from("message_outbox").select("id, status, external_id").eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing) {
      return json(request, { ok: true, duplicate: true, dryRun, message: existing });
    }

    const { data: messageRow, error: insertError } = await supabase.from("message_outbox").insert({
      actor_id: null,
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
      await supabase.from("message_audit_logs").insert({ actor_id: null, action: "meta_message_dry_run", metadata: { outbox_id: messageRow.id, to: phoneDigits(to), template: templateName || null } });
      return json(request, { ok: true, dryRun: true, message: messageRow, notice: "Dry run completed. No real message was sent." });
    }

    const payload = templateName
      ? { messaging_product: "whatsapp", recipient_type: "individual", to: phoneDigits(to), type: "template", template: { name: templateName, language: { code: languageCode }, ...(Array.isArray(body.parameters) ? { components: [{ type: "body", parameters: body.parameters }] } : {}) } }
      : { messaging_product: "whatsapp", recipient_type: "individual", to: phoneDigits(to), type: "text", text: { body: text } };

    try {
      const { data } = await metaRequest(`/${Deno.env.get("META_PHONE_NUMBER_ID")}/messages`, { method: "POST", body: JSON.stringify(payload) });
      const externalId = Array.isArray(data.messages) && data.messages[0] && typeof data.messages[0] === "object" ? (data.messages[0] as Record<string, unknown>).id : null;
      await supabase.from("message_outbox").update({ status: "processando", external_id: typeof externalId === "string" ? externalId : null, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", messageRow.id);
      await supabase.from("message_audit_logs").insert({ actor_id: null, action: "meta_message_sent_request", metadata: { outbox_id: messageRow.id, external_id: externalId, to: phoneDigits(to) } });
      return json(request, { ok: true, dryRun: false, message: { ...messageRow, status: "processando", externalId } });
    } catch (providerError) {
      const providerMessage = safeErrorMessage(providerError);
      await supabase.from("message_outbox").update({ status: "falhou", last_error: providerMessage, updated_at: new Date().toISOString() }).eq("id", messageRow.id);
      await supabase.from("message_audit_logs").insert({ actor_id: null, action: "meta_message_send_failed", metadata: { outbox_id: messageRow.id, error: providerMessage } });
      return json(request, { ok: false, dryRun: false, error: providerMessage, messageId: messageRow.id }, 502);
    }
  } catch (error) {
    return json(request, { ok: false, error: safeErrorMessage(error) }, 400);
  }
});
