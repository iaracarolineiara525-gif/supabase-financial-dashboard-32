import { adminClient, hmacSha256Hex, json, noContent, normalizeMessageStatus, requiredEnv, safeErrorMessage, sha256Hex } from "../_shared/meta.ts";

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

async function verifyMetaSignature(request: Request, rawBody: string): Promise<boolean> {
  const appSecret = Deno.env.get("META_APP_SECRET");
  if (!appSecret) return false;
  const header = request.headers.get("x-hub-signature-256") || "";
  const expected = `sha256=${await hmacSha256Hex(appSecret, rawBody)}`;
  return timingSafeEqual(header, expected);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);

  if (request.method === "GET") {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expectedToken = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN");
    if (mode === "subscribe" && token && expectedToken && timingSafeEqual(token, expectedToken) && challenge) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return json(request, { error: "Webhook verification failed" }, 403);
  }

  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  const rawBody = await request.text();
  if (!(await verifyMetaSignature(request, rawBody))) return json(request, { error: "Invalid webhook signature" }, 401);

  try {
    const payload = JSON.parse(rawBody) as { entry?: Array<{ id?: string; changes?: Array<{ value?: Record<string, unknown> }> }> };
    const supabase = adminClient();
    const eventId = await sha256Hex(rawBody);
    const { error: eventError } = await supabase.from("meta_webhook_events").insert({ event_id: eventId, payload_hash: eventId, payload: payload, status: "received" });
    if (eventError && !eventError.message.toLowerCase().includes("duplicate")) throw eventError;

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const statuses = Array.isArray(value.statuses) ? value.statuses as Array<Record<string, unknown>> : [];
        const inboundMessages = Array.isArray(value.messages) ? value.messages as Array<Record<string, unknown>> : [];
        const contacts = Array.isArray(value.contacts) ? value.contacts as Array<Record<string, unknown>> : [];

        for (const status of statuses) {
          const externalId = typeof status.id === "string" ? status.id : "";
          const providerStatus = typeof status.status === "string" ? status.status : "";
          if (!externalId || !providerStatus) continue;
          await supabase.from("message_outbox").update({ status: normalizeMessageStatus(providerStatus), last_error: providerStatus === "failed" ? JSON.stringify(status.errors || []) : null, updated_at: new Date().toISOString() }).eq("external_id", externalId);
          const conversationStatus = providerStatus === "sent" ? "sent" : providerStatus === "delivered" ? "delivered" : providerStatus === "read" ? "read" : providerStatus === "failed" ? "failed" : "processing";
          await supabase.from("message_conversation_messages").update({ status: conversationStatus }).eq("external_id", externalId);
          await supabase.from("message_events").upsert({ external_id: externalId, event_type: providerStatus, normalized_status: normalizeMessageStatus(providerStatus), payload: status, event_hash: await sha256Hex(JSON.stringify(status)) }, { onConflict: "event_hash" });
        }

        for (const inbound of inboundMessages) {
          const senderDigits = typeof inbound.from === "string" ? inbound.from.replace(/\D/g, "") : "";
          const externalId = typeof inbound.id === "string" ? inbound.id : "";
          if (!senderDigits || !externalId) continue;
          const typeValue = typeof inbound.type === "string" ? inbound.type.toLowerCase() : "unknown";
          const allowedTypes = new Set(["text", "image", "video", "audio", "document", "interactive"]);
          const messageType = allowedTypes.has(typeValue) ? typeValue : "unknown";
          const textPayload = inbound.text && typeof inbound.text === "object" ? inbound.text as Record<string, unknown> : null;
          const body = typeof textPayload?.body === "string" ? textPayload.body : null;
          const contact = contacts.find((item) => item.wa_id === senderDigits);
          const profile = contact?.profile && typeof contact.profile === "object" ? contact.profile as Record<string, unknown> : null;
          const contactName = typeof profile?.name === "string" ? profile.name : null;
          const timestampSeconds = typeof inbound.timestamp === "string" || typeof inbound.timestamp === "number" ? Number(inbound.timestamp) : NaN;
          const providerTimestamp = Number.isFinite(timestampSeconds) ? new Date(timestampSeconds * 1000).toISOString() : null;
          const serviceWindowBase = providerTimestamp ? new Date(providerTimestamp).getTime() : Date.now();
          const serviceWindowExpiresAt = new Date(serviceWindowBase + 24 * 60 * 60 * 1000).toISOString();
          const { error: inboundError } = await supabase.rpc("v4_record_inbound_message", {
            p_phone_e164: `+${senderDigits}`,
            p_contact_name: contactName,
            p_external_id: externalId,
            p_message_type: messageType,
            p_body: body,
            p_provider_timestamp: providerTimestamp,
            p_service_window_expires_at: serviceWindowExpiresAt,
            p_raw_payload: inbound,
          });
          if (inboundError) throw inboundError;
        }
      }
    }

    await supabase.from("meta_webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("event_id", eventId);
    return json(request, { received: true });
  } catch (error) {
    try {
      const eventId = await sha256Hex(rawBody);
      await adminClient().from("meta_webhook_events").update({ status: "rejected", error_message: safeErrorMessage(error) }).eq("event_id", eventId);
    } catch {
      // The request still returns a safe error without exposing internal details.
    }
    return json(request, { error: "Webhook processing failed" }, 400);
  }
});
