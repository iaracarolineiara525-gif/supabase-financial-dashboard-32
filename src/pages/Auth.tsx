import { useState } from 'react';
import { z } from 'zod';
import { ArrowRight, BarChart3, Check, KeyRound, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { ThemeToggle } from '@/components/ThemeToggle';
import { V4Logo } from '@/components/V4Logo';
import { useTheme } from '@/hooks/useTheme';
import { useNavigate } from 'react-router-dom';

const pinSchema = z.string().regex(/^\d{6}$/, 'Informe um PIN de 6 dígitos.');

const benefits = [
  'Acesso único protegido no servidor',
  'Limite contra tentativas automáticas',
  'Sessão temporária e revogável',
];

export default function Auth() {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { signIn } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { theme } = useTheme();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const parsed = pinSchema.safeParse(pin);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Informe o PIN de acesso.');
      return;
    }

    setLoading(true);
    try {
      const { error: signInError } = await signIn(pin);
      if (signInError) {
        setError(signInError.message);
        toast({ title: 'Acesso não autorizado', description: signInError.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Bem-vindo à V4', description: 'Acesso liberado com sessão protegida.' });
      navigate('/');
    } catch {
      setError('Não foi possível validar o acesso agora.');
      toast({ title: 'Erro ao entrar', description: 'Tente novamente em instantes.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`relative min-h-screen overflow-hidden ${theme === 'dark' ? 'v4-gradient-radial' : 'v4-gradient-radial-light'} v4-grid`}>
      <div className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-foreground/5 blur-3xl" aria-hidden="true" />

      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-7xl items-center gap-8 p-4 sm:p-6 lg:grid-cols-[1.08fr_0.92fr] lg:p-10">
        <section className="relative hidden min-h-[650px] overflow-hidden rounded-[2rem] border border-white/10 bg-black p-10 text-white shadow-2xl shadow-black/25 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-primary/20 blur-3xl" aria-hidden="true" />
          <div className="absolute bottom-0 left-0 h-48 w-48 rounded-full bg-white/5 blur-3xl" aria-hidden="true" />
          <div className="absolute inset-0 opacity-10 [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:34px_34px]" aria-hidden="true" />
          <div className="relative">
            <div className="mb-12 flex items-center gap-3"><V4Logo className="h-14" /><div className="h-10 w-px bg-white/20" /><span className="text-xs font-semibold uppercase tracking-[0.28em] text-white/55">Messaging OS</span></div>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-red-200"><span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" /> Acesso operacional V4</div>
            <h1 className="max-w-xl text-5xl font-semibold leading-[1.04] tracking-[-0.055em] xl:text-6xl">Clareza para decidir.<br /><span className="text-primary">Controle para crescer.</span></h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-white/60">Uma central de mensagens criada para organizar contatos, campanhas e resultados em uma visão objetiva da operação.</p>
          </div>
          <div className="relative space-y-3"><div className="grid gap-3 sm:grid-cols-3">{[{ value: '01', label: 'Visão completa' }, { value: '02', label: 'Ações rápidas' }, { value: '03', label: 'Dados seguros' }].map((item) => <div key={item.value} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm"><p className="text-xs font-bold tracking-[0.18em] text-primary">{item.value}</p><p className="mt-2 text-sm font-medium text-white/80">{item.label}</p></div>)}</div><div className="flex items-center gap-3 border-t border-white/10 pt-5 text-sm text-white/55"><ShieldCheck className="h-4 w-4 text-primary" /><span>Controle de acesso com proteção progressiva.</span></div></div>
        </section>

        <div className="mx-auto w-full max-w-md">
          <div className="mb-5 flex items-center justify-between lg:justify-end"><div className="flex items-center gap-2 lg:hidden"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-black text-white shadow-lg">V4</div><span className="text-sm font-bold tracking-[0.16em]">V4</span></div><ThemeToggle /></div>
          <Card className="glass-card overflow-hidden rounded-[1.7rem] border-border/70 shadow-2xl shadow-black/15"><div className="h-1.5 bg-primary" /><CardHeader className="space-y-5 px-7 pb-5 pt-8 sm:px-9 sm:pt-10"><div className="flex items-start justify-between"><div><div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25"><KeyRound className="h-5 w-5" /></div><CardTitle className="text-3xl font-semibold tracking-[-0.04em]">Acesso V4</CardTitle><CardDescription className="mt-2 max-w-xs leading-6">Informe o PIN operacional para acessar a plataforma de mensagens.</CardDescription></div></div></CardHeader>
            <CardContent className="px-7 pb-8 sm:px-9 sm:pb-10"><form onSubmit={handleSubmit} className="space-y-5">
              <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5"><span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground"><Lock className="h-4 w-4 text-primary" /> PIN validado no servidor</span></div>
              <div className="space-y-2"><Label htmlFor="pin">PIN de acesso</Label><div className="relative"><KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="pin" type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6 dígitos" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} className="h-12 rounded-xl pl-10 text-center font-mono text-lg tracking-[0.35em]" disabled={loading} autoFocus />{error && <p className="mt-2 text-sm text-destructive">{error}</p>}</div></div>
              <Button type="submit" className="group h-12 w-full rounded-xl text-sm font-semibold shadow-lg shadow-primary/20" disabled={loading}>{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Validando...</> : <>Entrar no sistema<ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" /></>}</Button>
            </form>
            <div className="mt-7 border-t border-border/60 pt-5 text-center"><p className="text-xs leading-5 text-muted-foreground">Acesso administrativo único. Não há recuperação automática por e-mail.</p></div>
          </CardContent></Card>
          <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">{benefits.map((benefit) => <span key={benefit} className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" />{benefit}</span>)}</div>
        </div>
      </div>
    </div>
  );
}
