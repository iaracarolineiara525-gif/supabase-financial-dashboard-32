import { adminClient, isE164, json, noContent, normalizePhone, phoneDigits, requirePinRole, safeErrorMessage } from "../_shared/meta.ts";

const MAX_ROWS = 500;
const MAX_NAME_LENGTH = 160;
const MAX_EMAIL_LENGTH = 320;
const ALLOWED_CONSENT = new Set(["consented", "pending", "revoked"]);
const ALLOWED_CONSENT_CATEGORIES = new Set(["all", "utility", "marketing", "authentication"]);

type ImportRow = {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  group?: unknown;
  consent?: unknown;
  consentSource?: unknown;
  consentCategory?: unknown;
  consentNoticeVersion?: unknown;
  consentChannel?: unknown;
};

function textValue(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function consentValue(value: unknown): "consented" | "pending" | "revoked" {
  const valueText = textValue(value, 32).toLowerCase();
  if (["consentido", "consented", "sim", "yes", "true", "opt_in", "opt-in"].includes(valueText)) return "consented";
  if (["descadastrado", "revoked", "revogado", "não", "nao", "no", "opt_out", "opt-out"].includes(valueText)) return "revoked";
  return "pending";
}

function normalizeConsentCategory(value: unknown): string {
  const normalized = textValue(value, 24).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const aliases: Record<string, string> = {
    todos: "all",
    todas: "all",
    qualquer: "all",
    utilidade: "utility",
    utilitario: "utility",
    utilitaria: "utility",
    promocao: "marketing",
    promotion: "marketing",
    promotional: "marketing",
    autenticacao: "authentication",
    auth: "authentication",
  };
  return aliases[normalized] || normalized || "all";
}

function validateRow(row: ImportRow, rowNumber: number) {
  const name = textValue(row.name, MAX_NAME_LENGTH);
  const rawPhone = textValue(row.phone, 40);
  const phone = normalizePhone(rawPhone);
  const email = textValue(row.email, MAX_EMAIL_LENGTH) || null;
  const group = textValue(row.group, 120) || null;
  const consent = consentValue(row.consent);
  const consentSource = textValue(row.consentSource, 120) || "excel_import";
  const consentCategoryValue = normalizeConsentCategory(row.consentCategory);
  const consentNoticeVersion = textValue(row.consentNoticeVersion, 120) || null;
  const consentChannel = textValue(row.consentChannel, 80) || "excel_import";

  if (!name) throw new Error(`Row ${rowNumber}: name is required`);
  if (!isE164(phone)) throw new Error(`Row ${rowNumber}: phone must use international E.164 format`);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Row ${rowNumber}: invalid email`);
  if (!ALLOWED_CONSENT.has(consent)) throw new Error(`Row ${rowNumber}: invalid consent status`);
  if (!ALLOWED_CONSENT_CATEGORIES.has(consentCategoryValue)) throw new Error(`Row ${rowNumber}: invalid consent category`);

  return {
    full_name: name,
    phone_e164: phoneDigits(phone),
    email,
    group_name: group,
    source: "excel_import",
    consent_status: consent,
    consent_at: consent === "consented" ? new Date().toISOString() : null,
    consent_source: consentSource,
    consent_category: consentCategoryValue,
    consent_notice_version: consentNoticeVersion,
    consent_channel: consentChannel,
    consent_metadata: { imported: true, source: consentSource },
    opt_out_at: consent === "revoked" ? new Date().toISOString() : null,
    subscription_status: consent === "revoked" ? "unsubscribed" : "active",
    updated_at: new Date().toISOString(),
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "POST") return json(request, { ok: false, error: "Method not allowed" }, 405);

  try {
    const session = await requirePinRole(request, ["owner", "admin", "operator"]);
    const body = await request.json() as { rows?: ImportRow[]; source?: string };
    if (!Array.isArray(body.rows) || body.rows.length === 0) throw new Error("rows is required");
    if (body.rows.length > MAX_ROWS) throw new Error(`A batch can contain at most ${MAX_ROWS} rows`);

    const validRows = body.rows.map((row, index) => validateRow(row || {}, index + 2));
    const deduplicated = Array.from(new Map(validRows.map((row) => [row.phone_e164, row])).values());
    const duplicateRows = validRows.length - deduplicated.length;
    const supabase = adminClient();
    const phones = deduplicated.map((row) => row.phone_e164);

    const { data: suppressed, error: suppressionError } = await supabase.from("message_suppression").select("phone_e164").in("phone_e164", phones);
    if (suppressionError) throw suppressionError;
    const suppressedPhones = new Set((suppressed || []).map((row) => row.phone_e164));
    const importable = deduplicated.filter((row) => !suppressedPhones.has(row.phone_e164));
    const blockedBySuppression = deduplicated.length - importable.length;

    const { data: existing, error: existingError } = await supabase.from("message_contacts").select("id, phone_e164").is("owner_id", null).in("phone_e164", importable.map((row) => row.phone_e164));
    if (existingError) throw existingError;
    const existingByPhone = new Map((existing || []).map((row) => [row.phone_e164, row.id]));

    let created = 0;
    let updated = 0;
    for (const row of importable) {
      const existingId = existingByPhone.get(row.phone_e164);
      const query = existingId
        ? supabase.from("message_contacts").update(row).eq("id", existingId).is("owner_id", null)
        : supabase.from("message_contacts").insert({ owner_id: null, ...row });
      const { error } = await query;
      if (error) throw error;
      if (existingId) updated += 1;
      else created += 1;
    }

    await supabase.from("message_audit_logs").insert({
      actor_id: null,
      operator_key: session.operatorKey,
      action: "message_contacts_imported",
      metadata: { received: body.rows.length, deduplicated: deduplicated.length, created, updated, blocked_by_suppression: blockedBySuppression, duplicate_rows: duplicateRows, consent_provenance: true },
    });

    return json(request, {
      ok: true,
      received: body.rows.length,
      created,
      updated,
      duplicateRows,
      blockedBySuppression,
      notice: "Contatos importados com validação E.164. Registros de supressão foram ignorados.",
    });
  } catch (error) {
    return json(request, { ok: false, error: safeErrorMessage(error) }, 400);
  }
});
