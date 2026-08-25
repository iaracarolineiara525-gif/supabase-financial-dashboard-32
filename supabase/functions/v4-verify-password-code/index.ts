import { adminClient, json, noContent, requiredEnv, safeErrorMessage, sha256Hex } from "../_shared/meta.ts";

const RECOVERY_EMAIL = "iara.silva@v4company.com";
const MAX_ATTEMPTS = 5;

function stringValue(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function createVerificationToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  try {
    const body = await request.json();
    const email = stringValue(body.email, "email").toLowerCase();
    const code = stringValue(body.code, "code").replace(/\s/g, "");
    if (email !== RECOVERY_EMAIL || !/^\d{6}$/.test(code)) return json(request, { ok: false, error: "Código inválido ou expirado." }, 400);

    const codeHash = await sha256Hex(`${RECOVERY_EMAIL}:${code}:${requiredEnv("V4_RECOVERY_CODE_PEPPER")}`);
    const supabase = adminClient();
    const { data: recovery, error } = await supabase.rpc("v4_verify_password_code", { p_email: RECOVERY_EMAIL, p_code_hash: codeHash, p_max_attempts: MAX_ATTEMPTS });
    if (error || !recovery?.valid) return json(request, { ok: false, error: "Código inválido ou expirado." }, 400);

    const verificationToken = createVerificationToken();
    const tokenHash = await sha256Hex(`${RECOVERY_EMAIL}:${verificationToken}:${requiredEnv("V4_RECOVERY_CODE_PEPPER")}`);
    const { error: updateError } = await supabase.from("v4_password_recovery_codes").update({ verification_token_hash: tokenHash }).eq("id", recovery.recovery_id);
    if (updateError) throw updateError;

    return json(request, { ok: true, verificationToken, expiresInMinutes: 10, message: "Código validado. Crie uma nova senha na V4." });
  } catch (error) {
    return json(request, { ok: false, error: safeErrorMessage(error) }, 400);
  }
});
