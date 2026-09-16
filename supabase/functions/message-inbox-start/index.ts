import { adminClient, isE164, json, noContent, normalizePhone, phoneDigits, requirePinRole, safeErrorMessage } from "../_shared/meta.ts";

type ContactRow = {
  id: string;
  full_name: string;
  phone_e164: string;
  group_name: string | null;
  consent_status: string | null;
  subscription_status: string | null;
};

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "POST") return json(request, { ok: false, error: "Method not allowed" }, 405);

  try {
    const session = await requirePinRole(request, ["owner", "admin", "operator"]);
    const supabase = adminClient();
    let body: Record<string, unknown> = {};
    try { body = await request.json() as Record<string, unknown>; } catch { body = {}; }
    const action = trimmed(body.action) || "create";

    const { data: contactRows, error: contactsError } = await supabase
      .from("message_contacts")
      .select("id, full_name, phone_e164, group_name, consent_status, subscription_status")
      .order("full_name", { ascending: true })
      .limit(500);
    if (contactsError) throw contactsError;
    const contacts = (contactRows || []) as ContactRow[];

    const { data: listRows, error: listsError } = await supabase
      .from("message_contact_lists")
      .select("contact_id, list_name, source, added_at")
      .order("added_at", { ascending: true })
      .limit(2000);
    if (listsError) throw listsError;

    const listsByContact = new Map<string, { list_name: string; source: string; added_at: string }[]>();
    for (const row of (listRows || []) as { contact_id: string; list_name: string; source: string; added_at: string }[]) {
      const current = listsByContact.get(row.contact_id) || [];
      current.push({ list_name: row.list_name, source: row.source, added_at: row.added_at });
      listsByContact.set(row.contact_id, current);
    }
    const allLists = Array.from(new Set(((listRows || []) as { list_name: string }[]).map((row) => row.list_name))).sort();

    if (action === "contacts") {
      return json(request, {
        ok: true,
        contacts: contacts.map((contact) => ({ ...contact, lists: listsByContact.get(contact.id) || [] })),
        lists: allLists,
        fetchedAt: new Date().toISOString(),
      });
    }

    const listName = trimmed(body.listName);
    if (!listName) throw new Error("Informe a lista de origem do contato.");

    const contactId = trimmed(body.contactId);
    let contact: ContactRow | null = contactId ? contacts.find((item) => item.id === contactId) || null : null;

    if (!contact) {
      const fullName = trimmed(body.fullName);
      const rawPhone = trimmed(body.phone);
      if (!fullName) throw new Error("Informe o nome do contato.");
      const normalized = normalizePhone(rawPhone.startsWith("+") ? rawPhone : `+${rawPhone}`);
      if (!isE164(normalized)) throw new Error("Informe um número de WhatsApp válido no formato internacional.");
      const digits = phoneDigits(normalized);

      const existing = contacts.find((item) => phoneDigits(item.phone_e164) === digits);
      if (existing) {
        contact = existing;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("message_contacts")
          .insert({ full_name: fullName, phone_e164: digits, group_name: listName, source: "inbox", consent_status: "pending", subscription_status: "active" })
          .select("id, full_name, phone_e164, group_name, consent_status, subscription_status")
          .single();
        if (insertError) throw insertError;
        contact = inserted as ContactRow;
      }
    }

    await supabase
      .from("message_contact_lists")
      .upsert({ contact_id: contact.id, list_name: listName, source: "inbox" }, { onConflict: "contact_id,list_name" });

    const digits = phoneDigits(contact.phone_e164);
    const now = new Date().toISOString();
    const { data: conversation, error: conversationError } = await supabase
      .from("message_conversations")
      .upsert({
        phone_e164: digits,
        contact_id: contact.id,
        contact_name: contact.full_name,
        status: "open",
        origin_list: listName,
        updated_at: now,
      }, { onConflict: "phone_e164" })
      .select("id, phone_e164, contact_id, contact_name, status, origin_list, service_window_expires_at, last_message_at, last_message_preview, last_message_direction, unread_count, last_template_name")
      .single();
    if (conversationError) throw conversationError;

    await supabase.from("message_audit_logs").insert({
      actor_id: null,
      operator_key: session.operatorKey,
      action: "message_inbox_conversation_started",
      metadata: { conversation_id: conversation.id, contact_id: contact.id, list_name: listName },
    });

    return json(request, { ok: true, conversation, contact: { ...contact, lists: listsByContact.get(contact.id) || [] } });
  } catch (error) {
    return json(request, { ok: false, error: safeErrorMessage(error) }, 400);
  }
});
