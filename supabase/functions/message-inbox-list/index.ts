import { adminClient, json, noContent, requirePinRole, safeErrorMessage } from "../_shared/meta.ts";

const MAX_CONVERSATIONS = 100;
const MAX_MESSAGES = 200;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "GET" && request.method !== "POST") return json(request, { ok: false, error: "Method not allowed" }, 405);

  try {
    const session = await requirePinRole(request, ["owner", "admin", "operator", "viewer"]);
    const url = new URL(request.url);
    let body: Record<string, unknown> = {};
    if (request.method === "POST") {
      try { body = await request.json() as Record<string, unknown>; } catch { body = {}; }
    }

    const conversationId = typeof body.conversationId === "string" ? body.conversationId : url.searchParams.get("conversationId");
    const supabase = adminClient();

    if (conversationId) {
      const { data: conversation, error: conversationError } = await supabase
        .from("message_conversations")
        .select("id, phone_e164, contact_id, contact_name, status, service_window_expires_at, last_message_at, last_message_preview, last_message_direction, unread_count")
        .eq("id", conversationId)
        .maybeSingle();
      if (conversationError) throw conversationError;
      if (!conversation) return json(request, { ok: false, error: "Conversation not found" }, 404);

      const { data: messages, error: messagesError } = await supabase
        .from("message_conversation_messages")
        .select("id, external_id, direction, message_type, body, status, sender_phone_e164, operator_key, provider_timestamp, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(MAX_MESSAGES);
      if (messagesError) throw messagesError;

      await supabase.from("message_conversations").update({ unread_count: 0, updated_at: new Date().toISOString() }).eq("id", conversationId);
      await supabase.from("message_audit_logs").insert({ actor_id: null, operator_key: session.operatorKey, action: "message_inbox_thread_viewed", metadata: { conversation_id: conversationId } });
      return json(request, { ok: true, conversation, messages: messages || [], fetchedAt: new Date().toISOString() });
    }

    const { data: conversations, error } = await supabase
      .from("message_conversations")
      .select("id, phone_e164, contact_id, contact_name, status, service_window_expires_at, last_message_at, last_message_preview, last_message_direction, unread_count")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(MAX_CONVERSATIONS);
    if (error) throw error;

    await supabase.from("message_audit_logs").insert({ actor_id: null, operator_key: session.operatorKey, action: "message_inbox_listed", metadata: { count: conversations?.length || 0 } });
    return json(request, { ok: true, conversations: conversations || [], fetchedAt: new Date().toISOString() });
  } catch (error) {
    return json(request, { ok: false, error: safeErrorMessage(error) }, 400);
  }
});
