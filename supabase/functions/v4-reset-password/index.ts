import { adminClient, json, noContent, requiredEnv, safeErrorMessage, sha256Hex } from "../_shared/meta.ts";

const RECOVERY_EMAIL = "iara.silva@v4company.com";

function stringValue(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  try {
    const body = await request.json();
    const email = stringValue(body.email, "email").toLowerCase();
    const verificationToken = stringValue(body.verificationToken, "verificationToken");
    const newPassword = stringValue(body.newPassword, "newPassword");
    if (email !== RECOVERY_EMAIL || newPassword.length < 8) throw new Error("Invalid recovery request");

    const tokenHash = await sha256Hex(`${RECOVERY_EMAIL}:${verificationToken}:${requiredEnv("V4_RECOVERY_CODE_PEPPER")}`);
    const supabase = adminClient();
    const { data: recovery } = await supabase.from("v4_password_recovery_codes").select("id").eq("email", RECOVERY_EMAIL).eq("verification_token_hash", tokenHash).is("used_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!recovery) return json(request, { ok: false, error: "Sessão de recuperação inválida ou expirada." }, 400);

    const { data: users, error: usersError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersError) throw usersError;
    const user = users.users.find((item) => item.email?.toLowerCase() === RECOVERY_EMAIL);
    if (!user) return json(request, { ok: false, error: "Conta de recuperação não encontrada." }, 404);

    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, { password: newPassword });
    if (updateError) throw updateError;
    await supabase.from("v4_password_recovery_codes").update({ used_at: new Date().toISOString() }).eq("id", recovery.id).is("used_at", null);
    await supabase.from("message_audit_logs").insert({ actor_id: user.id, action: "v4_password_reset_completed", metadata: { recovery_id: recovery.id } });

    return json(request, { ok: true, message: "Senha redefinida com sucesso. Entre novamente na V4." });
  } catch (error) {
    return json(request, { ok: false, error: safeErrorMessage(error) }, 400);
  }
});
