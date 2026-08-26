import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";

export type AdminClient = ReturnType<typeof createClient>;

const DEFAULT_ORIGIN = "https://crm.v4venturini.com";

export function corsHeaders(request: Request): Record<string, string> {
  const configuredOrigin = Deno.env.get("APP_ORIGIN") || DEFAULT_ORIGIN;
  const requestOrigin = request.headers.get("origin");
  const allowOrigin = requestOrigin && requestOrigin === configuredOrigin ? requestOrigin : configuredOrigin;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-idempotency-key, x-v4-pin-session, x-v4-client-id",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin",
  };
}

export function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}

export function noContent(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

export function adminClient(): AdminClient {
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type PinSessionContext = {
  sessionHash: string;
  expiresAt: string | null;
  operatorKey: string;
  operatorName: string;
  role: "owner" | "admin" | "operator" | "viewer";
};

export async function requirePinSession(request: Request): Promise<PinSessionContext> {
  const sessionToken = request.headers.get("x-v4-pin-session")?.trim();
  if (!sessionToken) throw new Error("PIN session required");

  const sessionHash = await sha256Hex(sessionToken);
  const { data, error } = await adminClient().rpc("v4_pin_validate_session", { p_session_hash: sessionHash });
  const result = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  const role = result?.role;
  if (error || !result?.ok || !result.operator_key || !["owner", "admin", "operator", "viewer"].includes(String(role))) throw new Error("PIN session expired");
  return {
    sessionHash,
    expiresAt: typeof result.expires_at === "string" ? result.expires_at : null,
    operatorKey: String(result.operator_key),
    operatorName: typeof result.operator_name === "string" ? result.operator_name : "Operador V4",
    role: role as PinSessionContext["role"],
  };
}

export async function requirePinRole(request: Request, allowedRoles: PinSessionContext["role"][]): Promise<PinSessionContext> {
  const session = await requirePinSession(request);
  if (!allowedRoles.includes(session.role)) throw new Error("Insufficient operator permissions");
  return session;
}

export async function requireUser(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Authentication required");
  }

  const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentication required");
  return data.user;
}

export function graphBaseUrl(): string {
  return (Deno.env.get("META_GRAPH_API_BASE_URL") || "https://graph.facebook.com").replace(/\/$/, "");
}

export function graphVersion(): string {
  const configured = Deno.env.get("META_GRAPH_API_VERSION") || "v26.0";
  return configured.startsWith("v") ? configured : `v${configured}`;
}

export async function metaRequest(path: string, init: RequestInit = {}) {
  const token = requiredEnv("META_ACCESS_TOKEN");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const response = await fetch(`${graphBaseUrl()}/${graphVersion()}${normalizedPath}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  const raw = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw: "non-json-response" };
  }

  if (!response.ok) {
    const metaError = data.error as Record<string, unknown> | undefined;
    const safeError = new Error(typeof metaError?.message === "string" ? metaError.message : `Meta API returned HTTP ${response.status}`);
    (safeError as Error & { status?: number; code?: string | number }).status = response.status;
    (safeError as Error & { status?: number; code?: string | number }).code = metaError?.code as string | number | undefined;
    throw safeError;
  }

  return { response, data };
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
  return "Unexpected provider error";
}

export function isTestMode(): boolean {
  return (Deno.env.get("META_TEST_MODE") || "true").toLowerCase() !== "false";
}

export function normalizePhone(input: string): string {
  return input.replace(/[^0-9+]/g, "");
}

export function phoneDigits(input: string): string {
  return normalizePhone(input).replace(/^\+/, "");
}

export function isE164(input: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(normalizePhone(input));
}

export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(body: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeMessageStatus(status: string): string {
  const map: Record<string, string> = {
    accepted: "processando",
    sent: "enviada",
    delivered: "entregue",
    read: "lida",
    failed: "falhou",
    deleted: "cancelada",
    blocked: "bloqueada",
  };
  return map[status.toLowerCase()] || "processando";
}
