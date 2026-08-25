import { adminClient, json, noContent, requiredEnv, safeErrorMessage, sha256Hex } from "../_shared/meta.ts";
import { sendV4RecoveryEmail } from "../_shared/v4-email.ts";

const RECOVERY_EMAIL = "iara.silva@v4company.com";
const CODE_LENGTH = 6;
const EXPIRES_IN_MINUTES = 10;

function createCode(): string {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1_000_000).padStart(CODE_LENGTH, "0");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const requestedEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (requestedEmail && requestedEmail !== RECOVERY_EMAIL) return json(request, { ok: true, message: "Se o endereço estiver habilitado, o código será enviado." });

    const supabase = adminClient();
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    const { count } = await supabase.from("v4_password_recovery_codes").select("id", { count: "exact", head: true }).eq("email", RECOVERY_EMAIL).gte("created_at", cutoff);
    if ((count || 0) >= 1) return json(request, { ok: true, message: "Um código recente já foi enviado. Aguarde um minuto para solicitar outro." }, 429);

    const code = createCode();
    const codeHash = await sha256Hex(`${RECOVERY_EMAIL}:${code}:${requiredEnv("V4_RECOVERY_CODE_PEPPER")}`);
    await supabase.from("v4_password_recovery_codes").update({ used_at: new Date().toISOString() }).eq("email", RECOVERY_EMAIL).is("used_at", null);
    const { error: insertError } = await supabase.from("v4_password_recovery_codes").insert({ email: RECOVERY_EMAIL, code_hash: codeHash, expires_at: new Date(Date.now() + EXPIRES_IN_MINUTES * 60_000).toISOString() });
    if (insertError) throw insertError;

    await sendV4RecoveryEmail({ to: RECOVERY_EMAIL, code, expiresInMinutes: EXPIRES_IN_MINUTES });
    return json(request, { ok: true, message: "Código enviado para o e-mail de recuperação da V4." });
  } catch (error) {
    return json(request, { ok: false, error: safeErrorMessage(error) }, 400);
  }
});
