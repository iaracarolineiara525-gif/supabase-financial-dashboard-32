import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { pinSessionHeaders } from "@/lib/v4PinSession";
import { Activity, AlertTriangle, BarChart3, CheckCircle2, ChevronRight, Clock3, FileText, History, LockKeyhole, Pause, RefreshCw, Settings2, ShieldCheck, Smartphone, Users, XCircle } from "lucide-react";

const queueItems = [
  { id: "msg_8f2…91c", phone: "+55 11 998••1180", campaign: "Reativação — clientes sem compra", template: "v4_reativacao_cliente", requested: "Hoje, 09:42", status: "Entregue", detail: "Lida às 09:44", tone: "success" },
  { id: "msg_8f1…6ad", phone: "+55 21 987••0912", campaign: "Boas-vindas novos clientes", template: "v4_boas_vindas", requested: "Hoje, 09:40", status: "Aceita", detail: "Aguardando webhook", tone: "neutral" },
  { id: "msg_8ed…a44", phone: "+55 31 988••6620", campaign: "Lembrete de pagamento", template: "v4_lembrete_pagamento", requested: "Hoje, 09:38", status: "Bloqueada", detail: "Sem opt-in válido", tone: "danger" },
  { id: "msg_8d1…22e", phone: "+55 41 999••4418", campaign: "Reativação — clientes sem compra", template: "v4_reativacao_cliente", requested: "Hoje, 09:35", status: "Em fila", detail: "Próxima janela: 10:00", tone: "warning" },
  { id: "msg_8c7…98b", phone: "+55 51 991••8045", campaign: "Reativação — clientes sem compra", template: "v4_reativacao_cliente", requested: "Hoje, 09:30", status: "Falhou", detail: "Número não localizado", tone: "danger" },
];

const statusStyles: Record<string, string> = {
  success: "border-primary/25 bg-primary/10 text-primary",
  neutral: "border-border bg-secondary text-foreground",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger: "border-destructive/25 bg-destructive/10 text-destructive",
};

function QueueStatus({ status, tone }: { status: string; tone: string }) {
  return <Badge variant="outline" className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", statusStyles[tone] || statusStyles.neutral)}>{status}</Badge>;
}

export function QueuePanel() {
  return (
    <div className="space-y-3">
      <Card className="glass-card rounded-[1.25rem]">
        <CardHeader className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div><CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Operação por mensagem</CardDescription><CardTitle className="mt-1 text-xl tracking-[-0.04em]">Fila e entregas</CardTitle><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">A requisição aceita pela API não é a mesma coisa que entrega. Acompanhe cada message ID até o retorno do webhook.</p></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" className="rounded-lg bg-transparent"><RefreshCw className="mr-2 h-3.5 w-3.5" /> Atualizar</Button><Button variant="outline" size="sm" className="rounded-lg bg-transparent"><Pause className="mr-2 h-3.5 w-3.5" /> Pausar fila</Button></div>
        </CardHeader>
        <CardContent className="p-3 sm:p-5">
          <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-xl border border-primary/20 bg-primary/5 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Em fila</p><p className="mt-1 text-2xl font-semibold">42</p><p className="text-[11px] text-muted-foreground">Limite controlado</p></div><div className="rounded-xl border border-border/60 bg-secondary/30 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Aceitas</p><p className="mt-1 text-2xl font-semibold">3.842</p><p className="text-[11px] text-muted-foreground">Pela API</p></div><div className="rounded-xl border border-border/60 bg-secondary/30 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Entregues</p><p className="mt-1 text-2xl font-semibold">3.588</p><p className="text-[11px] text-muted-foreground">Confirmadas pelo webhook</p></div><div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Falhas recentes</p><p className="mt-1 text-2xl font-semibold">18</p><p className="text-[11px] text-muted-foreground">Revisar antes de retentar</p></div></div>
          <div className="overflow-x-auto rounded-xl border border-border/60"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-secondary/40 text-[10px] uppercase tracking-[0.1em] text-muted-foreground"><tr><th className="px-3 py-3">Message ID</th><th className="px-3 py-3">Telefone</th><th className="px-3 py-3">Campanha</th><th className="px-3 py-3">Template</th><th className="px-3 py-3">Solicitada</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Atualização</th></tr></thead><tbody>{queueItems.map((item) => <tr key={item.id} className="border-t border-border/50"><td className="px-3 py-3 font-mono text-[11px] text-muted-foreground">{item.id}</td><td className="px-3 py-3 font-mono">{item.phone}</td><td className="px-3 py-3 font-medium">{item.campaign}</td><td className="px-3 py-3 text-muted-foreground">{item.template}</td><td className="px-3 py-3 text-muted-foreground">{item.requested}</td><td className="px-3 py-3"><QueueStatus status={item.status} tone={item.tone} /></td><td className="px-3 py-3 text-muted-foreground">{item.detail}</td></tr>)}</tbody></table></div>
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">Telefones e IDs aparecem mascarados. Retentativas e cancelamentos devem ser executados pela campanha com idempotência e limite de velocidade.</p>
        </CardContent>
      </Card>
    </div>
  );
}

