import { adminClient, isTestMode, json, metaRequest, noContent, requirePinSession, requiredEnv, safeErrorMessage } from "../_shared/meta.ts";

type HealthResource = {
  ok: boolean;
  data: Record<string, unknown> | null;
  error?: string;
};

async function readMetaResource(path: string): Promise<HealthResource> {
  try {
    const { data } = await metaRequest(path);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, data: null, error: safeErrorMessage(error) };
  }
}

async function subscribeWaba(wabaId: string): Promise<HealthResource> {
  try {
    const { data } = await metaRequest(`/${wabaId}/subscribed_apps`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, data: null, error: safeErrorMessage(error) };
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  let session: Awaited<ReturnType<typeof requirePinSession>> | null = null;
  try {
    session = await requirePinSession(request);
    const phoneId = requiredEnv("META_PHONE_NUMBER_ID");
    const wabaId = requiredEnv("META_WABA_ID");
    let body: Record<string, unknown> = {};
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      body = {};
    }
    const repairWebhook = body.repairWebhook === true;

    const [phoneResult, accountResult, subscriptionResult] = await Promise.all([
      readMetaResource(`/${phoneId}?fields=id,display_phone_number,verified_name,status,quality_rating,code_verification_status`),
      readMetaResource(`/${wabaId}?fields=id,name`),
      readMetaResource(`/${wabaId}/subscribed_apps`),
    ]);

    let repairedSubscription: HealthResource | null = null;
    if (repairWebhook && (!subscriptionResult.ok || !Array.isArray(subscriptionResult.data?.data) || subscriptionResult.data.data.length === 0)) {
      repairedSubscription = await subscribeWaba(wabaId);
    }

    const subscriptionData = repairedSubscription?.ok ? repairedSubscription.data : subscriptionResult.data;
    const webhookSubscribed = Boolean(subscriptionResult.ok && Array.isArray(subscriptionResult.data?.data) && subscriptionResult.data.data.length > 0) || Boolean(repairedSubscription?.ok);
    const checks = {
      phone: phoneResult.ok,
      account: accountResult.ok,
      webhook: webhookSubscribed,
      credentials: phoneResult.ok || accountResult.ok,
    };
    const errors = [
      phoneResult.error ? `Número WhatsApp: ${phoneResult.error}` : null,
      accountResult.error ? `Conta WhatsApp: ${accountResult.error}` : null,
      !webhookSubscribed ? (repairedSubscription?.error || subscriptionResult.error || "WABA sem aplicativo inscrito para receber eventos") : null,
    ].filter((value): value is string => Boolean(value));
    const ok = phoneResult.ok && accountResult.ok && webhookSubscribed;
    const supabase = adminClient();
    await supabase.from("message_audit_logs").insert({
      actor_id: null,
      operator_key: session.operatorKey,
      action: ok ? "meta_connection_test" : "meta_connection_test_failed",
      metadata: { test_mode: isTestMode(), phone_id: phoneId, success: ok, checks, errors, repair_webhook: repairWebhook, session_expires_at: session.expiresAt },
    });

    return json(request, {
      ok,
      testMode: isTestMode(),
      phone: phoneResult.data,
      account: accountResult.data,
      webhook: { subscribed: webhookSubscribed, details: subscriptionData },
      checks,
      errors,
      message: ok
        ? "Meta API, conta, número e inscrição do webhook verificados sem enviar mensagem."
        : "Diagnóstico da Meta concluído; a inscrição do webhook ou outro item requer correção. Nenhuma mensagem foi enviada.",
    });
  } catch (error) {
    const safeMessage = safeErrorMessage(error);
    try {
      await adminClient().from("message_audit_logs").insert({
        actor_id: null,
        operator_key: session?.operatorKey || "unknown",
        action: "meta_connection_test_failed",
        metadata: { test_mode: isTestMode(), error: safeMessage },
      });
    } catch {
      // Keep the external response generic if audit logging fails.
    }
    return json(request, { ok: false, testMode: isTestMode(), checks: { phone: false, account: false, webhook: false, credentials: false }, errors: [safeMessage], error: safeMessage, message: "Não foi possível concluir o diagnóstico da Meta. Nenhuma mensagem foi enviada." }, 200);
  }
});
