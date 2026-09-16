import { Component, ErrorInfo, ReactNode, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { pinSessionHeaders } from "@/lib/v4PinSession";
import { countByStatus, dispatchesToCsv, downloadCsv, useDispatches } from "@/hooks/useDispatches";
import { Activity, AlertTriangle, BarChart3, CheckCircle2, ChevronRight, Clock3, FileText, Gauge, History, LockKeyhole, Pause, RefreshCw, Settings2, ShieldCheck, Smartphone, Users, XCircle } from "lucide-react";

type HealthBoundaryProps = { children: ReactNode };
type HealthBoundaryState = { hasError: boolean };

function friendlyHealthError(error: string) {
  const normalized = error.toLowerCase();
  if (normalized.includes("access token") || normalized.includes("session has expired") || normalized.includes("authentication error")) return "Token da Meta expirado ou sem permissão. Atualize a credencial em Canais e API.";
  if (normalized.includes("missing server configuration")) return "Configuração do servidor incompleta. Revise Canais e API.";
  if (normalized.includes("pin session")) return "Sessão expirada. Saia e entre novamente no sistema.";
  return "A Meta não confirmou este recurso. Revise Canais e API.";
}

class HealthBoundary extends Component<HealthBoundaryProps, HealthBoundaryState> {
  state: HealthBoundaryState = { hasError: false };

  static getDerivedStateFromError(): HealthBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Meta Distribuidora account health panel render error", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return <Card className="glass-card rounded-[1.25rem]"><CardHeader className="p-4 sm:p-5"><CardTitle className="text-xl">Saúde da conta indisponível</CardTitle><CardDescription>O painel encontrou uma falha ao montar os dados reais. Nenhuma mensagem foi enviada.</CardDescription></CardHeader><CardContent className="p-4 pt-0 sm:p-5 sm:pt-0"><Button variant="outline" className="rounded-xl bg-transparent" onClick={() => this.setState({ hasError: false })}><RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente</Button></CardContent></Card>;
  }
}

const statusStyles: Record<string, string> = {
  success: "border-primary/25 bg-primary/10 text-primary",
  neutral: "border-border bg-secondary text-foreground",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger: "border-destructive/25 bg-destructive/10 text-destructive",
};

function QueueStatus({ status, tone }: { status: string; tone: string }) {
  return <Badge variant="outline" className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", statusStyles[tone] || statusStyles.neutral)}>{status}</Badge>;
}

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "falhou") return "danger";
  if (["entregue", "lida", "enviada"].includes(normalized)) return "success";
  if (["pending", "processando"].includes(normalized)) return "warning";
  return "neutral";
}

