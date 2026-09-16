import { adminClient, json, noContent, requirePinRole, safeErrorMessage } from "../_shared/meta.ts";
import { normalizeBrazilPhone } from "../_shared/phone.ts";
import { branchValue, clampInt, textValue } from "../_shared/automation.ts";

type StepInput = {
  stepOrder?: unknown;
  branch?: unknown;
  title?: unknown;
  messageBody?: unknown;
  templateName?: unknown;
  templateLanguage?: unknown;
  waitDays?: unknown;
  waitHours?: unknown;
  waitMinutes?: unknown;
};

function normalizeSteps(input: unknown, maxSteps: number) {
  const rows = Array.isArray(input) ? (input as StepInput[]) : [];
  const normalized = rows.slice(0, maxSteps * 3).map((step) => ({
    step_order: clampInt(step.stepOrder, 1, 50, 1),
    branch: branchValue(step.branch),
    title: textValue(step.title, 120) || null,
    message_body: textValue(step.messageBody, 4096) || null,
    template_name: textValue(step.templateName, 200) || null,
    template_language: textValue(step.templateLanguage, 20) || "pt_BR",
    wait_days: clampInt(step.waitDays, 0, 365, 0),
    wait_hours: clampInt(step.waitHours, 0, 23, 0),
    wait_minutes: clampInt(step.waitMinutes, 0, 59, 0),
  }));

  const seen = new Set<string>();
  const unique = normalized.filter((step) => {
    const key = `${step.step_order}:${step.branch}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (unique.length === 0) throw new Error("O fluxo precisa de pelo menos uma etapa.");
  if (unique.some((step) => !step.message_body && !step.template_name)) throw new Error("Cada etapa precisa de uma mensagem ou de um template.");
  const highest = Math.max(...unique.map((step) => step.step_order));
  if (highest > maxSteps) throw new Error(`O fluxo permite no máximo ${maxSteps} etapas.`);
  return unique;
}

async function flowSummaries(supabase: ReturnType<typeof adminClient>) {
  const { data: flows, error } = await supabase
    .from("automation_flows")
    .select("id, name, description, status, list_name, api_channel, max_steps, max_attempts, created_at, updated_at")
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const ids = (flows || []).map((flow: Record<string, unknown>) => flow.id as string);
  const stepCounts = new Map<string, Set<number>>();
  const contactCounts = new Map<string, number>();

  if (ids.length > 0) {
    const { data: steps } = await supabase.from("automation_steps").select("flow_id, step_order").in("flow_id", ids).limit(5000);
    for (const step of (steps || []) as Array<Record<string, unknown>>) {
      const set = stepCounts.get(step.flow_id as string) || new Set<number>();
      set.add(Number(step.step_order));
      stepCounts.set(step.flow_id as string, set);
    }
    const { data: contacts } = await supabase.from("automation_flow_contacts").select("flow_id").in("flow_id", ids).limit(50000);
    for (const contact of (contacts || []) as Array<Record<string, unknown>>) {
      const key = contact.flow_id as string;
      contactCounts.set(key, (contactCounts.get(key) || 0) + 1);
    }
  }

  return (flows || []).map((flow: Record<string, unknown>) => ({
    id: flow.id,
    name: flow.name,
    description: flow.description,
    status: flow.status,
    listName: flow.list_name,
    apiChannel: flow.api_channel,
    maxSteps: flow.max_steps,
    maxAttempts: flow.max_attempts,
    createdAt: flow.created_at,
    updatedAt: flow.updated_at,
    stepCount: stepCounts.get(flow.id as string)?.size || 0,
    contactCount: contactCounts.get(flow.id as string) || 0,
  }));
}

async function flowDetail(supabase: ReturnType<typeof adminClient>, flowId: string) {
  const { data: flow, error } = await supabase.from("automation_flows").select("*").eq("id", flowId).maybeSingle();
  if (error) throw error;
  if (!flow) throw new Error("Fluxo não encontrado.");

  const { data: steps } = await supabase.from("automation_steps").select("*").eq("flow_id", flowId).order("step_order").order("branch");
  const { data: contacts } = await supabase
    .from("automation_flow_contacts")
    .select("id, contact_name, phone_e164, status, current_step_order, current_branch, last_message_preview, last_message_at, last_response_at, last_response_preview, next_action, next_run_at, attempts, last_error, created_at")
    .eq("flow_id", flowId)
    .order("updated_at", { ascending: false })
    .limit(1000);

  return {
    flow: {
      id: flow.id,
      name: flow.name,
      description: flow.description,
      status: flow.status,
      listName: flow.list_name,
      apiChannel: flow.api_channel,
      maxSteps: flow.max_steps,
      maxAttempts: flow.max_attempts,
      createdAt: flow.created_at,
    },
    steps: (steps || []).map((step: Record<string, unknown>) => ({
      id: step.id,
      stepOrder: step.step_order,
      branch: step.branch,
      title: step.title,
      messageBody: step.message_body,
      templateName: step.template_name,
      templateLanguage: step.template_language,
      waitDays: step.wait_days,
      waitHours: step.wait_hours,
      waitMinutes: step.wait_minutes,
    })),
    contacts: (contacts || []).map((contact: Record<string, unknown>) => ({
      id: contact.id,
      name: contact.contact_name,
      phone: contact.phone_e164,
      status: contact.status,
      stepOrder: contact.current_step_order,
      branch: contact.current_branch,
      lastMessagePreview: contact.last_message_preview,
      lastMessageAt: contact.last_message_at,
      lastResponseAt: contact.last_response_at,
      lastResponsePreview: contact.last_response_preview,
      nextAction: contact.next_action,
      nextRunAt: contact.next_run_at,
      attempts: contact.attempts,
      lastError: contact.last_error,
      createdAt: contact.created_at,
    })),
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "POST") return json(request, { ok: false, error: "Method not allowed" }, 405);

  try {
    const session = await requirePinRole(request, ["owner", "admin", "operator", "viewer"]);
    const supabase = adminClient();
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "list");
    const readOnlyActions = new Set(["list", "get", "history"]);
    if (!readOnlyActions.has(action) && session.role === "viewer") throw new Error("Perfil somente leitura não pode alterar fluxos.");
    const flowId = typeof body.flowId === "string" ? body.flowId : "";

    if (action === "list") return json(request, { ok: true, flows: await flowSummaries(supabase) });

    if (action === "get") {
      if (!flowId) throw new Error("Informe o fluxo.");
      return json(request, { ok: true, ...(await flowDetail(supabase, flowId)) });
    }

    if (action === "create" || action === "update") {
      const name = textValue(body.name, 120);
      if (!name) throw new Error("Informe o nome do fluxo.");
      const maxSteps = clampInt(body.maxSteps, 1, 50, 10);
      const maxAttempts = clampInt(body.maxAttempts, 1, 10, 3);
      const steps = normalizeSteps(body.steps, maxSteps);
      const payload = {
        name,
        description: textValue(body.description, 500) || null,
        list_name: textValue(body.listName, 160) || null,
        api_channel: textValue(body.apiChannel, 60) || "whatsapp_cloud_api",
        max_steps: maxSteps,
        max_attempts: maxAttempts,
        operator_key: session.operatorKey,
      };

      let targetId = flowId;
      if (action === "create") {
        const { data, error } = await supabase.from("automation_flows").insert({ ...payload, status: textValue(body.status) === "active" ? "active" : "paused" }).select("id").single();
        if (error) throw error;
        targetId = data.id as string;
      } else {
        if (!flowId) throw new Error("Informe o fluxo.");
        const { error } = await supabase.from("automation_flows").update(payload).eq("id", flowId);
        if (error) throw error;
        const { error: deleteError } = await supabase.from("automation_steps").delete().eq("flow_id", flowId);
        if (deleteError) throw deleteError;
      }

      const { error: stepsError } = await supabase.from("automation_steps").insert(steps.map((step) => ({ ...step, flow_id: targetId })));
      if (stepsError) throw stepsError;

      await supabase.from("message_audit_logs").insert({ actor_id: null, operator_key: session.operatorKey, action: `automation_flow_${action}`, metadata: { flow_id: targetId, steps: steps.length } });
      return json(request, { ok: true, ...(await flowDetail(supabase, targetId)) });
    }

    if (action === "duplicate") {
      if (!flowId) throw new Error("Informe o fluxo.");
      const { flow, steps } = await flowDetail(supabase, flowId);
      const { data: created, error } = await supabase.from("automation_flows").insert({
        name: `${flow.name} (cópia)`.slice(0, 120),
        description: flow.description,
        status: "paused",
        list_name: flow.listName,
        api_channel: flow.apiChannel,
        max_steps: flow.maxSteps,
        max_attempts: flow.maxAttempts,
        operator_key: session.operatorKey,
      }).select("id").single();
      if (error) throw error;
      if (steps.length > 0) {
        const { error: stepsError } = await supabase.from("automation_steps").insert(steps.map((step) => ({
          flow_id: created.id,
          step_order: step.stepOrder,
          branch: step.branch,
          title: step.title,
          message_body: step.messageBody,
          template_name: step.templateName,
          template_language: step.templateLanguage,
          wait_days: step.waitDays,
          wait_hours: step.waitHours,
          wait_minutes: step.waitMinutes,
        })));
        if (stepsError) throw stepsError;
      }
      return json(request, { ok: true, flowId: created.id, flows: await flowSummaries(supabase) });
    }

    if (action === "toggleStatus") {
      if (!flowId) throw new Error("Informe o fluxo.");
      const status = textValue(body.status) === "active" ? "active" : "paused";
      const { error } = await supabase.from("automation_flows").update({ status }).eq("id", flowId);
      if (error) throw error;
      await supabase.from("message_audit_logs").insert({ actor_id: null, operator_key: session.operatorKey, action: "automation_flow_status", metadata: { flow_id: flowId, status } });
      return json(request, { ok: true, status, flows: await flowSummaries(supabase) });
    }

    if (action === "delete") {
      if (!flowId) throw new Error("Informe o fluxo.");
      const { error } = await supabase.from("automation_flows").delete().eq("id", flowId);
      if (error) throw error;
      return json(request, { ok: true, flows: await flowSummaries(supabase) });
    }

    if (action === "addContacts") {
      if (!flowId) throw new Error("Informe o fluxo.");
      const listName = textValue(body.listName, 160);
      const manual = Array.isArray(body.contacts) ? (body.contacts as Array<Record<string, unknown>>) : [];
      type Candidate = { contact_id: string | null; phone: string; name: string | null };
      const candidates: Candidate[] = [];

      if (listName) {
        const { data: memberships, error } = await supabase
          .from("message_contact_lists")
          .select("contact_id, message_contacts!inner(id, full_name, phone_e164, subscription_status, phone_valid)")
          .ilike("list_name", listName)
          .limit(5000);
        if (error) throw error;
        for (const row of (memberships || []) as Array<Record<string, unknown>>) {
          const contact = row.message_contacts as Record<string, unknown> | null;
          if (!contact || contact.phone_valid === false || contact.subscription_status === "unsubscribed") continue;
          const normalized = normalizeBrazilPhone(contact.phone_e164);
          if (!normalized.valid) continue;
          candidates.push({ contact_id: String(contact.id), phone: normalized.digits, name: textValue(contact.full_name, 120) || null });
        }
      }

      for (const item of manual.slice(0, 2000)) {
        const normalized = normalizeBrazilPhone(item.phone);
        if (!normalized.valid) continue;
        candidates.push({ contact_id: null, phone: normalized.digits, name: textValue(item.name, 120) || null });
      }

      if (candidates.length === 0) throw new Error("Nenhum contato válido para adicionar ao fluxo.");

      const unique = new Map<string, Candidate>();
      for (const candidate of candidates) unique.set(candidate.phone, candidate);

      const { error: upsertError } = await supabase.from("automation_flow_contacts").upsert(
        [...unique.values()].map((candidate) => ({
          flow_id: flowId,
          contact_id: candidate.contact_id,
          phone_e164: candidate.phone,
          contact_name: candidate.name,
          status: "next_step",
          current_step_order: 1,
          current_branch: "main",
          next_action: "Enviar mensagem da etapa 1",
          next_run_at: new Date().toISOString(),
        })),
        { onConflict: "flow_id,phone_e164", ignoreDuplicates: true },
      );
      if (upsertError) throw upsertError;

      if (listName) await supabase.from("automation_flows").update({ list_name: listName }).eq("id", flowId);
      await supabase.from("message_audit_logs").insert({ actor_id: null, operator_key: session.operatorKey, action: "automation_flow_contacts_added", metadata: { flow_id: flowId, total: unique.size } });
      return json(request, { ok: true, added: unique.size, ...(await flowDetail(supabase, flowId)) });
    }

    if (action === "contactAction") {
      const flowContactId = typeof body.flowContactId === "string" ? body.flowContactId : "";
      const contactAction = String(body.contactAction || "");
      if (!flowContactId) throw new Error("Informe o contato do fluxo.");
      const { data: contact, error } = await supabase.from("automation_flow_contacts").select("*").eq("id", flowContactId).maybeSingle();
      if (error) throw error;
      if (!contact) throw new Error("Contato não encontrado no fluxo.");

      const now = new Date().toISOString();
      if (contactAction === "pause") {
        await supabase.from("automation_flow_contacts").update({ status: "paused", next_action: "Pausado pelo operador", next_run_at: null }).eq("id", flowContactId);
      } else if (contactAction === "resume") {
        await supabase.from("automation_flow_contacts").update({ status: "next_step", next_action: `Enviar mensagem da etapa ${contact.current_step_order}`, next_run_at: now, last_error: null }).eq("id", flowContactId);
      } else if (contactAction === "retry") {
        await supabase.from("automation_flow_contacts").update({ status: "next_step", attempts: 0, last_error: null, next_action: `Nova tentativa da etapa ${contact.current_step_order}`, next_run_at: now }).eq("id", flowContactId);
      } else if (contactAction === "remove") {
        await supabase.from("automation_flow_contacts").delete().eq("id", flowContactId);
      } else {
        throw new Error("Ação inválida para o contato.");
      }

      if (contactAction !== "remove") {
        await supabase.from("automation_contact_events").insert({ flow_contact_id: flowContactId, flow_id: contact.flow_id, step_order: contact.current_step_order, branch: contact.current_branch, event_type: `operator_${contactAction}`, detail: `Ação do operador ${session.operatorKey}` });
      }
      return json(request, { ok: true, ...(await flowDetail(supabase, contact.flow_id as string)) });
    }

    if (action === "history") {
      const flowContactId = typeof body.flowContactId === "string" ? body.flowContactId : "";
      if (!flowContactId) throw new Error("Informe o contato do fluxo.");
      const { data: events, error } = await supabase
        .from("automation_contact_events")
        .select("id, step_order, branch, event_type, detail, created_at")
        .eq("flow_contact_id", flowContactId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return json(request, { ok: true, events: events || [] });
    }

    throw new Error("Ação não reconhecida.");
  } catch (error) {
    return json(request, { ok: false, error: safeErrorMessage(error) }, 400);
  }
});
