import { requiredEnv } from "./meta.ts";

export async function sendV4RecoveryEmail(input: { to: string; code: string; expiresInMinutes: number }) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const smtpUrl = Deno.env.get("V4_EMAIL_PROVIDER_URL");
  const from = Deno.env.get("V4_EMAIL_FROM") || "V4 <iara.silva@v4company.com>";
  const replyTo = Deno.env.get("V4_EMAIL_REPLY_TO") || "iara.silva@v4company.com";

  const subject = "Código de recuperação — V4";
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#0b0b0d;color:#fff;font-family:Arial,sans-serif"><div style="max-width:560px;margin:40px auto;padding:40px;background:#151519;border:1px solid #2b2b32;border-radius:20px"><div style="height:5px;background:#e11d2e;border-radius:4px;margin:-40px -40px 32px"></div><p style="margin:0 0 24px;color:#e11d2e;font-size:22px;font-weight:800;letter-spacing:.12em">V4</p><h1 style="font-size:28px;margin:0 0 12px">Código de recuperação</h1><p style="color:#b6b6bf;line-height:1.6">Use o código abaixo na plataforma V4 para redefinir sua senha. Ele expira em ${input.expiresInMinutes} minutos e pode ser usado uma única vez.</p><div style="margin:28px 0;padding:22px;text-align:center;background:#0b0b0d;border:1px solid #e11d2e;border-radius:14px;font-size:34px;font-weight:800;letter-spacing:.28em;color:#fff">${input.code}</div><p style="color:#777783;font-size:13px;line-height:1.5">Se você não solicitou essa recuperação, ignore este e-mail. A V4 nunca solicitará seu código por resposta.</p></div></body></html>`;

  if (resendApiKey) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [input.to], reply_to: replyTo, subject, html }),
    });
    if (!response.ok) throw new Error("Recovery email provider rejected the request");
    return;
  }

  if (smtpUrl) {
    const response = await fetch(smtpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${requiredEnv("V4_EMAIL_PROVIDER_TOKEN")}` },
      body: JSON.stringify({ from, to: input.to, replyTo, subject, html }),
    });
    if (!response.ok) throw new Error("V4 email provider rejected the request");
    return;
  }

  throw new Error("No V4 email provider configured");
}
