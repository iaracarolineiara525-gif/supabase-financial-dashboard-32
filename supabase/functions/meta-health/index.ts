import { adminClient, isTestMode, json, metaRequest, noContent, requireUser, safeErrorMessage } from "../_shared/meta.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  try {
    const user = await requireUser(request);
    const { data: phone } = await metaRequest(`/${Deno.env.get("META_PHONE_NUMBER_ID")}?fields=id,display_phone_number,verified_name,quality_rating`);
    const { data: account } = await metaRequest(`/${Deno.env.get("META_WABA_ID")}?fields=id,name`);

    const supabase = adminClient();
    await supabase.from("message_audit_logs").insert({
      actor_id: user.id,
      action: "meta_connection_test",
      metadata: { test_mode: isTestMode(), phone_id: Deno.env.get("META_PHONE_NUMBER_ID"), success: true },
    });

    return json(request, {
      ok: true,
      testMode: isTestMode(),
      phone,
      account,
      message: "Meta API authentication and account access verified without sending a message.",
    });
  } catch (error) {
    const safeMessage = safeErrorMessage(error);
    try {
      const user = await requireUser(request);
      await adminClient().from("message_audit_logs").insert({
        actor_id: user.id,
        action: "meta_connection_test_failed",
        metadata: { test_mode: isTestMode(), error: safeMessage },
      });
    } catch {
      // Do not replace the useful API error with a logging error.
    }
    return json(request, { ok: false, error: safeMessage }, 400);
  }
});