function formatStamp(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function QueuePanel() {
  const { rows, isLoading, loadError, reload } = useDispatches();
  const queued = rows.filter((row) => ["pending", "processando"].includes(String(row.status).toLowerCase())).length;
  const accepted = rows.filter((row) => ["processando", "enviada", "entregue", "lida"].includes(String(row.status).toLowerCase())).length;
  const delivered = countByStatus(rows, "entregue");
  const failed = countByStatus(rows, "falhou");

  return (
    <div className="space-y-3">
      <Card className="glass-card rounded-[1.25rem]">
        <CardHeader className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div><CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Operação por mensagem</CardDescription><CardTitle className="mt-1 text-xl tracking-[-0.04em]">Fila e entregas</CardTitle><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Acompanhe cada message ID real até o retorno do webhook da Meta.</p></div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-xl bg-transparent" onClick={() => void reload()} disabled={isLoading}><RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} /> Atualizar</Button>
            <Button variant="outline" className="rounded-xl bg-transparent" onClick={() => downloadCsv(`meta-distribuidora-fila-${new Date().toISOString().slice(0, 10)}.csv`, dispatchesToCsv(rows))} disabled={rows.length === 0}><FileText className="mr-2 h-4 w-4" /> Exportar</Button>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-5">
          {loadError && <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-700 dark:text-amber-300">{loadError}</div>}
          <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Em fila</p><p className="mt-1 text-2xl font-semibold">{queued}</p><p className="text-[11px] text-muted-foreground">Aguardando retorno</p></div>
            <div className="rounded-xl border border-border/60 bg-secondary/30 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Aceitas</p><p className="mt-1 text-2xl font-semibold">{accepted}</p><p className="text-[11px] text-muted-foreground">Pela API</p></div>
            <div className="rounded-xl border border-border/60 bg-secondary/30 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Entregues</p><p className="mt-1 text-2xl font-semibold">{delivered}</p><p className="text-[11px] text-muted-foreground">Confirmadas pelo webhook</p></div>
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Falhas recentes</p><p className="mt-1 text-2xl font-semibold">{failed}</p><p className="text-[11px] text-muted-foreground">Revisar antes de retentar</p></div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="bg-secondary/40 text-[10px] uppercase tracking-[0.1em] text-muted-foreground"><tr><th className="px-3 py-3">Message ID</th><th className="px-3 py-3">Telefone</th><th className="px-3 py-3">Tipo</th><th className="px-3 py-3">Template</th><th className="px-3 py-3">Solicitada</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Atualização</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border/50">
                    <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground">{row.externalId || row.id.slice(0, 8)}</td>
                    <td className="px-3 py-3 font-mono">{row.to}</td>
                    <td className="px-3 py-3 capitalize text-muted-foreground">{row.messageType}</td>
                    <td className="px-3 py-3 text-muted-foreground">{row.templateName || "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground">{formatStamp(row.createdAt)}</td>
                    <td className="px-3 py-3"><QueueStatus status={row.status} tone={statusTone(row.status)} /></td>
                    <td className="px-3 py-3 text-muted-foreground">{row.lastError || formatStamp(row.sentAt)}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr className="border-t border-border/50"><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">{isLoading ? "Carregando fila..." : "Nenhuma mensagem na fila."}</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">Telefones e IDs aparecem mascarados. Retentativas e cancelamentos devem ser executados pela campanha com idempotência e limite de velocidade.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export function ReportsPanel() {
  const { rows, isLoading, loadError, reload } = useDispatches();
  const total = rows.length;
  const accepted = rows.filter((row) => ["processando", "enviada", "entregue", "lida"].includes(String(row.status).toLowerCase())).length;
  const delivered = countByStatus(rows, "entregue");
  const read = countByStatus(rows, "lida");
  const failed = countByStatus(rows, "falhou");
  const real = rows.filter((row) => !row.dryRun).length;

  const percent = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);
  const bars = [
    { label: "Registrados", value: total, tone: "bg-foreground/70" },
    { label: "Aceitos pela API", value: accepted, tone: "bg-primary" },
    { label: "Entregues", value: delivered, tone: "bg-emerald-500" },
    { label: "Lidas", value: read, tone: "bg-sky-500" },
    { label: "Falhas", value: failed, tone: "bg-destructive" },
  ];

  const byTemplate = new Map<string, { total: number; delivered: number; failed: number }>();
  rows.forEach((row) => {
    const key = row.templateName || (row.messageType === "template" ? "template sem nome" : "texto livre");
    const current = byTemplate.get(key) || { total: 0, delivered: 0, failed: 0 };
    current.total += 1;
    if (String(row.status).toLowerCase() === "entregue") current.delivered += 1;
    if (String(row.status).toLowerCase() === "falhou") current.failed += 1;
    byTemplate.set(key, current);
  });
  const templateRows = Array.from(byTemplate.entries()).sort((a, b) => b[1].total - a[1].total);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="glass-card rounded-2xl"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-primary/15 p-2.5 text-primary"><BarChart3 className="h-4 w-4" /></div><div><p className="text-2xl font-semibold">{accepted}</p><p className="text-xs text-muted-foreground">Mensagens aceitas</p></div></div></CardContent></Card>
        <Card className="glass-card rounded-2xl"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-secondary p-2.5"><CheckCircle2 className="h-4 w-4" /></div><div><p className="text-2xl font-semibold">{delivered}</p><p className="text-xs text-muted-foreground">Entregues</p></div></div></CardContent></Card>
        <Card className="glass-card rounded-2xl"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-amber-500/15 p-2.5 text-amber-600 dark:text-amber-300"><Users className="h-4 w-4" /></div><div><p className="text-2xl font-semibold">{read}</p><p className="text-xs text-muted-foreground">Mensagens lidas</p></div></div></CardContent></Card>
        <Card className="glass-card rounded-2xl"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-destructive/10 p-2.5 text-destructive"><XCircle className="h-4 w-4" /></div><div><p className="text-2xl font-semibold">{failed}</p><p className="text-xs text-muted-foreground">Falhas para revisar</p></div></div></CardContent></Card>
      </div>
      <Card className="glass-card rounded-[1.25rem]">
        <CardHeader className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div><CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Desempenho operacional</CardDescription><CardTitle className="mt-1 text-xl tracking-[-0.04em]">Relatórios da operação</CardTitle><p className="mt-1 text-xs leading-5 text-muted-foreground">Funil real calculado sobre {total} registros ({real} envios reais).</p></div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-xl bg-transparent" onClick={() => void reload()} disabled={isLoading}><RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} /> Atualizar</Button>
            <Button variant="outline" className="rounded-xl bg-transparent" onClick={() => downloadCsv(`meta-distribuidora-relatorio-${new Date().toISOString().slice(0, 10)}.csv`, dispatchesToCsv(rows))} disabled={rows.length === 0}><FileText className="mr-2 h-4 w-4" /> Exportar relatório</Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 p-4 pt-1 lg:grid-cols-[1.1fr_0.9fr] sm:p-5">
          <div className="space-y-4">
            {loadError && <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-700 dark:text-amber-300">{loadError}</div>}
            {bars.map((bar) => (
              <div key={bar.label}>
                <div className="mb-1.5 flex items-center justify-between text-xs"><span className="text-muted-foreground">{bar.label}</span><span className="font-semibold">{bar.value} · {percent(bar.value)}%</span></div>
                <div className="h-2.5 overflow-hidden rounded-full bg-secondary"><div className={cn("h-full rounded-full transition-all", bar.tone)} style={{ width: `${percent(bar.value)}%` }} /></div>
              </div>
            ))}
            <div className="rounded-xl border border-border/60 bg-secondary/20 p-3 text-xs leading-5 text-muted-foreground">Os estados de entrega e leitura dependem dos webhooks recebidos. Um envio aceito não deve ser contado como entregue.</div>
          </div>
          <div className="rounded-xl border border-border/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Desempenho por template</p>
            <div className="mt-3 space-y-3">
              {templateRows.length === 0 && <p className="text-xs text-muted-foreground">{isLoading ? "Carregando dados..." : "Nenhum envio registrado ainda."}</p>}
              {templateRows.map(([name, data], index) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">{String(index + 1).padStart(2, "0")}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{name}</p><p className="text-[11px] text-muted-foreground">{data.total} envios · {data.delivered} entregues · {data.failed} falhas</p></div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


const healthRows = [
  { label: "Token armazenado fora do frontend", value: "OK", icon: LockKeyhole, tone: "success" },
  { label: "Webhook de status", value: "Monitorado", icon: Activity, tone: "success" },
  { label: "Qualidade do número", value: "GREEN", icon: ShieldCheck, tone: "success" },
  { label: "Templates dependentes", value: "1 em análise", icon: Clock3, tone: "warning" },
  { label: "Falhas registradas", value: "18 para revisar", icon: AlertTriangle, tone: "warning" },
];

function AccountHealthContent() {
  const [health, setHealth] = useState<{ ok: boolean; testMode?: boolean; phone?: Record<string, unknown> | null; account?: Record<string, unknown> | null; checks?: { phone?: boolean; account?: boolean; credentials?: boolean }; errors?: string[]; error?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRepairing, setIsRepairing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadHealth = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.functions.invoke("meta-health", { body: {}, headers: pinSessionHeaders() });
    setIsLoading(false);
    if (error && !data) {
      setHealth({ ok: false, errors: [error.message || "Falha ao consultar a função de saúde"] });
      setLoadError(true);
      return;
    }
    const diagnostic = data as { ok: boolean; testMode?: boolean; phone?: Record<string, unknown> | null; account?: Record<string, unknown> | null; checks?: { phone?: boolean; account?: boolean; credentials?: boolean }; errors?: string[]; error?: string };
    setLoadError(!diagnostic?.ok);
    setHealth(diagnostic);
  };

  useEffect(() => { void loadHealth(); }, []);

  const phoneName = typeof health?.phone?.verified_name === "string" ? health.phone.verified_name : "Número não disponível";
  const phoneQuality = typeof health?.phone?.quality_rating === "string" ? health.phone.quality_rating : "UNKNOWN";
  const phoneStatus = typeof health?.phone?.status === "string" ? health.phone.status : "Revisar";
  const accountName = typeof health?.account?.name === "string" ? health.account.name : "WABA não confirmada";
  const healthRows = [
    { label: "Conexão com a Meta", value: isLoading ? "Validando…" : health?.checks?.credentials ? "OK" : "Revisar", icon: Activity, tone: health?.checks?.credentials ? "success" : "warning" },
    { label: "Número conectado", value: isLoading ? "—" : phoneName, icon: Smartphone, tone: health?.checks?.phone ? "success" : "warning" },
    { label: "Status do número", value: isLoading ? "—" : phoneStatus, icon: ShieldCheck, tone: phoneStatus === "CONNECTED" ? "success" : "warning" },
    { label: "Qualidade do número", value: phoneQuality, icon: ShieldCheck, tone: phoneQuality === "GREEN" ? "success" : "warning" },
    { label: "Conta WhatsApp", value: isLoading ? "—" : accountName, icon: Activity, tone: health?.checks?.account ? "success" : "warning" },
  ];

  return (
    <div className="grid gap-3 xl:grid-cols-[1.05fr_0.95fr]">
      <Card className="glass-card rounded-[1.25rem]"><CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3"><div className="flex items-start justify-between gap-3"><div><CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Prevenção operacional</CardDescription><CardTitle className="mt-1 text-xl tracking-[-0.04em]">Saúde da conta</CardTitle><p className="mt-1 text-xs leading-5 text-muted-foreground">Acompanhe qualidade, webhooks, limites e sinais de risco antes do próximo envio.</p></div><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary"><ShieldCheck className="h-6 w-6" /></div></div></CardHeader><CardContent className="space-y-3 p-4 pt-1 sm:p-5 sm:pt-1">{loadError && <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-700 dark:text-amber-300"><p className="font-semibold">Diagnóstico precisa de revisão</p><p className="mt-1">Nenhuma mensagem foi enviada. Verifique Canais e API e confira os retornos abaixo.</p>{health?.errors?.length ? <div className="mt-2 space-y-1 text-[10px]">{Array.from(new Set(health.errors.map(friendlyHealthError))).map((error) => <p key={error}>{error}</p>)}</div> : null}</div>}{healthRows.map((row) => <div key={row.label} className="flex items-center gap-3 rounded-xl border border-border/50 p-3"><row.icon className={cn("h-4 w-4", row.tone === "success" ? "text-primary" : "text-amber-500")} /><span className="min-w-0 flex-1 text-sm">{row.label}</span><span className={cn("max-w-[11rem] truncate text-right text-[11px] font-semibold", row.tone === "success" ? "text-primary" : "text-amber-600 dark:text-amber-300")}>{row.value}</span></div>)}<div className="grid gap-2 sm:grid-cols-2"><Button variant="outline" className="w-full rounded-xl bg-transparent" onClick={() => void loadHealth()} disabled={isLoading || isRepairing}><RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} /> {isLoading ? "Validando conexão" : "Atualizar diagnóstico"}</Button><Button variant="outline" className="w-full rounded-xl bg-transparent" onClick={async () => { setIsLoading(true); const { data, error } = await supabase.functions.invoke("meta-health", { body: { repairWebhook: true }, headers: pinSessionHeaders() }); setIsLoading(false); setIsRepairing(false); if (error && !data) { setHealth({ ok: false, errors: [error.message || "Falha ao reparar a inscrição do webhook"] }); setLoadError(true); return; } await loadHealth(); }} disabled={isLoading || isRepairing}><Settings2 className={cn("mr-2 h-4 w-4", isRepairing && "animate-spin")} /> {isRepairing ? "Reparando webhook" : "Reparar inscrição"}</Button></div></CardContent></Card>
      <div className="space-y-3"><Card className="glass-card rounded-[1.25rem]"><CardHeader className="p-4 pb-2"><CardTitle className="text-lg">Limite de mensagens</CardTitle><CardDescription>Consumo estimado do período móvel atual.</CardDescription></CardHeader><CardContent className="p-4 pt-1"><div className="flex items-end justify-between gap-3"><div><p className="text-3xl font-semibold tracking-[-0.06em]">—</p><p className="text-xs text-muted-foreground">Limite informado pela Meta</p></div><GaugeIcon /></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full w-0 rounded-full bg-primary" /></div><p className="mt-3 text-[11px] leading-5 text-muted-foreground">O limite é compartilhado no nível do portfólio empresarial e não representa apenas mensagens entregues.</p></CardContent></Card><Card className="glass-card rounded-[1.25rem] border-amber-500/20"><CardContent className="flex items-start gap-3 p-4"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /><div><p className="text-sm font-semibold">Atenção antes de publicar</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Confirme o diagnóstico da conta e o histórico de Disparos antes de liberar um envio em massa.</p></div></CardContent></Card></div>
    </div>
  );
}

export function AccountHealthPanel() {
  return <HealthBoundary><AccountHealthContent /></HealthBoundary>;
}

function GaugeIcon() {
  return <div className="flex h-12 w-12 items-center justify-center rounded-full border-[5px] border-primary/20 border-t-primary text-primary"><Gauge className="h-5 w-5" /></div>;
}

export function SettingsPanel({ operatorRole }: { operatorRole: string }) {
  const rows = [
    { label: "Sessão operacional", value: "Temporária e revogável" },
    { label: "Papel atual", value: operatorRole },
    { label: "Auditoria de ações", value: "Registrada no servidor" },
    { label: "Produção Meta", value: "Depende do modo configurado" },
  ];
  return <Card className="glass-card rounded-[1.25rem]"><CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3"><div className="flex items-start justify-between gap-3"><div><CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Administração V4</CardDescription><CardTitle className="mt-1 text-xl tracking-[-0.04em]">Configurações</CardTitle><p className="mt-1 text-xs leading-5 text-muted-foreground">Perfis, regras, trilha de auditoria e preferências da operação.</p></div><Settings2 className="h-5 w-5 text-primary" /></div></CardHeader><CardContent className="space-y-3 p-4 pt-1 sm:p-5 sm:pt-1"><div className="grid gap-3 sm:grid-cols-2">{rows.map((row) => <div key={row.label} className="rounded-xl border border-border/60 bg-secondary/20 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{row.label}</p><p className="mt-1 text-sm font-semibold">{row.value}</p></div>)}</div><div className="rounded-xl border border-primary/20 bg-primary/5 p-4"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 text-primary" /><div><p className="text-sm font-semibold">Autoridade server-side aplicada</p><p className="mt-1 text-xs leading-5 text-muted-foreground">O papel limita ações no servidor. O PIN único ainda reduz a responsabilização individual; crie identidades separadas antes de operar com equipe.</p></div></div></div><Button variant="outline" className="rounded-xl bg-transparent"><History className="mr-2 h-4 w-4" /> Consultar trilha de auditoria</Button></CardContent></Card>;
}
