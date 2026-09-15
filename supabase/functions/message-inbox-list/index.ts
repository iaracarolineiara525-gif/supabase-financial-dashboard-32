import { adminClient, json, noContent, phoneDigits, requirePinRole, safeErrorMessage } from "../_shared/meta.ts";
import { signMediaPath } from "../_shared/media.ts";

const MAX_CONVERSATIONS = 100;
const MAX_MESSAGES = 200;
const MEDIA_URL_TTL_SECONDS = 15 * 60;
const CONVERSATION_FIELDS = "id, phone_e164, contact_id, contact_name, status, origin_list, last_template_name, service_window_expires_at, last_message_at, last_message_preview, last_message_direction, unread_count";
const MESSAGE_FIELDS = "id, external_id, direction, message_type, body, status, sender_phone_e164, operator_key, template_name, media_id, media_mime_type, media_sha256, media_storage_path, media_caption, media_duration, transcription, processing_status, provider_timestamp, created_at";

type ContactIdentity = { id: string; full_name: string; phone_e164: string };

async function resolveConversationContacts(supabase: ReturnType<typeof adminClient>, conversations: Array<Record<string, unknown>>) {
  if (conversations.length === 0) return conversations;
  const { data: contactRows, error } = await supabase.from("message_contacts").select("id, full_name, phone_e164").order("updated_at", { ascending: false }).limit(2000);
  if (error) throw error;

  const contacts = (contactRows || []) as ContactIdentity[];
  const byId = new Map(contacts.map((contact) => [contact.id, contact]));
  const byPhone = new Map<string, ContactIdentity>();
  for (const contact of contacts) {
    const digits = phoneDigits(contact.phone_e164);
    if (digits && !byPhone.has(digits)) byPhone.set(digits, contact);
  }

  return conversations.map((conversation) => {
    const contactId = typeof conversation.contact_id === "string" ? conversation.contact_id : "";
    const matched = byId.get(contactId) || byPhone.get(phoneDigits(String(conversation.phone_e164 || "")));
    return matched ? { ...conversation, contact_id: matched.id, contact_name: matched.full_name } : conversation;
  });
}

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
    const markRead = body.markRead !== false;
    const supabase = adminClient();

    if (conversationId) {
      const { data: conversation, error: conversationError } = await supabase.from("message_conversations").select(CONVERSATION_FIELDS).eq("id", conversationId).maybeSingle();
      if (conversationError) throw conversationError;
      if (!conversation) return json(request, { ok: false, error: "Conversation not found" }, 404);

      const { data: messages, error: messagesError } = await supabase.from("message_conversation_messages").select(MESSAGE_FIELDS).eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(MAX_MESSAGES);
      if (messagesError) throw messagesError;

      const mediaUrlExpiresAt = new Date(Date.now() + MEDIA_URL_TTL_SECONDS * 1000).toISOString();
      const messagesWithMedia = await Promise.all((messages || []).map(async (message) => {
        const storagePath = typeof message.media_storage_path === "string" ? message.media_storage_path : null;
        if (!storagePath) return message;
        const mediaUrl = await signMediaPath(supabase, storagePath, MEDIA_URL_TTL_SECONDS);
        return { ...message, media_url: mediaUrl, media_url_expires_at: mediaUrl ? mediaUrlExpiresAt : null };
      }));

      const [resolvedConversation] = await resolveConversationContacts(supabase, [conversation as Record<string, unknown>]);
      if (markRead) await supabase.from("message_conversations").update({ unread_count: 0, updated_at: new Date().toISOString() }).eq("id", conversationId);
      if (resolvedConversation.contact_id !== conversation.contact_id || resolvedConversation.contact_name !== conversation.contact_name) {
        await supabase.from("message_conversations").update({ contact_id: resolvedConversation.contact_id, contact_name: resolvedConversation.contact_name, updated_at: new Date().toISOString() }).eq("id", conversationId);
      }
      await supabase.from("message_audit_logs").insert({ actor_id: null, operator_key: session.operatorKey, action: "message_inbox_thread_viewed", metadata: { conversation_id: conversationId } });
      return json(request, { ok: true, conversation: { ...resolvedConversation, unread_count: markRead ? 0 : conversation.unread_count }, messages: messagesWithMedia, fetchedAt: new Date().toISOString() });
    }

    const { data: conversations, error } = await supabase.from("message_conversations").select(CONVERSATION_FIELDS).order("last_message_at", { ascending: false, nullsFirst: false }).limit(MAX_CONVERSATIONS);
    if (error) throw error;

    const resolved = await resolveConversationContacts(supabase, (conversations || []) as Array<Record<string, unknown>>);
    await Promise.all(resolved.map(async (conversation) => {
      const original = (conversations || []).find((item) => item.id === conversation.id);
      if (!original || (original.contact_id === conversation.contact_id && original.contact_name === conversation.contact_name)) return;
      await supabase.from("message_conversations").update({ contact_id: conversation.contact_id, contact_name: conversation.contact_name, updated_at: new Date().toISOString() }).eq("id", conversation.id);
    }));
    await supabase.from("message_audit_logs").insert({ actor_id: null, operator_key: session.operatorKey, action: "message_inbox_listed", metadata: { count: resolved.length } });
    return json(request, { ok: true, conversations: resolved, fetchedAt: new Date().toISOString() });
  } catch (error) {
    return json(request, { ok: false, error: safeErrorMessage(error) }, 400);
  }
});
