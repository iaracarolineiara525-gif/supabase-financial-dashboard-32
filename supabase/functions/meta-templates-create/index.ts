import { adminClient, isTestMode, json, metaRequest, noContent, requiredEnv, requirePinRole, safeErrorMessage } from "../_shared/meta.ts";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function validateTemplate(body: Record<string, unknown>) {
  const name = requiredString(body.name, "name");
  const language = requiredString(body.language, "language");
  const category = requiredString(body.category, "category").toLowerCase();
  const parameterFormat = typeof body.parameter_format === "string" ? body.parameter_format : "positional";
  const components = body.components;

  if (!/^[a-z0-9_]{1,512}$/.test(name)) throw new Error("name must use lowercase letters, numbers and underscores");
  if (!/^[a-z]{2}_[A-Z]{2}(?:_[A-Z0-9]+)?$/.test(language)) throw new Error("language must use a Meta locale such as pt_BR");
  if (!["marketing", "utility", "authentication"].includes(category)) throw new Error("category must be marketing, utility or authentication");
  if (!["positional", "named"].includes(parameterFormat)) throw new Error("parameter_format must be positional or named");
  if (!Array.isArray(components) || components.length === 0 || components.length > 10) throw new Error("components must contain between 1 and 10 items");
  if (components.some((component) => !component || typeof component !== "object" || typeof (component as Record<string, unknown>).type !== "string")) throw new Error("each component needs a type");

  const payload = { name, language, category, parameter_format: parameterFormat, components };
  if (JSON.stringify(payload).length > 25000) throw new Error("template payload is too large");
  return payload;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "POST") return json(request, { ok: false, error: "Method not allowed" }, 405);

  try {
    const session = await requirePinRole(request, ["owner", "admin"]);
    const body = await request.json() as Record<string, unknown>;
    const payload = validateTemplate(body);
    const supabase = adminClient();
    const wabaId = requiredEnv("META_WABA_ID");
    const dryRun = isTestMode();

    if (dryRun) {
      await supabase.from("message_audit_logs").insert({
        actor_id: null,
        operator_key: session.operatorKey,
        action: "meta_template_submission_dry_run",
        metadata: { name: payload.name, language: payload.language, category: payload.category },
      });
      return json(request, { ok: true, dryRun: true, submitted: false, payload, notice: "Modo de teste ativo. Nenhum template foi enviado para a Meta." });
    }

    const { data } = await metaRequest(`/${wabaId}/message_templates`, { method: "POST", body: JSON.stringify(payload) });
    await supabase.from("message_audit_logs").insert({
      actor_id: null,
      operator_key: session.operatorKey,
      action: "meta_template_submitted",
      metadata: { name: payload.name, language: payload.language, category: payload.category, template_id: data.id || null },
    });
    return json(request, { ok: true, dryRun: false, submitted: true, template: data });
  } catch (error) {
    return json(request, { ok: false, error: safeErrorMessage(error) }, 400);
  }
});
