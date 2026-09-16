import { adminClient, isTestMode, json, metaRequest, noContent, requirePinRole, safeErrorMessage } from "../_shared/meta.ts";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";
import { logEvent, renderMessage, waitMillis, type Branch } from "../_shared/automation.ts";

type StepRow = {
  id: string;
  step_order: number;
  branch: Branch;
  message_body: string | null;
  template_name: string | null;
  template_language: string | null;
  wait_days: number;
  wait_hours: number;
  wait_minutes: number;
};

type FlowRow = { id: string; name: string; status: string; max_steps: number; max_attempts: number; operator_key: string | null };

type ContactRow = {
  id: string;
  flow_id: string;
  contact_id: string | null;
  phone_e164: string;
  contact_name: string | null;
  status: string;
  current_step_order: number;
  current_branch: Branch;
  last_message_at: string | null;
  last_response_at: string | null;
  attempts: number;
};

const BATCH_SIZE = 40;
const RETRY_DELAY_MS = 15 * 60 * 1000;

function pickStep(steps: StepRow[], stepOrder: number, branch: Branch): StepRow | null {
  return steps.find((step) => step.step_order === stepOrder && step.branch === branch)
    || steps.find((step) => step.step_order === stepOrder && step.branch === "main")
    || null;
}

async function sendStepMessage(supabase: ReturnType<typeof adminClient>, flow: FlowRow, contact: ContactRow, step: StepRow) {
  const dryRun = isTestMode();
  const idempotencyKey = `automation-${contact.id}-${step.step_order}-${step.branch}`;

  const { data: existing } = await supabase.from("message_outbox").select("id, external_id").eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existing) return { duplicate: true as const, preview: null, externalId: existing.external_id as string | null };

  let contactExtra: Record<string, unknown> | null = null;
  if (contact.contact_id) {
    const { data } = await supabase.from("message_contacts").select("full_name, email, group_name").eq("id", contact.contact_id).maybeSingle();
    contactExtra = data || null;
  }

  const renderedBody = step.message_body
    ? renderMessage(step.message_body, {
      name: contact.contact_name || (contactExtra?.full_name as string | null),
      phone: `+${contact.phone_e164}`,
      company: (contactExtra?.group_name as string | null) || null,
      email: (contactExtra?.email as string | null) || null,
      group: (contactExtra?.group_name as string | null) || null,
    })
    : "";

  const preview = step.template_name ? `[Template] ${step.template_name}` : renderedBody;

  const { data: suppressed } = await supabase.from("message_suppression").select("id").eq("phone_e164", contact.phone_e164).maybeSingle();
  if (suppressed) throw new Error("Contato está na lista de supressão.");

  const { data: outbox, error: outboxError } = await supabase.from("message_outbox").insert({
    actor_id: null,
    operator_key: flow.operator_key || "primary",
    to_phone_e164: contact.phone_e164,
    message_type: step.template_name ? "template" : "text",
    body_preview: preview.slice(0, 500),
    template_name: step.template_name,
    idempotency_key: idempotencyKey,
    status: dryRun ? "simulada" : "pending",
    dry_run: dryRun,
  }).select("id").single();
  if (outboxError) throw outboxError;

  if (dryRun) return { duplicate: false as const, preview, externalId: null };

  const payload = step.template_name
    ? { messaging_product: "whatsapp", recipient_type: "individual", to: contact.phone_e164, type: "template", template: { name: step.template_name, language: { code: step.template_language || "pt_BR" } } }
    : { messaging_product: "whatsapp", recipient_type: "individual", to: contact.phone_e164, type: "text", text: { body: renderedBody } };

  let externalId: string | null = null;
  try {
    const { data } = await metaRequest(`/${Deno.env.get("META_PHONE_NUMBER_ID")}/messages`, { method: "POST", body: JSON.stringify(payload) });
    const messages = Array.isArray(data.messages) ? data.messages : [];
    const first = messages[0] as Record<string, unknown> | undefined;
    externalId = typeof first?.id === "string" ? first.id : null;
  } catch (providerError) {
    const message = safeErrorMessage(providerError);
    await supabase.from("message_outbox").update({ status: "falhou", last_error: message }).eq("id", outbox.id);
    throw new Error(message);
  }

  const sentAt = new Date().toISOString();
  await supabase.from("message_outbox").update({ status: "processando", external_id: externalId, sent_at: sentAt }).eq("id", outbox.id);
  const { data: conversation } = await supabase.from("message_conversations").upsert({
    phone_e164: contact.phone_e164,
    contact_id: contact.contact_id,
    contact_name: contact.contact_name,
    status: "open",
    last_message_at: sentAt,
    last_message_preview: preview.slice(0, 240),
    last_message_direction: "outbound",
    updated_at: sentAt,
  }, { onConflict: "phone_e164" }).select("id").single();
  if (conversation) {
    await supabase.from("message_conversation_messages").insert({
      conversation_id: conversation.id,
      external_id: externalId,
      direction: "outbound",
      message_type: step.template_name ? "template" : "text",
      body: preview,
      status: "processing",
      sender_phone_e164: contact.phone_e164,
      operator_key: flow.operator_key || "primary",
      outbox_id: outbox.id,
      template_name: step.template_name,
    });
  }

  return { duplicate: false as const, preview, externalId };
}