const reportBars = [
  { label: "Entregues", value: "93,4%", width: "93%", tone: "bg-primary" },
  { label: "Lidas", value: "78,1%", width: "78%", tone: "bg-foreground" },
  { label: "Respostas", value: "22,6%", width: "23%", tone: "bg-amber-500" },
  { label: "Opt-outs", value: "0,8%", width: "8%", tone: "bg-destructive" },
];

export function ReportsPanel() {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Card className="glass-card rounded-2xl"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-primary/15 p-2.5 text-primary"><BarChart3 className="h-4 w-4" /></div><div><p className="text-2xl font-semibold">3.842</p><p className="text-xs text-muted-foreground">Mensagens aceitas</p></div></div></CardContent></Card><Card className="glass-card rounded-2xl"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-secondary p-2.5"><CheckCircle2 className="h-4 w-4" /></div><div><p className="text-2xl font-semibold">3.588</p><p className="text-xs text-muted-foreground">Entregues</p></div></div></CardContent></Card><Card className="glass-card rounded-2xl"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-amber-500/15 p-2.5 text-amber-600 dark:text-amber-300"><Users className="h-4 w-4" /></div><div><p className="text-2xl font-semibold">868</p><p className="text-xs text-muted-foreground">Respostas recebidas</p></div></div></CardContent></Card><Card className="glass-card rounded-2xl"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-destructive/10 p-2.5 text-destructive"><XCircle className="h-4 w-4" /></div><div><p className="text-2xl font-semibold">18</p><p className="text-xs text-muted-foreground">Falhas para revisar</p></div></div></CardContent></Card></div>
      <Card className="glass-card rounded-[1.25rem]"><CardHeader className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div><CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Desempenho operacional</CardDescription><CardTitle className="mt-1 text-xl tracking-[-0.04em]">Relatórios da operação</CardTitle><p className="mt-1 text-xs leading-5 text-muted-foreground">Leia o funil completo: aceitação, entrega, leitura, resposta e opt-out.</p></div><Button variant="outline" size="sm" className="rounded-lg bg-transparent"><FileText className="mr-2 h-3.5 w-3.5" /> Exportar relatório</Button></CardHeader><CardContent className="grid gap-5 p-4 pt-1 lg:grid-cols-[1.1fr_0.9fr] sm:p-5"><div className="space-y-4">{reportBars.map((bar) => <div key={bar.label}><div className="mb-1.5 flex items-center justify-between text-xs"><span className="text-muted-foreground">{bar.label}</span><span className="font-semibold">{bar.value}</span></div><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className={cn("h-full rounded-full", bar.tone)} style={{ width: bar.width }} /></div></div>)}<div className="rounded-xl border border-border/60 bg-secondary/20 p-3 text-xs leading-5 text-muted-foreground">Os estados de entrega e leitura dependem dos webhooks recebidos. Um envio aceito não deve ser contado como entregue.</div></div><div className="rounded-xl border border-border/60 p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Campanhas em destaque</p><div className="mt-3 space-y-3">{["Reativação — clientes sem compra", "Boas-vindas novos clientes", "Lembrete de pagamento"].map((name, index) => <div key={name} className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">0{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{name}</p><p className="text-[11px] text-muted-foreground">{index === 0 ? "68% entregues" : index === 1 ? "96% entregues" : "Agendada"}</p></div><ChevronRight className="h-4 w-4 text-muted-foreground" /></div>)}</div></div></CardContent></Card>
    </div>
  );
}

