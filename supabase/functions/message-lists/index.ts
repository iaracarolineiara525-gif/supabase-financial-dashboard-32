import { adminClient, json, noContent, requirePinRole, safeErrorMessage } from "../_shared/meta.ts";
import { maskPhoneDigits, normalizeBrazilPhone } from "../_shared/phone.ts";

const MAX_ROWS = 5000;

type IncomingRow = { name?: unknown; phone?: unknown };

function cleanName(value: unknown, fallback: string): string {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!name) return fallback;
  // Nunca aceita nomes genéricos gerados automaticamente por importações antigas
  if (/^contato\s*\d+$/i.test(name)) return fallback;
  return name.slice(0, 120);
}


async function listOverview(supabase: ReturnType<typeof adminClient>) {
  const { data: lists, error } = await supabase
    .from("message_lists")
    .select("id, name, description, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const { data: memberships, error: membershipError } = await supabase
    .from("message_contact_lists")
    .select("list_name, contact_id, message_contacts!inner(phone_valid, subscription_status)")
    .limit(20000);
  if (membershipError) throw membershipError;

  const stats = new Map<string, { total: number; valid: number; invalid: number }>();
  for (const row of (memberships || []) as Array<Record<string, unknown>>) {
    const key = String(row.list_name ?? "").toLowerCase();
    const contact = row.message_contacts as Record<string, unknown> | null;
    const bucket = stats.get(key) || { total: 0, valid: 0, invalid: 0 };
    bucket.total += 1;
    if (contact?.phone_valid !== false && contact?.subscription_status !== "unsubscribed") bucket.valid += 1;
    else bucket.invalid += 1;
    stats.set(key, bucket);
  }

  return (lists || []).map((list: Record<string, unknown>) => {
    const bucket = stats.get(String(list.name ?? "").toLowerCase()) || { total: 0, valid: 0, invalid: 0 };
    return { ...list, ...bucket };
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "POST") return json(request, { ok: false, error: "Method not allowed" }, 405);

  try {
    const session = await requirePinRole(request, ["owner", "admin", "operator", "viewer"]);
    const supabase = adminClient();
    let body: Record<string, unknown> = {};
    try { body = await request.json() as Record<string, unknown>; } catch { body = {}; }
    const action = typeof body.action === "string" ? body.action : "overview";

    if (action === "overview") {
      return json(request, { ok: true, lists: await listOverview(supabase), fetchedAt: new Date().toISOString() });
    }

    if (action === "members") {
      const listName = String(body.listName ?? "").trim();
      if (!listName) throw new Error("listName is required");
      const { data, error } = await supabase
        .from("message_contact_lists")
        .select("added_at, source, message_contacts!inner(id, full_name, phone_e164, phone_valid, subscription_status, last_sent_at)")
        .ilike("list_name", listName)
        .order("added_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const members = (data || []).map((row: Record<string, unknown>) => {
        const contact = (row.message_contacts || {}) as Record<string, unknown>;
        return {
          id: contact.id,
          name: contact.full_name,
          phone: maskPhoneDigits(contact.phone_e164),
          valid: contact.phone_valid !== false && contact.subscription_status !== "unsubscribed",
          addedAt: row.added_at,
          source: row.source,
          lastSentAt: contact.last_sent_at ?? null,
        };
      });
      return json(request, { ok: true, members, total: members.length });
    }

    if (session.role === "viewer") throw new Error("Insufficient operator permissions");

    if (action === "create") {
      const name = String(body.name ?? "").trim().slice(0, 120);
      if (name.length < 2) throw new Error("Informe um nome de lista com pelo menos 2 caracteres");
      const description = String(body.description ?? "").trim().slice(0, 400) || null;
      const { data: existing } = await supabase.from("message_lists").select("id, name").ilike("name", name).maybeSingle();
      if (existing) return json(request, { ok: true, list: existing, duplicate: true });
      const { data, error } = await supabase.from("message_lists").insert({ name, description }).select("id, name, description").single();
      if (error) throw error;
      await supabase.from("message_audit_logs").insert({ operator_key: session.operatorKey, action: "message_list_created", metadata: { list: name } });
      return json(request, { ok: true, list: data });
    }

    if (action === "add") {
      const listName = String(body.listName ?? "").trim().slice(0, 120);
      if (listName.length < 2) throw new Error("Selecione ou crie uma lista antes de adicionar contatos");
      const incoming = Array.isArray(body.rows) ? (body.rows as IncomingRow[]).slice(0, MAX_ROWS) : [];
      if (incoming.length === 0) throw new Error("Nenhum contato recebido");
      const source = String(body.source ?? "upload").slice(0, 40);

      // garante que a lista existe
      const { data: list } = await supabase.from("message_lists").select("id, name").ilike("name", listName).maybeSingle();
      let resolvedName = list?.name as string | undefined;
      if (!resolvedName) {
        const { data: created, error: createError } = await supabase.from("message_lists").insert({ name: listName }).select("name").single();
        if (createError) throw createError;
        resolvedName = created.name as string;
      }

      const seen = new Set<string>();
      const invalid: Array<{ name: string; phone: string; reason: string }> = [];
      const valid: Array<{ name: string; digits: string }> = [];
      incoming.forEach((row) => {
        const normalized = normalizeBrazilPhone(row.phone);
        const name = cleanName(row.name, "");
        if (!normalized.valid) {
          if (invalid.length < 50) invalid.push({ name, phone: String(row.phone ?? ""), reason: normalized.reason || "Telefone inválido" });
          return;
        }
        if (seen.has(normalized.digits)) return;
        seen.add(normalized.digits);
        valid.push({ name: name || normalized.e164, digits: normalized.digits });
      });


      const invalidCount = incoming.length - valid.length - (incoming.length - valid.length - invalid.length >= 0 ? 0 : 0);
      const duplicatesInFile = incoming.length - valid.length - invalid.length;

      let created = 0;
      let updated = 0;
      let linked = 0;

      for (let start = 0; start < valid.length; start += 200) {
        const chunk = valid.slice(start, start + 200);
        const phones = chunk.map((row) => row.digits);
        const { data: existingContacts, error: existingError } = await supabase
          .from("message_contacts")
          .select("id, phone_e164, full_name")
          .in("phone_e164", phones);
        if (existingError) throw existingError;
        const byPhone = new Map<string, Record<string, unknown>>();
        for (const contact of (existingContacts || []) as Array<Record<string, unknown>>) byPhone.set(String(contact.phone_e164), contact);

        const toInsert = chunk.filter((row) => !byPhone.has(row.digits)).map((row) => ({
          full_name: row.name,
          phone_e164: row.digits,
          phone_valid: true,
          group_name: resolvedName,
          source,
          consent_status: "consented",
          consent_category: "all",
          consent_channel: "lista",
          consent_source: source,
          consent_at: new Date().toISOString(),
          subscription_status: "active",
        }));

        if (toInsert.length > 0) {
          const { data: insertedRows, error: insertError } = await supabase.from("message_contacts").insert(toInsert).select("id, phone_e164");
          if (insertError) throw insertError;
          created += insertedRows?.length || 0;
          for (const contact of (insertedRows || []) as Array<Record<string, unknown>>) byPhone.set(String(contact.phone_e164), contact);
        }

        // Mantém o nome real: corrige cadastros antigos com nome genérico ou vazio
        const preexisting = new Set((existingContacts || []).map((contact: Record<string, unknown>) => String(contact.phone_e164)));
        for (const row of chunk) {
          if (!preexisting.has(row.digits)) continue;
          const existing = byPhone.get(row.digits);
          if (!existing?.id) continue;
          const currentName = String(existing.full_name ?? "").trim();
          const isGeneric = !currentName || /^contato\s*\d+$/i.test(currentName) || currentName.replace(/\D/g, "") === row.digits;
          const incomingName = row.name && row.name !== `+${row.digits}` ? row.name : "";
          if (isGeneric && incomingName && incomingName !== currentName) {
            await supabase.from("message_contacts").update({ full_name: incomingName, updated_at: new Date().toISOString() }).eq("id", existing.id as string);
          }
        }

        updated += chunk.length - toInsert.length;

        const links = chunk
          .map((row) => byPhone.get(row.digits))
          .filter(Boolean)
          .map((contact) => ({ contact_id: (contact as Record<string, unknown>).id, list_name: resolvedName, source }));

        for (const link of links) {
          const { data: existingLink } = await supabase
            .from("message_contact_lists")
            .select("id")
            .eq("contact_id", link.contact_id as string)
            .ilike("list_name", resolvedName as string)
            .maybeSingle();
          if (existingLink) continue;
          const { error: linkError } = await supabase.from("message_contact_lists").insert(link);
          if (!linkError) linked += 1;
        }
      }

      await supabase.from("message_audit_logs").insert({
        operator_key: session.operatorKey,
        action: "message_list_contacts_added",
        metadata: { list: resolvedName, received: incoming.length, valid: valid.length, invalid: invalid.length, created, linked },
      });

      return json(request, {
        ok: true,
        list: resolvedName,
        received: incoming.length,
        valid: valid.length,
        invalid: invalid.length,
        duplicates: Math.max(0, duplicatesInFile),
        created,
        existing: updated,
        linked,
        invalidSamples: invalid.slice(0, 20),
        invalidCount,
      });
    }

    if (action === "updateContact") {
      const contactId = String(body.contactId ?? "").trim();
      if (!contactId) throw new Error("Contato não informado");
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const name = cleanName(body.name, "");
      if (name) patch.full_name = name;
      if (typeof body.phone === "string" && body.phone.trim()) {
        const normalized = normalizeBrazilPhone(body.phone);
        if (!normalized.valid) throw new Error(normalized.reason || "Telefone inválido");
        const { data: clash } = await supabase.from("message_contacts").select("id").eq("phone_e164", normalized.digits).neq("id", contactId).maybeSingle();
        if (clash) throw new Error("Já existe outro contato com este telefone");
        patch.phone_e164 = normalized.digits;
        patch.phone_valid = true;
      }
      const { error } = await supabase.from("message_contacts").update(patch).eq("id", contactId);
      if (error) throw error;
      await supabase.from("message_audit_logs").insert({ operator_key: session.operatorKey, action: "message_contact_updated", metadata: { contactId } });
      return json(request, { ok: true });
    }

    if (action === "removeContact") {
      const contactId = String(body.contactId ?? "").trim();
      const listName = String(body.listName ?? "").trim();
      if (!contactId) throw new Error("Contato não informado");
      if (body.deleteContact === true) {
        await supabase.from("message_contact_lists").delete().eq("contact_id", contactId);
        const { error } = await supabase.from("message_contacts").delete().eq("id", contactId);
        if (error) throw error;
      } else {
        if (!listName) throw new Error("Lista não informada");
        const { error } = await supabase.from("message_contact_lists").delete().eq("contact_id", contactId).ilike("list_name", listName);
        if (error) throw error;
      }
      await supabase.from("message_audit_logs").insert({ operator_key: session.operatorKey, action: "message_contact_removed", metadata: { contactId, list: listName, deleted: body.deleteContact === true } });
      return json(request, { ok: true });
    }

    if (action === "deleteList") {
      const listName = String(body.listName ?? "").trim();
      if (!listName) throw new Error("Lista não informada");
      const deleteContacts = body.deleteContacts === true;
      const { data: links } = await supabase.from("message_contact_lists").select("contact_id").ilike("list_name", listName).limit(20000);
      const contactIds = (links || []).map((row: Record<string, unknown>) => String(row.contact_id));
      const { error: linkError } = await supabase.from("message_contact_lists").delete().ilike("list_name", listName);
      if (linkError) throw linkError;
      if (deleteContacts && contactIds.length > 0) {
        for (let start = 0; start < contactIds.length; start += 200) {
          const chunk = contactIds.slice(start, start + 200);
          const { data: stillLinked } = await supabase.from("message_contact_lists").select("contact_id").in("contact_id", chunk);
          const keep = new Set((stillLinked || []).map((row: Record<string, unknown>) => String(row.contact_id)));
          const removable = chunk.filter((id) => !keep.has(id));
          if (removable.length > 0) await supabase.from("message_contacts").delete().in("id", removable);
        }
      }
      const { error } = await supabase.from("message_lists").delete().ilike("name", listName);
      if (error) throw error;
      await supabase.from("message_audit_logs").insert({ operator_key: session.operatorKey, action: "message_list_deleted", metadata: { list: listName, contacts: contactIds.length, deleteContacts } });
      return json(request, { ok: true, removedLinks: contactIds.length });
    }

    throw new Error("Ação não suportada");
  } catch (error) {
    return json(request, { ok: false, error: safeErrorMessage(error) }, 400);
  }
});