async function advanceContact(supabase: ReturnType<typeof adminClient>, flow: FlowRow, contact: ContactRow, steps: StepRow[], responded: boolean) {
  const nextOrder = contact.current_step_order + 1;
  const nextBranch: Branch = responded ? "responded" : "no_response";
  const nextStep = pickStep(steps, nextOrder, nextBranch);
  const now = new Date().toISOString();

  await logEvent(supabase, {
    flowContactId: contact.id,
    flowId: flow.id,
    stepOrder: contact.current_step_order,
    branch: contact.current_branch,
    eventType: responded ? "branch_responded" : "branch_no_response",
    detail: responded ? "Contato respondeu; seguindo pelo caminho SIM." : "Sem resposta no prazo; seguindo pelo caminho NÃO.",
  });

  if (!nextStep || nextOrder > flow.max_steps) {
    await supabase.from("automation_flow_contacts").update({
      status: "completed",
      next_action: "Fluxo concluído",
      next_run_at: null,
    }).eq("id", contact.id);
    await logEvent(supabase, { flowContactId: contact.id, flowId: flow.id, stepOrder: contact.current_step_order, branch: contact.current_branch, eventType: "flow_completed", detail: "Nenhuma etapa restante." });
    return;
  }

  await supabase.from("automation_flow_contacts").update({
    status: "next_step",
    current_step_order: nextStep.step_order,
    current_branch: nextStep.branch,
    attempts: 0,
    next_action: `Enviar mensagem da etapa ${nextStep.step_order} (${nextStep.branch === "responded" ? "respondeu" : nextStep.branch === "no_response" ? "não respondeu" : "principal"})`,
    next_run_at: now,
  }).eq("id", contact.id);
}

