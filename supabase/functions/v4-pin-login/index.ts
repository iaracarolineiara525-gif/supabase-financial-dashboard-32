import { adminClient, json, noContent, requiredEnv, sha256Hex } from "../_shared/meta.ts";

function requestFingerprint(request: Request): Promise<string> {
  const clientId = request.headers.get("x-v4-client-id")?.trim();
  if (clientId && /^[a-zA-Z0-9._:-]{16,120}$/.test(clientId)) return sha256Hex(`client:${clientId}`);
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("cf-connecting-ip") || "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";
  return sha256Hex(`${forwarded}|${userAgent}`);
}

function token(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const pin = typeof body.pin === "string" ? body.pin.trim() : "";
    if (!/^\d{6}$/.test(pin)) return json(request, { ok: false, error: "Informe um PIN de 6 dígitos." }, 400);

    const sessionToken = token();
    const pinHash = await sha256Hex(`${pin}|${requiredEnv("V4_PIN_PEPPER")}`);
    const sessionHash = await sha256Hex(sessionToken);
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    const fingerprint = await requestFingerprint(request);
    const { data, error } = await adminClient().rpc("v4_pin_login_attempt", {
      p_fingerprint: fingerprint,
      p_pin_hash: pinHash,
      p_configured_pin_hash: requiredEnv("V4_PIN_HASH"),
      p_session_hash: sessionHash,
      p_session_expires_at: expiresAt,
    });

    if (error) throw error;
    const result = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!result?.ok) {
      const locked = result?.error_code === "locked";
      return json(request, {
        ok: false,
        error: locked ? "Acesso temporariamente bloqueado. Tente novamente mais tarde." : "PIN inválido.",
        retryAfterSeconds: typeof result?.retry_after_seconds === "number" ? result.retry_after_seconds : undefined,
      }, locked ? 429 : 401);
    }

    await adminClient().from("message_audit_logs").insert({
      actor_id: null,
      action: "v4_pin_login_success",
      metadata: { fingerprint, expires_at: expiresAt },
    });

    return json(request, { ok: true, sessionToken, expiresAt });
  } catch {
    return json(request, { ok: false, error: "Não foi possível validar o acesso agora." }, 500);
  }
});
