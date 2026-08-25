export const V4_PIN_SESSION_KEY = 'v4_pin_session';

export function getPinSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(V4_PIN_SESSION_KEY);
}

export function setPinSessionToken(token: string): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(V4_PIN_SESSION_KEY, token);
}

export function clearPinSessionToken(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(V4_PIN_SESSION_KEY);
}

export function getPinClientId(): string {
  if (typeof window === 'undefined') return 'server-client';
  const existing = window.sessionStorage.getItem('v4_pin_client_id');
  if (existing) return existing;
  const clientId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.sessionStorage.setItem('v4_pin_client_id', clientId);
  return clientId;
}

export function pinSessionHeaders(token = getPinSessionToken()): Record<string, string> {
  const headers: Record<string, string> = { 'x-v4-client-id': getPinClientId() };
  if (token) headers['x-v4-pin-session'] = token;
  return headers;
}
