import { adminClient, json, metaRequest, noContent, phoneDigits, requirePinRole, requiredEnv, safeErrorMessage } from "../_shared/meta.ts";
import { approvedTemplateFromList, renderTemplateBody } from "../_shared/template.ts";

type ReconcileRow = {
  phone?: unknown;
  company?: unknown;
  personalization?: unknown;
  externalId?: unknown;
  sentAt?: unknown;
};

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function secureEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

async function authorize(request: Request): Promise<string> {
  const expected = Deno.env.get("MESSAGE_RECONCILE_TOKEN")?.trim() || "";
  const provided = request.headers.get("x-reconcile-token")?.trim() || "";
  if (expected && provided && secureEqual(expected, provided)) return "one_time_reconciliation";
  const session = await requirePinRole(request, ["owner", "admin"]);
  return session.operatorKey;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "POST") return json(request, { ok: false, error: "Method not allowed" }, 405);

  try {
    const operatorKey = await authorize(request);
    const payload = await request.json() as Record<string, unknown>;
    const rows = Array.isArray(payload.rows) ? payload.rows as ReconcileRow[] : [];
    if (rows.length === 0 || rows.length > 500) throw new Error("rows must contain between 1 and 500 entries");

    const templateName = text(payload.templateName, 512);
    const language = text(payload.language, 32) || "pt_BR";
    const originList = text(payload.originList, 160) || null;
    if (!templateName) throw new Error("templateName is required");

    const query = new URLSearchParams({ fields: "id,name,language,status,category,components", limit: "100", name: templateName });
    const { data: templateList } = await metaRequest(`/${requiredEnv("META_WABA_ID")}/message_templates?${query.toString()}`);
    const approvedTemplate = approvedTemplateFromList(templateList, templateName, language);
    const supabase = adminClient();

    let inserted = 0;
    let duplicates = 0;
    let contactsMatched = 0;
    const errors: Array<{ index: number; error: string }> = [];

    for (const [index, row] of rows.entries()) {
      try {
        const digits = phoneDigits(text(row.phone, 32));
        const company = text(row.company, 160);
        const personalization = text(row.personalization, 160);
        const externalId = text(row.externalId, 512);
        const sentAtText = text(row.sentAt, 64);
        const sentAt = new Date(sentAtText);
        if (!/^\d{8,15}$/.test(digits)) throw new Error("invalid phone");
        if (!externalId.startsWith("wamid.")) throw new Error("invalid externalId");
        if (!personalization) throw new Error("personalization is required");
        if (Number.isNaN(sentAt.getTime())) throw new Error("invalid sentAt");

        const bodyParameters = [{ type: "text", text: personalization }];
        const renderedBody = renderTemplateBody(approvedTemplate, bodyParameters);
        const { data: contact, error: contactError } = await supabase
          .from("message_contacts")
          .select("id, full_name")
          .eq("phone_e164", digits)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (contactError) throw contactError;
        if (contact) contactsMatched += 1;

        const { data: existingMessage, error: existingMessageError } = await supabase
          .from("message_conversation_messages")
          .select("id")
          .eq("external_id", externalId)
          .maybeSingle();
        if (existingMessageError) throw existingMessageError;
        if (existingMessage) {
          duplicates += 1;
          continue;
        }

        const { data: existingConversation, error: existingConversationError } = await supabase
          .from("message_conversations")
          .select("id, last_message_at")
          .eq("phone_e164", digits)
          .maybeSingle();
        if (existingConversationError) throw existingConversationError;

        let conversationId: string;
        if (existingConversation) {
          conversationId = String(existingConversation.id);
          const currentActivity = existingConversation.last_message_at ? new Date(String(existingConversation.last_message_at)).getTime() : 0;
          const sentTime = sentAt.getTime();
          const conversationUpdate: Record<string, unknown> = {
            contact_id: contact?.id || null,
            contact_name: contact?.full_name || company || null,
            origin_list: originList,
            last_template_name: templateName,
            updated_at: new Date().toISOString(),
          };
          if (!currentActivity || currentActivity <= sentTime) {
            conversationUpdate.last_message_at = sentAt.toISOString();
            conversationUpdate.last_message_preview = renderedBody.slice(0, 240);
            conversationUpdate.last_message_direction = "outbound";
          }
          const { error: updateError } = await supabase.from("message_conversations").update(conversationUpdate).eq("id", conversationId);
          if (updateError) throw updateError;
        } else {
          const { data: createdConversation, error: createError } = await supabase.from("message_conversations").insert({
            phone_e164: digits,
            contact_id: contact?.id || null,
            contact_name: contact?.full_name || company || null,
            status: "open",
            origin_list: originList,
            last_template_name: templateName,
            last_message_at: sentAt.toISOString(),
            last_message_preview: renderedBody.slice(0, 240),
            last_message_direction: "outbound",
          }).select("id").single();
          if (createError) throw createError;
          conversationId = String(createdConversation.id);
        }

        const { error: insertError } = await supabase.from("message_conversation_messages").insert({
          conversation_id: conversationId,
          external_id: externalId,
          direction: "outbound",
          message_type: "template",
          body: renderedBody,
          status: "sent",
          sender_phone_e164: digits,
          operator_key: operatorKey,
          template_name: templateName,
          raw_payload: {
            reconciled: true,
            source: "meta_direct_send_audit",
            language,
            parameters: bodyParameters,
            header: { type: "image" },
          },
          provider_timestamp: sentAt.toISOString(),
          created_at: sentAt.toISOString(),
        });
        if (insertError) throw insertError;
        inserted += 1;
      } catch (error) {
        errors.push({ index: index + 1, error: safeErrorMessage(error) });
      }
    }

    await supabase.from("message_audit_logs").insert({
      actor_id: null,
      operator_key: operatorKey,
      action: "message_history_reconciled",
      metadata: { template: templateName, origin_list: originList, received: rows.length, inserted, duplicates, contacts_matched: contactsMatched, errors: errors.length },
    });

    return json(request, { ok: errors.length === 0, received: rows.length, inserted, duplicates, contactsMatched, errors });
  } catch (error) {
    return json(request, { ok: false, error: safeErrorMessage(error) }, 400);
  }
});