async function processContact(supabase: ReturnType<typeof adminClient>, flow: FlowRow, steps: StepRow[], contact: ContactRow) {
  if (contact.status === "next_step") {
    const step = pickStep(steps, contact.current_step_order, contact.current_branch);
    if (!step) {
      await supabase.from("automation_flow_contacts").update({ status: "completed", next_action: "Fluxo concluído", next_run_at: null }).eq("id", contact.id);
      return "completed";
    }

    try {
      const result = await sendStepMessage(supabase, flow, contact, step);
      const sentAt = new Date().toISOString();
      const nextRunAt = new Date(Date.now() + Math.max(waitMillis(step), 60_000)).toISOString();
      await supabase.from("automation_flow_contacts").update({
        status: "waiting",
        last_step_id: step.id,
        last_message_preview: result.preview ? result.preview.slice(0, 240) : undefined,
        last_message_at: sentAt,
        next_action: "Verificar resposta",
        next_run_at: nextRunAt,
        last_error: null,
      }).eq("id", contact.id);
      await logEvent(supabase, {
        flowContactId: contact.id,
        flowId: flow.id,
        stepOrder: step.step_order,
        branch: step.branch,
        eventType: result.duplicate ? "message_skipped_duplicate" : "message_sent",
        detail: result.duplicate ? "Envio já registrado; nada foi reenviado." : result.preview,
        metadata: { external_id: result.externalId },
      });
      return result.duplicate ? "duplicate" : "sent";
    } catch (sendError) {
      const message = safeErrorMessage(sendError);
      const attempts = contact.attempts + 1;
      const exhausted = attempts >= flow.max_attempts;
      await supabase.from("automation_flow_contacts").update({
        status: exhausted ? "error" : "next_step",
        attempts,
        last_error: message.slice(0, 500),
        next_action: exhausted ? "Aguardando nova tentativa manual" : "Tentar envio novamente",
        next_run_at: exhausted ? null : new Date(Date.now() + RETRY_DELAY_MS).toISOString(),
      }).eq("id", contact.id);
      await logEvent(supabase, { flowContactId: contact.id, flowId: flow.id, stepOrder: contact.current_step_order, branch: contact.current_branch, eventType: "send_error", detail: message });
      return "error";
    }
  }

  if (contact.status === "waiting") {
    const lastMessage = contact.last_message_at ? new Date(contact.last_message_at).getTime() : 0;
    const lastResponse = contact.last_response_at ? new Date(contact.last_response_at).getTime() : 0;
    await advanceContact(supabase, flow, contact, steps, lastResponse > lastMessage);
    return "checked";
  }

  if (contact.status === "responded" || contact.status === "no_response") {
    await advanceContact(supabase, flow, contact, steps, contact.status === "responded");
    return "advanced";
  }

  return "skipped";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "POST") return json(request, { ok: false, error: "Method not allowed" }, 405);

  try {
    const cronRejection = authenticateCronRequest(request);
    if (cronRejection) await requirePinRole(request, ["owner", "admin", "operator"]);

    const supabase = adminClient();
    const body = await request.json().catch(() => ({}));
    const flowFilter = typeof body.flowId === "string" ? body.flowId : null;
    const nowIso = new Date().toISOString();

    let flowQuery = supabase.from("automation_flows").select("id, name, status, max_steps, max_attempts, operator_key").eq("status", "active").limit(100);
    if (flowFilter) flowQuery = flowQuery.eq("id", flowFilter);
    const { data: flows, error: flowError } = await flowQuery;
    if (flowError) throw flowError;

    const summary = { flows: 0, processed: 0, sent: 0, advanced: 0, errors: 0 };

    for (const flow of (flows || []) as FlowRow[]) {
      const { data: steps, error: stepsError } = await supabase.from("automation_steps").select("id, step_order, branch, message_body, template_name, template_language, wait_days, wait_hours, wait_minutes").eq("flow_id", flow.id);
      if (stepsError) throw stepsError;
      if (!steps || steps.length === 0) continue;

      const { data: contacts, error: contactsError } = await supabase
        .from("automation_flow_contacts")
        .select("id, flow_id, contact_id, phone_e164, contact_name, status, current_step_order, current_branch, last_message_at, last_response_at, attempts")
        .eq("flow_id", flow.id)
        .in("status", ["waiting", "next_step", "responded", "no_response"])
        .lte("next_run_at", nowIso)
        .order("next_run_at", { ascending: true })
        .limit(BATCH_SIZE);
      if (contactsError) throw contactsError;
      if (!contacts || contacts.length === 0) continue;

      summary.flows += 1;
      for (const contact of contacts as ContactRow[]) {
        const outcome = await processContact(supabase, flow, steps as StepRow[], contact);
        summary.processed += 1;
        if (outcome === "sent") summary.sent += 1;
        if (outcome === "checked" || outcome === "advanced") summary.advanced += 1;
        if (outcome === "error") summary.errors += 1;
      }
    }

    return json(request, { ok: true, ...summary, dryRun: isTestMode(), ranAt: nowIso });
  } catch (error) {
    return json(request, { ok: false, error: safeErrorMessage(error) }, 400);
  }
});
