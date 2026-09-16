import { adminClient, isTestMode, isE164, json, metaRequest, noContent, normalizePhone, phoneDigits, requirePinRole, requiredEnv, safeErrorMessage } from "../_shared/meta.ts";

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requiredString(value: unknown, field: string): string {
  const text = trimmed(value);
  if (!text) throw new Error(`${field} is required`);
  return text;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "POST") return json(request, { ok: false, error: "Method not allowed" }, 405);

  try {
    const session = await requirePinRole(request, ["owner", "admin", "operator"]);
    const body = await request.json() as Record<string, unknown>;
    const conversationId = requiredString(body.conversationId, "conversationId");
    const templateName = trimmed(body.templateName);
    const templateLanguage = trimmed(body.templateLanguage) || "pt_BR";
    const parameters = Array.isArray(body.parameters) ? body.parameters.map((value) => trimmed(value)) : [];
    const text = trimmed(body.message);
    const mediaKind = trimmed(body.mediaType).toLowerCase();
    const mediaId = trimmed(body.mediaId);
    const mediaMimeType = trimmed(body.mediaMimeType) || null;
    const mediaCaption = trimmed(body.caption).slice(0, 1024);
    const idempotencyKey = requiredString(body.idempotencyKey || request.headers.get("x-idempotency-key"), "idempotencyKey");

    const useMedia = Boolean(mediaId);
    if (useMedia && !["audio", "video"].includes(mediaKind)) throw new Error("mediaType deve ser audio ou video");
    if (useMedia && mediaKind === "audio" && mediaCaption) throw new Error("A Meta não aceita legenda em mensagens de áudio.");
    if (!templateName && !text && !useMedia) throw new Error("Informe a mensagem, um arquivo de mídia ou selecione um template aprovado.");
    if (text.length > 4096) throw new Error("message exceeds the 4096 character limit");

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
    const windowOpen = Boolean(windowExpiresAt && !Number.isNaN(windowExpiresAt.getTime()) && windowExpiresAt.getTime() > Date.now());
    if (!windowOpen && !templateName) {
      throw new Error("A janela de atendimento de 24 horas está fechada. Selecione um template aprovado pela Meta para iniciar a conversa.");
    }
    if (useMedia && !windowOpen) {
      throw new Error("Áudio e vídeo avulsos só podem ser enviados dentro da janela de atendimento de 24 horas.");
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

    const useTemplate = Boolean(templateName) && !useMedia;
    const messageType = useMedia ? mediaKind : useTemplate ? "template" : "text";
    const preview = useMedia
      ? `[${mediaKind === "audio" ? "áudio" : "vídeo"}]${mediaCaption ? ` ${mediaCaption}` : ""}`
      : useTemplate
      ? `[template ${templateName}]${parameters.length > 0 ? ` ${parameters.join(" | ")}` : ""}`
      : text;
    const dryRun = body.dryRun === true || isTestMode();
    const now = new Date().toISOString();

    const mediaColumns = useMedia
      ? { media_id: mediaId, media_mime_type: mediaMimeType, media_caption: mediaCaption || null, processing_status: "stored" }
      : {};

    const { data: outbox, error: outboxError } = await supabase
      .from("message_outbox")
      .insert({
        actor_id: null,
        operator_key: session.operatorKey,
        to_phone_e164: phoneDigits(normalizedPhone),
        message_type: messageType,
        template_name: useTemplate ? templateName : null,
        body_preview: preview.slice(0, 500),
        idempotency_key: idempotencyKey,
        status: dryRun ? "simulada" : "pending",
        dry_run: dryRun,
      })
      .select("id, status, idempotency_key")
      .single();
    if (outboxError) throw outboxError;

    const conversationPatch = {
      last_message_at: now,
      last_message_preview: preview.slice(0, 240),
      last_message_direction: "outbound",
      last_template_name: useTemplate ? templateName : null,
      updated_at: now,
    };

    const MESSAGE_FIELDS = "id, external_id, direction, message_type, body, status, operator_key, template_name, media_id, media_mime_type, media_storage_path, media_caption, media_duration, transcription, processing_status, created_at";

    if (dryRun) {
      const { data: message, error: messageError } = await supabase
        .from("message_conversation_messages")
        .insert({ conversation_id: conversationId, direction: "outbound", message_type: messageType, body: preview, template_name: useTemplate ? templateName : null, status: "simulated", sender_phone_e164: phoneDigits(normalizedPhone), operator_key: session.operatorKey, outbox_id: outbox.id, created_at: now, ...mediaColumns })
        .select(MESSAGE_FIELDS)
        .single();
      if (messageError) throw messageError;
      await supabase.from("message_conversations").update(conversationPatch).eq("id", conversationId);
      await supabase.from("message_audit_logs").insert({ actor_id: null, operator_key: session.operatorKey, action: "message_inbox_reply_dry_run", metadata: { conversation_id: conversationId, outbox_id: outbox.id, message_type: messageType } });
      return json(request, { ok: true, dryRun: true, message: { ...message, outbox_id: outbox.id }, notice: "Modo de teste ativo. Nenhuma resposta foi enviada para a Meta." });
    }

    const payload = useMedia
      ? {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phoneDigits(normalizedPhone),
        type: mediaKind,
        [mediaKind]: mediaKind === "video" && mediaCaption ? { id: mediaId, caption: mediaCaption } : { id: mediaId },
      }
      : useTemplate
      ? {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phoneDigits(normalizedPhone),
        type: "template",
        template: {
          name: templateName,
          language: { code: templateLanguage },
          ...(parameters.length > 0
            ? { components: [{ type: "body", parameters: parameters.map((value) => ({ type: "text", text: value })) }] }
            : {}),
        },
      }
      : { messaging_product: "whatsapp", recipient_type: "individual", to: phoneDigits(normalizedPhone), type: "text", text: { preview_url: false, body: text } };

    try {
      const { data } = await metaRequest(`/${requiredEnv("META_PHONE_NUMBER_ID")}/messages`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const externalId = Array.isArray(data.messages) && data.messages[0] && typeof data.messages[0] === "object" ? (data.messages[0] as Record<string, unknown>).id : null;
      await supabase.from("message_outbox").update({ status: "processando", external_id: typeof externalId === "string" ? externalId : null, sent_at: now, updated_at: now }).eq("id", outbox.id);
      const { data: message, error: messageError } = await supabase
        .from("message_conversation_messages")
        .insert({ conversation_id: conversationId, external_id: typeof externalId === "string" ? externalId : null, direction: "outbound", message_type: messageType, body: useMedia || useTemplate ? preview : text, template_name: useTemplate ? templateName : null, status: "processing", sender_phone_e164: phoneDigits(normalizedPhone), operator_key: session.operatorKey, outbox_id: outbox.id, provider_timestamp: now, created_at: now, ...mediaColumns })
        .select(MESSAGE_FIELDS)
        .single();
      if (messageError) throw messageError;
      await supabase.from("message_conversations").update(conversationPatch).eq("id", conversationId);
      await supabase.from("message_audit_logs").insert({ actor_id: null, operator_key: session.operatorKey, action: "message_inbox_reply_sent", metadata: { conversation_id: conversationId, outbox_id: outbox.id, external_id: externalId, message_type: messageType, template_name: useTemplate ? templateName : null } });
      return json(request, { ok: true, dryRun: false, message: { ...message, outbox_id: outbox.id } });
    } catch (providerError) {
      const providerMessage = safeErrorMessage(providerError);
      await supabase.from("message_outbox").update({ status: "falhou", last_error: providerMessage, updated_at: new Date().toISOString() }).eq("id", outbox.id);
      await supabase.from("message_conversation_messages").insert({ conversation_id: conversationId, direction: "outbound", message_type: messageType, body: preview, template_name: useTemplate ? templateName : null, status: "failed", sender_phone_e164: phoneDigits(normalizedPhone), operator_key: session.operatorKey, outbox_id: outbox.id, raw_payload: { error: providerMessage }, created_at: new Date().toISOString(), ...mediaColumns });
      await supabase.from("message_audit_logs").insert({ actor_id: null, operator_key: session.operatorKey, action: "message_inbox_reply_failed", metadata: { conversation_id: conversationId, outbox_id: outbox.id, error: providerMessage } });
      return json(request, { ok: false, dryRun: false, error: providerMessage, messageId: outbox.id }, 502);
    }
  } catch (error) {
    return json(request, { ok: false, error: safeErrorMessage(error) }, 400);
  }
});
