import { useState } from 'react';
import { z } from 'zod';
import { ArrowRight, BarChart3, Check, KeyRound, Loader2, Lock, Mail, MailCheck, ShieldCheck, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { ThemeToggle } from '@/components/ThemeToggle';
import { V4Logo } from '@/components/V4Logo';
import { useTheme } from '@/hooks/useTheme';
import { useNavigate } from 'react-router-dom';

const RECOVERY_EMAIL = 'iara.silva@v4company.com';

type RecoveryStage = 'request' | 'code' | 'password';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});

const signupSchema = loginSchema.extend({
  displayName: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Senhas não conferem',
  path: ['confirmPassword'],
});

const benefits = [
  'Visão da operação em tempo real',
  'Controle de campanhas e consentimento',
  'Dados organizados para decisões seguras',
];

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [recoveryStage, setRecoveryStage] = useState<RecoveryStage>('request');
  const [verificationToken, setVerificationToken] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { signIn, signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { theme } = useTheme();

  const clearRecovery = () => {
    setIsForgotPassword(false);
    setRecoveryStage('request');
    setVerificationToken('');
    setRecoveryCode('');
    setPassword('');
    setConfirmPassword('');
    setErrors({});
  };

  const handleRecoveryRequest = async () => {
    const result = z.string().email('Email inválido').safeParse(email);
    if (!result.success) {
      setErrors({ email: 'Email inválido' });
      return;
    }
    if (email.trim().toLowerCase() !== RECOVERY_EMAIL) {
      setErrors({ email: 'Use o e-mail de recuperação autorizado da V4.' });
      return;
    }

    const { data, error } = await supabase.functions.invoke('v4-request-password-code', { body: { email } });
    if (error || !data?.ok) {
      toast({ title: 'Não foi possível enviar o código', description: data?.error || error?.message || 'Verifique a configuração do e-mail V4.', variant: 'destructive' });
      return;
    }
    setRecoveryStage('code');
    toast({ title: 'Código enviado', description: `Verifique ${RECOVERY_EMAIL} e informe o código na V4.` });
  };

  const handleRecoveryCode = async () => {
    if (!/^\d{6}$/.test(recoveryCode.replace(/\s/g, ''))) {
      setErrors({ recoveryCode: 'Informe o código de 6 dígitos.' });
      return;
    }
    const { data, error } = await supabase.functions.invoke('v4-verify-password-code', { body: { email: RECOVERY_EMAIL, code: recoveryCode } });
    if (error || !data?.ok) {
      toast({ title: 'Código inválido', description: data?.error || error?.message || 'Solicite um novo código e tente novamente.', variant: 'destructive' });
      return;
    }
    setVerificationToken(data.verificationToken);
    setRecoveryStage('password');
    setErrors({});
  };

  const handleRecoveryPassword = async () => {
    if (password.length < 8) {
      setErrors({ password: 'A nova senha deve ter pelo menos 8 caracteres.' });
      return;
    }
    if (password !== confirmPassword) {
      setErrors({ confirmPassword: 'Senhas não conferem.' });
      return;
    }
    const { data, error } = await supabase.functions.invoke('v4-reset-password', { body: { email: RECOVERY_EMAIL, verificationToken, newPassword: password } });
    if (error || !data?.ok) {
      toast({ title: 'Não foi possível redefinir', description: data?.error || error?.message || 'Solicite um novo código.', variant: 'destructive' });
      return;
    }
    clearRecovery();
    setIsLogin(true);
    setEmail(RECOVERY_EMAIL);
    toast({ title: 'Senha redefinida', description: 'Sua senha foi alterada. Entre novamente na V4.' });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});
    setLoading(true);

    try {
      if (isForgotPassword) {
        if (recoveryStage === 'request') await handleRecoveryRequest();
        if (recoveryStage === 'code') await handleRecoveryCode();
        if (recoveryStage === 'password') await handleRecoveryPassword();
        return;
      }

      if (isLogin) {
        const result = loginSchema.safeParse({ email, password });
        if (!result.success) {
          const fieldErrors: Record<string, string> = {};
          result.error.errors.forEach((err) => { if (err.path[0]) fieldErrors[err.path[0] as string] = err.message; });
          setErrors(fieldErrors);
          return;
        }
        const { error } = await signIn(email, password);
        if (error) {
          toast({ title: 'Erro ao entrar', description: error.message.includes('Invalid login credentials') ? 'Email ou senha incorretos.' : error.message, variant: 'destructive' });
          return;
        }
        toast({ title: 'Bem-vindo à V4', description: 'Login realizado com sucesso.' });
        navigate('/');
        return;
      }

      const result = signupSchema.safeParse({ email, password, confirmPassword, displayName });
      if (!result.success) {
        const fieldErrors: Record<string, string> = {};
        result.error.errors.forEach((err) => { if (err.path[0]) fieldErrors[err.path[0] as string] = err.message; });
        setErrors(fieldErrors);
        return;
      }
      const { error } = await signUp(email, password, displayName);
      if (error) {
        toast({ title: 'Erro ao cadastrar', description: error.message.includes('User already registered') ? 'Este email já está cadastrado. Tente fazer login.' : error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Conta criada na V4', description: 'Cadastro realizado com sucesso.' });
      navigate('/');
    } catch {
      toast({ title: 'Erro', description: 'Ocorreu um erro inesperado. Tente novamente.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const title = isForgotPassword
    ? recoveryStage === 'request' ? 'Recuperar acesso' : recoveryStage === 'code' ? 'Digite o código' : 'Nova senha'
    : isLogin ? 'Entrar' : 'Criar conta';
  const description = isForgotPassword
    ? recoveryStage === 'request' ? 'Receba um código seguro no e-mail da V4.' : recoveryStage === 'code' ? `O código foi enviado para ${RECOVERY_EMAIL}.` : 'Crie uma nova senha após validar o código.'
    : isLogin ? 'Acesse a plataforma de mensagens V4.' : 'Crie sua conta para operar na V4.';

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
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-red-200"><span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" /> Mensagens que movem negócios</div>
            <h1 className="max-w-xl text-5xl font-semibold leading-[1.04] tracking-[-0.055em] xl:text-6xl">Clareza para decidir.<br /><span className="text-primary">Controle para crescer.</span></h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-white/60">Uma central de mensagens criada para organizar contatos, campanhas e resultados em uma visão objetiva da operação.</p>
          </div>
          <div className="relative space-y-3"><div className="grid gap-3 sm:grid-cols-3">{[{ value: '01', label: 'Visão completa' }, { value: '02', label: 'Ações rápidas' }, { value: '03', label: 'Dados seguros' }].map((item) => <div key={item.value} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm"><p className="text-xs font-bold tracking-[0.18em] text-primary">{item.value}</p><p className="mt-2 text-sm font-medium text-white/80">{item.label}</p></div>)}</div><div className="flex items-center gap-3 border-t border-white/10 pt-5 text-sm text-white/55"><ShieldCheck className="h-4 w-4 text-primary" /><span>Recuperação protegida pela V4.</span></div></div>
        </section>

        <div className="mx-auto w-full max-w-md">
          <div className="mb-5 flex items-center justify-between lg:justify-end"><div className="flex items-center gap-2 lg:hidden"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-black text-white shadow-lg">V4</div><span className="text-sm font-bold tracking-[0.16em]">V4</span></div><ThemeToggle /></div>
          <Card className="glass-card overflow-hidden rounded-[1.7rem] border-border/70 shadow-2xl shadow-black/15"><div className="h-1.5 bg-primary" /><CardHeader className="space-y-5 px-7 pb-5 pt-8 sm:px-9 sm:pt-10"><div className="flex items-start justify-between"><div><div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">{isForgotPassword ? <KeyRound className="h-5 w-5" /> : <BarChart3 className="h-5 w-5" />}</div><CardTitle className="text-3xl font-semibold tracking-[-0.04em]">{title}</CardTitle><CardDescription className="mt-2 max-w-xs leading-6">{description}</CardDescription></div></div></CardHeader>
            <CardContent className="px-7 pb-8 sm:px-9 sm:pb-10"><form onSubmit={handleSubmit} className="space-y-4">
              {isLogin && !isForgotPassword && <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5"><span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground"><MailCheck className="h-4 w-4 text-primary" /> Recuperação V4</span><button type="button" onClick={() => { setIsForgotPassword(true); setIsLogin(true); setEmail(RECOVERY_EMAIL); setErrors({}); }} className="text-sm font-semibold text-primary hover:underline" disabled={loading}>Esqueci minha senha</button></div>}
              {!isLogin && !isForgotPassword && <div className="space-y-2"><Label htmlFor="displayName">Nome</Label><div className="relative"><User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="displayName" type="text" placeholder="Seu nome" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="h-12 rounded-xl pl-10" disabled={loading} /></div>{errors.displayName && <p className="text-sm text-destructive">{errors.displayName}</p>}</div>}
              {(!isForgotPassword || recoveryStage === 'request') && <div className="space-y-2"><Label htmlFor="email">{isForgotPassword ? 'E-mail de recuperação V4' : 'Email'}</Label><div className="relative"><Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="email" type="email" placeholder="iara.silva@v4company.com" value={isForgotPassword ? RECOVERY_EMAIL : email} onChange={(e) => setEmail(e.target.value)} className="h-12 rounded-xl pl-10" disabled={loading || isForgotPassword} /></div>{isForgotPassword && <p className="text-[11px] leading-4 text-muted-foreground">O código será enviado somente para o endereço autorizado da V4.</p>}{errors.email && <p className="text-sm text-destructive">{errors.email}</p>}</div>}
              {isForgotPassword && recoveryStage === 'code' && <div className="space-y-2"><Label htmlFor="recoveryCode">Código de recuperação</Label><div className="relative"><KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="recoveryCode" inputMode="numeric" maxLength={6} placeholder="000000" value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="h-12 rounded-xl pl-10 text-center font-mono text-lg tracking-[0.35em]" disabled={loading} /></div>{errors.recoveryCode && <p className="text-sm text-destructive">{errors.recoveryCode}</p>}</div>}
              {isForgotPassword && recoveryStage === 'password' && <><div className="space-y-2"><Label htmlFor="password">Nova senha</Label><div className="relative"><Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 rounded-xl pl-10" disabled={loading} /></div>{errors.password && <p className="text-sm text-destructive">{errors.password}</p>}</div><div className="space-y-2"><Label htmlFor="confirmPassword">Confirmar nova senha</Label><div className="relative"><Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="confirmPassword" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="h-12 rounded-xl pl-10" disabled={loading} /></div>{errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}</div></>}
              {!isForgotPassword && isLogin && <div className="space-y-2"><Label htmlFor="password">Senha</Label><div className="relative"><Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 rounded-xl pl-10" disabled={loading} /></div>{errors.password && <p className="text-sm text-destructive">{errors.password}</p>}</div>}
              {!isLogin && !isForgotPassword && <div className="space-y-2"><Label htmlFor="password">Senha</Label><div className="relative"><Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 rounded-xl pl-10" disabled={loading} /></div>{errors.password && <p className="text-sm text-destructive">{errors.password}</p>}</div>}
              {!isLogin && !isForgotPassword && <div className="space-y-2"><Label htmlFor="confirmPassword">Confirmar senha</Label><div className="relative"><Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="confirmPassword" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="h-12 rounded-xl pl-10" disabled={loading} /></div>{errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}</div>}
              <Button type="submit" className="group h-12 w-full rounded-xl text-sm font-semibold shadow-lg shadow-primary/20" disabled={loading}>{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Aguarde...</> : <>{isForgotPassword ? recoveryStage === 'request' ? 'Enviar código V4' : recoveryStage === 'code' ? 'Validar código' : 'Redefinir senha' : isLogin ? 'Entrar no sistema' : 'Criar conta'}<ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" /></>}</Button>
            </form>
            <div className="mt-7 border-t border-border/60 pt-5 text-center">{isForgotPassword ? <button type="button" onClick={clearRecovery} className="text-sm font-semibold text-primary hover:underline" disabled={loading}>Voltar para o login</button> : <button type="button" onClick={() => { setIsLogin(!isLogin); setErrors({}); }} className="text-sm font-semibold text-primary hover:underline" disabled={loading}>{isLogin ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entre'}</button>}</div>
            </CardContent>
          </Card>
          <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">{benefits.map((benefit) => <span key={benefit} className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" />{benefit}</span>)}</div>
        </div>
      </div>
    </div>
  );
}
