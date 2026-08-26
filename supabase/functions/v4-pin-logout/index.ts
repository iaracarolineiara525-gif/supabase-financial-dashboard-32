import { adminClient, json, noContent, sha256Hex } from "../_shared/meta.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  const sessionToken = request.headers.get("x-v4-pin-session")?.trim();
  if (sessionToken) {
    await adminClient().rpc("v4_pin_revoke_session", { p_session_hash: await sha256Hex(sessionToken) });
    await adminClient().from("message_audit_logs").insert({ actor_id: null, operator_key: "primary", action: "v4_pin_logout", metadata: {} });
  }
  return json(request, { ok: true });
});
