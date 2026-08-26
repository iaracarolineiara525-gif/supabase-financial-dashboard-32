import { json, noContent, requirePinSession, safeErrorMessage } from "../_shared/meta.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "GET" && request.method !== "POST") return json(request, { ok: false, error: "Method not allowed" }, 405);

  try {
    const session = await requirePinSession(request);
    return json(request, { ok: true, operator: { key: session.operatorKey, name: session.operatorName, role: session.role }, expiresAt: session.expiresAt });
  } catch (error) {
    return json(request, { ok: false, error: safeErrorMessage(error) }, 401);
  }
});
