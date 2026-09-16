import { adminClient } from "./meta.ts";

export type Branch = "main" | "responded" | "no_response";

export const BRANCHES: Branch[] = ["main", "responded", "no_response"];
export const FLOW_CONTACT_STATUSES = ["waiting", "responded", "no_response", "next_step", "paused", "completed", "error"] as const;

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export function branchValue(value: unknown, fallback: Branch = "main"): Branch {
  const normalized = String(value ?? "").trim();
  return (BRANCHES as string[]).includes(normalized) ? (normalized as Branch) : fallback;
}

export function textValue(value: unknown, max = 4096): string {
  return String(value ?? "").trim().slice(0, max);
}

export function waitMillis(step: { wait_days?: number | null; wait_hours?: number | null; wait_minutes?: number | null }): number {
  const days = Number(step.wait_days || 0);
  const hours = Number(step.wait_hours || 0);
  const minutes = Number(step.wait_minutes || 0);
  return ((days * 24 + hours) * 60 + minutes) * 60 * 1000;
}

export async function logEvent(
  supabase: ReturnType<typeof adminClient>,
  input: { flowContactId: string; flowId: string; stepOrder?: number | null; branch?: string | null; eventType: string; detail?: string | null; metadata?: Record<string, unknown> },
) {
  await supabase.from("automation_contact_events").insert({
    flow_contact_id: input.flowContactId,
    flow_id: input.flowId,
    step_order: input.stepOrder ?? null,
    branch: input.branch ?? null,
    event_type: input.eventType,
    detail: input.detail ? input.detail.slice(0, 500) : null,
    metadata: input.metadata || {},
  });
}

/** Renders {{nome}} / {{telefone}} / {{empresa}} style variables from contact data. */
export function renderMessage(body: string, contact: { name?: string | null; phone?: string | null; company?: string | null; email?: string | null; group?: string | null }): string {
  const values: Record<string, string> = {
    nome: contact.name || "",
    name: contact.name || "",
    primeiro_nome: (contact.name || "").split(" ")[0] || "",
    telefone: contact.phone || "",
    phone: contact.phone || "",
    empresa: contact.company || contact.group || "",
    company: contact.company || contact.group || "",
    email: contact.email || "",
    grupo: contact.group || "",
  };
  return body.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (match, token: string) => {
    const key = token.toLowerCase();
    return key in values ? values[key] : match;
  });
}
