import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { clearPinSessionToken, getPinSessionToken, pinSessionHeaders, setPinSessionToken } from '@/lib/v4PinSession';

type PinUser = { id: string; access: 'pin' };
type Operator = { key: string; name: string; role: 'owner' | 'admin' | 'operator' | 'viewer' };

type AuthError = { error: Error | null };

function responseError(data: unknown, fallback: string): Error {
  const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : fallback;
  return new Error(message);
}

export function useAuth() {
  const [authenticated, setAuthenticated] = useState(() => Boolean(getPinSessionToken()));
  const [loading, setLoading] = useState(false);
  const [operator, setOperator] = useState<Operator | null>(null);

  useEffect(() => {
    const refresh = () => {
      const token = getPinSessionToken();
      setAuthenticated(Boolean(token));
      if (!token) {
        setOperator(null);
        return;
      }
      void supabase.functions.invoke('v4-operator-context', { body: {}, headers: pinSessionHeaders(token) }).then(({ data }) => {
        if (data?.ok && data.operator) setOperator(data.operator as Operator);
      });
    };
    refresh();
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);

  const signIn = async (pin: string): Promise<AuthError> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('v4-pin-login', { body: { pin } });
      if (error || !data?.ok || typeof data.sessionToken !== 'string') {
        return { error: responseError(data, error?.message || 'PIN inválido.') };
      }
      setPinSessionToken(data.sessionToken);
      setOperator(data.operator && typeof data.operator === 'object' ? data.operator as Operator : { key: 'primary', name: 'Operador principal V4', role: 'owner' });
      setAuthenticated(true);
      return { error: null };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async (): Promise<AuthError> => {
    const token = getPinSessionToken();
    clearPinSessionToken();
    setOperator(null);
    setAuthenticated(false);
    if (!token) return { error: null };

    const { error } = await supabase.functions.invoke('v4-pin-logout', {
      body: {},
      headers: pinSessionHeaders(token),
    });
    return { error: error ? new Error(error.message) : null };
  };

  return {
    user: authenticated ? ({ id: 'pin-operator', access: 'pin' } satisfies PinUser) : null,
    session: authenticated ? { access: 'pin' as const } : null,
    operator,
    loading,
    signIn,
    signOut,
  };
}
