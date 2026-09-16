import { adminClient, json, noContent, requirePinRole, safeErrorMessage } from "../_shared/meta.ts";

const MAX_ROWS = 200;

function maskPhone(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 6) return "—";
  return `+${digits.slice(0, 4)}•••••${digits.slice(-4)}`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "GET" && request.method !== "POST") return json(request, { ok: false, error: "Method not allowed" }, 405);

  try {
    const session = await requirePinRole(request, ["owner", "admin", "operator", "viewer"]);
    let body: Record<string, unknown> = {};
    if (request.method === "POST") {
      try { body = await request.json() as Record<string, unknown>; } catch { body = {}; }
    }
    const url = new URL(request.url);
    const limitRaw = Number(body.limit ?? url.searchParams.get("limit") ?? MAX_ROWS);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), MAX_ROWS) : MAX_ROWS;

    const supabase = adminClient();
    const { data, error } = await supabase
      .from("message_outbox")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    const rows = (data || []).map((row: Record<string, unknown>) => ({
      id: row.id,
      createdAt: row.created_at,
      sentAt: row.sent_at ?? null,
      to: maskPhone(row.to_phone_e164),
      messageType: row.message_type ?? "text",
      templateName: row.template_name ?? null,
      preview: typeof row.body_preview === "string" ? row.body_preview.slice(0, 160) : "",
      status: row.status ?? "pending",
      dryRun: Boolean(row.dry_run),
      externalId: row.external_id ?? null,
      lastError: row.last_error ?? null,
      operatorKey: row.operator_key ?? null,
    }));

    const totals = {
      total: rows.length,
      real: rows.filter((row) => !row.dryRun).length,
      simulated: rows.filter((row) => row.dryRun).length,
      failed: rows.filter((row) => String(row.status).toLowerCase() === "falhou").length,
      accepted: rows.filter((row) => ["processando", "enviada", "entregue", "lida"].includes(String(row.status).toLowerCase())).length,
      lastSendAt: rows.find((row) => row.sentAt)?.sentAt ?? null,
    };

    await supabase.from("message_audit_logs").insert({ actor_id: null, operator_key: session.operatorKey, action: "message_outbox_viewed", metadata: { returned: rows.length } });

    return json(request, { ok: true, rows, totals, fetchedAt: new Date().toISOString() });
  } catch (error) {
    return json(request, { ok: false, error: safeErrorMessage(error) }, 400);
  }
});
