import { json, metaRequest, noContent, requirePinSession, requiredEnv, safeErrorMessage } from "../_shared/meta.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "GET" && request.method !== "POST") return json(request, { ok: false, error: "Method not allowed" }, 405);

  try {
    await requirePinSession(request);
    const wabaId = requiredEnv("META_WABA_ID");
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 200);
    const after = url.searchParams.get("after");
    const query = new URLSearchParams({
      fields: "id,name,language,category,status,quality_score,components,parameter_format",
      limit: String(limit),
    });
    if (after) query.set("after", after);

    const { data } = await metaRequest(`/${wabaId}/message_templates?${query.toString()}`);
    const templates = Array.isArray(data.data) ? data.data : [];
    return json(request, {
      ok: true,
      source: "meta",
      templates,
      paging: data.paging || null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return json(request, { ok: false, error: safeErrorMessage(error) }, 400);
  }
});
