import { adminClient, isTestMode, json, metaRequest, noContent, requirePinRole, requiredEnv, safeErrorMessage } from "../_shared/meta.ts";
import { maskPhoneDigits, normalizeBrazilPhone } from "../_shared/phone.ts";
import { approvedTemplateFromList, renderTemplateBody } from "../_shared/template.ts";

const BATCH_SIZE = 12;
const BACKOFF_SECONDS = [30, 120, 300];

type Recipient = Record<string, unknown>;

function nowIso() {
  return new Date().toISOString();
}

async function progressFor(supabase: ReturnType<typeof adminClient>, campaignId: string) {
  const { data, error } = await supabase
    .from("message_campaign_recipients")
    .select("status")
    .eq("campaign_id", campaignId)
    .limit(10000);
  if (error) throw error;
  const rows = (data || []) as Array<{ status: string }>;
  const count = (status: string[]) => rows.filter((row) => status.includes(String(row.status))).length;
  return {
    total: rows.length,
    pending: count(["pending", "retry"]),
    sending: count(["sending"]),
    sent: count(["sent", "delivered", "read"]),
    delivered: count(["delivered", "read"]),
    failed: count(["failed"]),
    skipped: count(["skipped"]),
  };
}

async function finalizeIfDone(supabase: ReturnType<typeof adminClient>, campaignId: string) {
  const progress = await progressFor(supabase, campaignId);
  const done = progress.pending === 0 && progress.sending === 0;
  if (done) {
    await supabase.from("message_campaigns").update({ status: "completed", completed_at: nowIso(), updated_at: nowIso() }).eq("id", campaignId).neq("status", "completed");
  }
  return { progress, done };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "POST") return json(request, { ok: false, error: "Method not allowed" }, 405);

  try {
    const session = await requirePinRole(request, ["owner", "admin", "operator", "viewer"]);
    const supabase = adminClient();
    let body: Record<string, unknown> = {};
    try { body = await request.json() as Record<string, unknown>; } catch { body = {}; }
    const action = typeof body.action === "string" ? body.action : "history";

    if (action === "history") {
      const { data: campaigns, error } = await supabase
        .from("message_campaigns")
        .select("id, name, list_name, template_name, template_language, status, total_contacts, started_at, completed_at, created_at, dry_run")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      const results = [];
      for (const campaign of (campaigns || []) as Array<Record<string, unknown>>) {
        results.push({ ...campaign, progress: await progressFor(supabase, String(campaign.id)) });
      }
      return json(request, { ok: true, campaigns: results, fetchedAt: nowIso() });
    }

    if (action === "status") {
      const campaignId = String(body.campaignId ?? "");
      if (!campaignId) throw new Error("campaignId is required");
      const { data: campaign, error } = await supabase
        .from("message_campaigns")
        .select("id, name, list_name, template_name, template_language, status, total_contacts, started_at, completed_at, created_at")
        .eq("id", campaignId)
        .maybeSingle();
      if (error) throw error;
      if (!campaign) throw new Error("Disparo não encontrado");
      const { data: recipients, error: recipientsError } = await supabase
        .from("message_campaign_recipients")
        .select("id, contact_name, phone_e164, status, attempts, last_error, sent_at, delivered_at, external_id, last_status_at, updated_at")
        .eq("campaign_id", campaignId)
        .order("updated_at", { ascending: false })
        .limit(1000);
      if (recipientsError) throw recipientsError;
      return json(request, {
        ok: true,
        campaign,
        progress: await progressFor(supabase, campaignId),
        recipients: (recipients || []).map((row: Record<string, unknown>) => ({ ...row, phone: maskPhoneDigits(row.phone_e164), phone_e164: undefined })),
        fetchedAt: nowIso(),
      });
    }

    if (session.role === "viewer") throw new Error("Insufficient operator permissions");

    if (action === "start") {
      const templateName = String(body.templateName ?? "").trim();
      const templateLanguage = String(body.templateLanguage ?? "pt_BR").trim() || "pt_BR";
      const templateCategory = String(body.templateCategory ?? "utility").trim().toLowerCase();
      const parameters = Array.isArray(body.parameters) ? (body.parameters as unknown[]).map((value) => String(value ?? "").slice(0, 500)) : [];
      if (!templateName) throw new Error("Selecione um template aprovado na Meta");

      const listName = typeof body.listName === "string" ? body.listName.trim() : "";
      const singlePhone = typeof body.phone === "string" ? body.phone.trim() : "";

      type Target = { contactId: string | null; name: string; digits: string };
      const targets: Target[] = [];

      if (listName) {
        const { data: members, error } = await supabase
          .from("message_contact_lists")
          .select("message_contacts!inner(id, full_name, phone_e164, phone_valid, subscription_status)")
          .ilike("list_name", listName)
          .limit(10000);
        if (error) throw error;
        const seen = new Set<string>();
        for (const row of (members || []) as Array<Record<string, unknown>>) {
          const contact = (row.message_contacts || {}) as Record<string, unknown>;
          const digits = String(contact.phone_e164 ?? "");
          if (!digits || contact.phone_valid === false || contact.subscription_status === "unsubscribed") continue;
          if (seen.has(digits)) continue;
          seen.add(digits);
          targets.push({ contactId: String(contact.id), name: String(contact.full_name ?? "Contato"), digits });
        }
      } else if (singlePhone) {
        const normalized = normalizeBrazilPhone(singlePhone);
        if (!normalized.valid) throw new Error(normalized.reason || "Telefone inválido");
        const { data: contact } = await supabase.from("message_contacts").select("id, full_name").eq("phone_e164", normalized.digits).maybeSingle();
        targets.push({ contactId: contact ? String(contact.id) : null, name: String(contact?.full_name ?? body.name ?? "Contato"), digits: normalized.digits });
      } else {
        throw new Error("Selecione uma lista ou informe um contato individual");
      }

      if (targets.length === 0) throw new Error("Nenhum contato válido nessa seleção");

      // remove suprimidos
      const { data: suppressed } = await supabase.from("message_suppression").select("phone_e164").limit(10000);
      const blocked = new Set((suppressed || []).map((row: Record<string, unknown>) => String(row.phone_e164)));
      const finalTargets = targets.filter((target) => !blocked.has(target.digits));
      if (finalTargets.length === 0) throw new Error("Todos os contatos da seleção estão bloqueados na lista de supressão");

      const campaignName = String(body.name ?? "").trim().slice(0, 140) || `${templateName} · ${new Date().toLocaleString("pt-BR")}`;
      const { data: listRow } = listName ? await supabase.from("message_lists").select("id, name").ilike("name", listName).maybeSingle() : { data: null };

      const { data: campaign, error: campaignError } = await supabase.from("message_campaigns").insert({
        owner_id: null,
        operator_key: session.operatorKey,
        name: campaignName,
        list_id: listRow?.id ?? null,
        list_name: listName || "Contato individual",
        template_name: templateName,
        template_language: templateLanguage,
        template_category: templateCategory,
        template_parameters: parameters,
        status: "running",
        dry_run: isTestMode(),
        total_contacts: finalTargets.length,
        started_at: nowIso(),
      }).select("id, name, list_name, template_name, total_contacts, status").single();
      if (campaignError) throw campaignError;

      const recipientRows = finalTargets.map((target) => ({
        campaign_id: campaign.id,
        contact_id: target.contactId,
        contact_name: target.name,
        phone_e164: target.digits,
        status: "pending",
        idempotency_key: `bc-${campaign.id}-${target.digits}`,
        max_attempts: 3,
        next_attempt_at: nowIso(),
      })).filter((row) => row.contact_id);

      const orphanTargets = finalTargets.filter((target) => !target.contactId);
      for (const orphan of orphanTargets) {
        const { data: contact, error: contactError } = await supabase.from("message_contacts").insert({
          full_name: orphan.name,
          phone_e164: orphan.digits,
          phone_valid: true,
          source: "disparo_individual",
          consent_status: "consented",
          consent_category: "all",
          consent_channel: "manual",
          consent_at: nowIso(),
          subscription_status: "active",
        }).select("id").single();
        if (contactError) throw contactError;
        recipientRows.push({
          campaign_id: campaign.id,
          contact_id: String(contact.id),
          contact_name: orphan.name,
          phone_e164: orphan.digits,
          status: "pending",
          idempotency_key: `bc-${campaign.id}-${orphan.digits}`,
          max_attempts: 3,
          next_attempt_at: nowIso(),
        });
      }

      for (let start = 0; start < recipientRows.length; start += 500) {
        const { error: insertError } = await supabase.from("message_campaign_recipients").insert(recipientRows.slice(start, start + 500));
        if (insertError) throw insertError;
      }

      await supabase.from("message_audit_logs").insert({
        operator_key: session.operatorKey,
        action: "message_broadcast_started",
        metadata: { campaign_id: campaign.id, template: templateName, list: listName || "individual", total: recipientRows.length },
      });

      return json(request, { ok: true, campaign, total: recipientRows.length, progress: await progressFor(supabase, String(campaign.id)) });
    }

    if (action === "run") {
      const campaignId = String(body.campaignId ?? "");
      if (!campaignId) throw new Error("campaignId is required");
      const { data: campaign, error: campaignError } = await supabase
        .from("message_campaigns")
        .select("id, list_name, template_name, template_language, template_parameters, dry_run, status")
        .eq("id", campaignId)
        .maybeSingle();
      if (campaignError) throw campaignError;
      if (!campaign) throw new Error("Disparo não encontrado");
      if (campaign.status === "paused") return json(request, { ok: true, paused: true, ...(await finalizeIfDone(supabase, campaignId)) });

      const templateName = String(campaign.template_name || "");
      const templateLanguage = String(campaign.template_language || "pt_BR");
      const templateQuery = new URLSearchParams({ fields: "id,name,language,status,category,components", limit: "100", name: templateName });
      const { data: templateList } = await metaRequest(`/${requiredEnv("META_WABA_ID")}/message_templates?${templateQuery.toString()}`);
      const approvedTemplate = approvedTemplateFromList(templateList, templateName, templateLanguage);

      const { data: due, error: dueError } = await supabase
        .from("message_campaign_recipients")
        .select("id, contact_id, contact_name, phone_e164, status, attempts, max_attempts, idempotency_key")
        .eq("campaign_id", campaignId)
        .in("status", ["pending", "retry"])
        .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso()}`)
        .order("created_at", { ascending: true })
        .limit(BATCH_SIZE);
      if (dueError) throw dueError;

      const recipients = (due || []) as Recipient[];
      if (recipients.length === 0) {
        const state = await finalizeIfDone(supabase, campaignId);
        return json(request, { ok: true, processed: 0, ...state });
      }

      const dryRun = Boolean(campaign.dry_run) || isTestMode();
      const parameters = Array.isArray(campaign.template_parameters) ? campaign.template_parameters as string[] : [];
      let processed = 0;
      let rateLimited = false;

      for (const recipient of recipients) {
        const recipientId = String(recipient.id);
        const digits = String(recipient.phone_e164 ?? "");
        const attempts = Number(recipient.attempts ?? 0) + 1;
        const maxAttempts = Number(recipient.max_attempts ?? 3);

        // trava otimista para evitar duplicidade
        const { data: claimed, error: claimError } = await supabase
          .from("message_campaign_recipients")
          .update({ status: "sending", attempts, last_status_at: nowIso(), updated_at: nowIso() })
          .eq("id", recipientId)
          .in("status", ["pending", "retry"])
          .select("id")
          .maybeSingle();
        if (claimError) throw claimError;
        if (!claimed) continue;

        // idempotência: se já existe outbox com essa chave, apenas reconcilia
        const { data: existingOutbox } = await supabase
          .from("message_outbox")
          .select("id, status, external_id")
          .eq("idempotency_key", String(recipient.idempotency_key))
          .maybeSingle();
        if (existingOutbox) {
          await supabase.from("message_campaign_recipients").update({
            status: String(existingOutbox.status) === "falhou" ? "failed" : "sent",
            outbox_id: existingOutbox.id,
            external_id: existingOutbox.external_id,
            sent_at: nowIso(),
            last_status_at: nowIso(),
            updated_at: nowIso(),
          }).eq("id", recipientId);
          processed += 1;
          continue;
        }

        if (!dryRun) {
          const configuredLimit = Number(Deno.env.get("META_SEND_RATE_LIMIT_PER_MINUTE") || "20");
          const { data: slot } = await supabase.rpc("v4_claim_send_slot", { p_operator_key: session.operatorKey, p_limit: Number.isFinite(configuredLimit) ? configuredLimit : 20 });
          const slotResult = (Array.isArray(slot) ? slot[0] : slot) as Record<string, unknown> | null;
          if (!slotResult?.ok) {
            await supabase.from("message_campaign_recipients").update({
              status: "pending",
              attempts: attempts - 1,
              next_attempt_at: new Date(Date.now() + 30000).toISOString(),
              updated_at: nowIso(),
            }).eq("id", recipientId);
            rateLimited = true;
            break;
          }
        }

        const resolvedParameters = parameters.map((value) => String(value ?? "").replace(/\{\{\s*nome\s*\}\}|\{nome\}/gi, String(recipient.contact_name ?? "").split(" ")[0] || "cliente"));
        const metaBodyParameters = resolvedParameters.map((text) => ({ type: "text", text }));
        const renderedBody = renderTemplateBody(approvedTemplate, metaBodyParameters);

        const { data: outbox, error: outboxError } = await supabase.from("message_outbox").insert({
          operator_key: session.operatorKey,
          campaign_id: campaignId,
          recipient_id: recipientId,
          to_phone_e164: digits,
          message_type: "template",
          body_preview: renderedBody.slice(0, 500),
          template_name: campaign.template_name,
          idempotency_key: String(recipient.idempotency_key),
          status: dryRun ? "simulada" : "pending",
          dry_run: dryRun,
        }).select("id").single();
        if (outboxError) throw outboxError;

        if (dryRun) {
          await supabase.from("message_campaign_recipients").update({ status: "sent", outbox_id: outbox.id, sent_at: nowIso(), last_status_at: nowIso(), updated_at: nowIso() }).eq("id", recipientId);
          processed += 1;
          continue;
        }

        const payload = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: digits,
          type: "template",
          template: {
            name: campaign.template_name,
            language: { code: campaign.template_language || "pt_BR" },
            ...(metaBodyParameters.length > 0 ? { components: [{ type: "body", parameters: metaBodyParameters }] } : {}),
          },
        };

        try {
          const { data: providerData } = await metaRequest(`/${requiredEnv("META_PHONE_NUMBER_ID")}/messages`, { method: "POST", body: JSON.stringify(payload) });
          const externalId = Array.isArray(providerData.messages) && providerData.messages[0] && typeof providerData.messages[0] === "object"
            ? String((providerData.messages[0] as Record<string, unknown>).id ?? "")
            : null;
          const sentAt = nowIso();
          await supabase.from("message_outbox").update({ status: "processando", external_id: externalId, sent_at: sentAt, updated_at: sentAt }).eq("id", outbox.id);
          await supabase.from("message_campaign_recipients").update({ status: "sent", outbox_id: outbox.id, external_id: externalId, sent_at: sentAt, last_status_at: sentAt, last_error: null, updated_at: sentAt }).eq("id", recipientId);
          await supabase.from("message_contacts").update({ last_sent_at: sentAt }).eq("id", String(recipient.contact_id));

          const { data: conversation } = await supabase.from("message_conversations").upsert({
            phone_e164: digits,
            contact_id: recipient.contact_id,
            contact_name: recipient.contact_name,
            status: "open",
            origin_list: campaign.list_name || null,
            last_template_name: campaign.template_name,
            last_message_at: sentAt,
            last_message_preview: renderedBody.slice(0, 240),
            last_message_direction: "outbound",
            updated_at: sentAt,
          }, { onConflict: "phone_e164" }).select("id").single();
          if (conversation) {
            await supabase.from("message_conversation_messages").insert({
              conversation_id: conversation.id,
              external_id: externalId,
              direction: "outbound",
              message_type: "template",
              body: renderedBody,
              template_name: campaign.template_name,
              status: "processing",
              sender_phone_e164: digits,
              operator_key: session.operatorKey,
              outbox_id: outbox.id,
              raw_payload: { template: campaign.template_name, language: campaign.template_language || "pt_BR", parameters: metaBodyParameters },
              created_at: sentAt,
            });
          }
          processed += 1;
        } catch (providerError) {
          const providerMessage = safeErrorMessage(providerError);
          const shouldRetry = attempts < maxAttempts;
          const backoff = BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)];
          await supabase.from("message_outbox").update({ status: "falhou", last_error: providerMessage, updated_at: nowIso() }).eq("id", outbox.id);
          await supabase.from("message_campaign_recipients").update({
            status: shouldRetry ? "retry" : "failed",
            last_error: providerMessage,
            next_attempt_at: shouldRetry ? new Date(Date.now() + backoff * 1000).toISOString() : null,
            last_status_at: nowIso(),
            updated_at: nowIso(),
          }).eq("id", recipientId);
          processed += 1;
        }
      }

      const state = await finalizeIfDone(supabase, campaignId);
      return json(request, { ok: true, processed, rateLimited, ...state });
    }

    if (action === "pause" || action === "resume") {
      const campaignId = String(body.campaignId ?? "");
      if (!campaignId) throw new Error("campaignId is required");
      await supabase.from("message_campaigns").update({ status: action === "pause" ? "paused" : "running", updated_at: nowIso() }).eq("id", campaignId);
      return json(request, { ok: true, status: action === "pause" ? "paused" : "running" });
    }

    throw new Error("Ação não suportada");
  } catch (error) {
    return json(request, { ok: false, error: safeErrorMessage(error) }, 400);
  }
});