const healthRows = [
  { label: "Token armazenado fora do frontend", value: "OK", icon: LockKeyhole, tone: "success" },
  { label: "Webhook de status", value: "Monitorado", icon: Activity, tone: "success" },
  { label: "Qualidade do número", value: "GREEN", icon: ShieldCheck, tone: "success" },
  { label: "Templates dependentes", value: "1 em análise", icon: Clock3, tone: "warning" },
  { label: "Falhas nas últimas 24h", value: "18 para revisar", icon: AlertTriangle, tone: "warning" },
];

export function AccountHealthPanel() {
  const [health, setHealth] = useState<{ ok: boolean; testMode?: boolean; phone?: Record<string, unknown>; account?: Record<string, unknown> } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadHealth = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.functions.invoke("meta-health", { body: {}, headers: pinSessionHeaders() });
    setIsLoading(false);
    if (error || !data?.ok) {
      setHealth(null);
      setLoadError(true);
      return;
    }
    setLoadError(false);
    setHealth(data as { ok: boolean; testMode?: boolean; phone?: Record<string, unknown>; account?: Record<string, unknown> });
  };

  useEffect(() => { void loadHealth(); }, []);

  const phoneName = typeof health?.phone?.verified_name === "string" ? health.phone.verified_name : "Número sandbox";
  const phoneQuality = typeof health?.phone?.quality_rating === "string" ? health.phone.quality_rating : "UNKNOWN";
  const healthRows = [
    { label: "Conexão com a Meta", value: isLoading ? "Validando…" : health ? "OK" : "Revisar", icon: Activity, tone: health ? "success" : "warning" },
    { label: "Número conectado", value: isLoading ? "—" : phoneName, icon: Smartphone, tone: health ? "success" : "warning" },
    { label: "Qualidade do número", value: phoneQuality, icon: ShieldCheck, tone: phoneQuality === "GREEN" ? "success" : "warning" },
    { label: "Webhook de status", value: "Monitorado", icon: Activity, tone: "success" },
    { label: "Templates dependentes", value: "Verificar", icon: Clock3, tone: "warning" },
  ];

  return (
    <div className="grid gap-3 xl:grid-cols-[1.05fr_0.95fr]">
      <Card className="glass-card rounded-[1.25rem]"><CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3"><div className="flex items-start justify-between gap-3"><div><CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Prevenção operacional</CardDescription><CardTitle className="mt-1 text-xl tracking-[-0.04em]">Saúde da conta</CardTitle><p className="mt-1 text-xs leading-5 text-muted-foreground">Acompanhe qualidade, webhooks, limites e sinais de risco antes do próximo envio.</p></div><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary"><ShieldCheck className="h-6 w-6" /></div></div></CardHeader><CardContent className="space-y-3 p-4 pt-1 sm:p-5 sm:pt-1">{loadError && <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-700 dark:text-amber-300">A consulta da Meta não foi concluída. Nenhuma mensagem foi enviada; tente novamente após revisar Canais e API.</div>}{healthRows.map((row) => <div key={row.label} className="flex items-center gap-3 rounded-xl border border-border/50 p-3"><row.icon className={cn("h-4 w-4", row.tone === "success" ? "text-primary" : "text-amber-500")} /><span className="min-w-0 flex-1 text-sm">{row.label}</span><span className={cn("max-w-[11rem] truncate text-right text-[11px] font-semibold", row.tone === "success" ? "text-primary" : "text-amber-600 dark:text-amber-300")}>{row.value}</span></div>)}<Button variant="outline" className="w-full rounded-xl bg-transparent" onClick={() => void loadHealth()} disabled={isLoading}><RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} /> {isLoading ? "Validando conexão" : "Atualizar diagnóstico"}</Button></CardContent></Card>
      <div className="space-y-3"><Card className="glass-card rounded-[1.25rem]"><CardHeader className="p-4 pb-2"><CardTitle className="text-lg">Limite de mensagens</CardTitle><CardDescription>Consumo estimado do período móvel atual.</CardDescription></CardHeader><CardContent className="p-4 pt-1"><div className="flex items-end justify-between gap-3"><div><p className="text-3xl font-semibold tracking-[-0.06em]">38%</p><p className="text-xs text-muted-foreground">1.520 de 4.000 usuários únicos</p></div><GaugeIcon /></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full w-[38%] rounded-full bg-primary" /></div><p className="mt-3 text-[11px] leading-5 text-muted-foreground">O limite é compartilhado no nível do portfólio empresarial e não representa apenas mensagens entregues.</p></CardContent></Card><Card className="glass-card rounded-[1.25rem] border-amber-500/20"><CardContent className="flex items-start gap-3 p-4"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /><div><p className="text-sm font-semibold">Atenção antes de publicar</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Um template em análise e 18 falhas recentes precisam de revisão. O V4 manterá a campanha em dry run até a homologação.</p></div></CardContent></Card></div>
    </div>
  );
}

function GaugeIcon() {
  return <div className="flex h-12 w-12 items-center justify-center rounded-full border-[5px] border-primary/20 border-t-primary text-primary"><Gauge className="h-5 w-5" /></div>;
}

export function SettingsPanel({ operatorRole }: { operatorRole: string }) {
  const rows = [
    { label: "Sessão operacional", value: "Temporária e revogável" },
    { label: "Papel atual", value: operatorRole },
    { label: "Auditoria de ações", value: "Ativa" },
    { label: "Produção Meta", value: "Bloqueada no sandbox" },
  ];
  return <Card className="glass-card rounded-[1.25rem]"><CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3"><div className="flex items-start justify-between gap-3"><div><CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Administração V4</CardDescription><CardTitle className="mt-1 text-xl tracking-[-0.04em]">Configurações</CardTitle><p className="mt-1 text-xs leading-5 text-muted-foreground">Perfis, regras, trilha de auditoria e preferências da operação.</p></div><Settings2 className="h-5 w-5 text-primary" /></div></CardHeader><CardContent className="space-y-3 p-4 pt-1 sm:p-5 sm:pt-1"><div className="grid gap-3 sm:grid-cols-2">{rows.map((row) => <div key={row.label} className="rounded-xl border border-border/60 bg-secondary/20 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{row.label}</p><p className="mt-1 text-sm font-semibold">{row.value}</p></div>)}</div><div className="rounded-xl border border-primary/20 bg-primary/5 p-4"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 text-primary" /><div><p className="text-sm font-semibold">Autoridade server-side aplicada</p><p className="mt-1 text-xs leading-5 text-muted-foreground">O papel limita ações no servidor. O PIN único ainda reduz a responsabilização individual; crie identidades separadas antes de operar com equipe.</p></div></div></div><Button variant="outline" className="rounded-xl bg-transparent"><History className="mr-2 h-4 w-4" /> Consultar trilha de auditoria</Button></CardContent></Card>;
}
