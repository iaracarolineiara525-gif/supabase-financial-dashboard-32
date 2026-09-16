import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { pinSessionHeaders } from "@/lib/v4PinSession";
import { countByStatus, dispatchesToCsv, downloadCsv, useDispatches } from "@/hooks/useDispatches";
import { Activity, AlertTriangle, ArrowRight, BarChart3, CheckCircle2, Clock3, Download, Eye, FileText, MessageCircle, RefreshCw, Send, ShieldCheck, Users, XCircle } from "lucide-react";

type HealthResponse = {
  ok?: boolean;
  phone?: Record<string, unknown> | null;
  account?: Record<string, unknown> | null;
  checks?: { phone?: boolean; account?: boolean; credentials?: boolean };
};

function KpiCard({ label, value, detail, icon: Icon, tone = "neutral" }: { label: string; value: string; detail: string; icon: typeof Send; tone?: "primary" | "neutral" | "danger" | "success" }) {
  return (
    <Card className="glass-card rounded-2xl">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
            <p className="mt-1.5 text-3xl font-semibold tracking-[-0.05em]">{value}</p>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{detail}</p>
          </div>
          <div className={cn("rounded-xl p-2.5", tone === "primary" ? "bg-primary/15 text-primary" : tone === "danger" ? "bg-destructive/10 text-destructive" : tone === "success" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-secondary text-foreground")}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FunnelBar({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{value} · {percent}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function DashboardPanel({ onNavigate }: { onNavigate?: (section: "campaigns" | "dispatches" | "queue" | "contacts" | "reports" | "health" | "inbox") => void }) {
  const { rows, totals, isLoading, loadError, fetchedAt, reload } = useDispatches();
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.functions.invoke("meta-health", { body: {}, headers: pinSessionHeaders() });
      if (active) setHealth((data as HealthResponse) || null);
    })();
    return () => { active = false; };
  }, []);

  const stats = useMemo(() => {
    const accepted = rows.filter((row) => ["processando", "enviada", "entregue", "lida"].includes(String(row.status).toLowerCase())).length;
    return {
      total: rows.length,
      real: rows.filter((row) => !row.dryRun).length,
      accepted,
      delivered: countByStatus(rows, "entregue"),
      read: countByStatus(rows, "lida"),
      failed: countByStatus(rows, "falhou"),
      pending: rows.filter((row) => ["pending", "processando"].includes(String(row.status).toLowerCase())).length,
    };
  }, [rows]);

  const daily = useMemo(() => {
    const days: Array<{ key: string; label: string; count: number }> = [];
    for (let index = 6; index >= 0; index -= 1) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - index);
      days.push({ key: date.toDateString(), label: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), count: 0 });
    }
    rows.forEach((row) => {
      const stamp = row.sentAt || row.createdAt;
      if (!stamp) return;
      const parsed = new Date(stamp);
      if (Number.isNaN(parsed.getTime())) return;
      parsed.setHours(0, 0, 0, 0);
      const bucket = days.find((day) => day.key === parsed.toDateString());
      if (bucket) bucket.count += 1;
    });
    return days;
  }, [rows]);

  const maxDaily = Math.max(1, ...daily.map((day) => day.count));

  const templateRanking = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) => {
      const name = row.templateName || (row.messageType === "template" ? "template sem nome" : "texto livre");
      map.set(name, (map.get(name) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [rows]);

  const recent = rows.slice(0, 6);
  const phoneName = typeof health?.phone?.verified_name === "string" ? health.phone.verified_name : "—";
  const phoneStatus = typeof health?.phone?.status === "string" ? health.phone.status : "—";
  const phoneQuality = typeof health?.phone?.quality_rating === "string" ? health.phone.quality_rating : "—";
  const accountName = typeof health?.account?.name === "string" ? health.account.name : "—";
  const connected = Boolean(health?.checks?.credentials && health?.checks?.phone);
  const updatedAt = fetchedAt ? new Date(fetchedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <div className="space-y-4">
      <Card className="glass-card rounded-[1.25rem]">
        <CardHeader className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Centro de comando</CardDescription>
            <CardTitle className="mt-1 text-2xl tracking-[-0.05em]">Dashboard de dados</CardTitle>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Tudo calculado a partir dos registros reais do servidor · atualizado às {updatedAt}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-xl bg-transparent" onClick={() => void reload()} disabled={isLoading}>
              <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} /> Atualizar
            </Button>
            <Button variant="outline" className="rounded-xl bg-transparent" onClick={() => downloadCsv(`meta-distribuidora-dashboard-${new Date().toISOString().slice(0, 10)}.csv`, dispatchesToCsv(rows))} disabled={rows.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Exportar CSV
            </Button>
            <Button className="rounded-xl" onClick={() => onNavigate?.("campaigns")}><Send className="mr-2 h-4 w-4" /> Nova campanha</Button>
          </div>
        </CardHeader>
        {loadError && <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0"><div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-700 dark:text-amber-300">{loadError}</div></CardContent>}
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Disparos registrados" value={String(stats.total)} detail={`${stats.real} envios reais`} icon={Send} tone="primary" />
        <KpiCard label="Aceitas pela Meta" value={String(stats.accepted)} detail="Processando, enviadas ou além" icon={CheckCircle2} tone="success" />
        <KpiCard label="Entregues" value={String(stats.delivered)} detail={`${stats.read} lidas`} icon={Eye} tone="neutral" />
        <KpiCard label="Falhas" value={String(stats.failed)} detail={`${stats.pending} aguardando retorno`} icon={XCircle} tone="danger" />
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="glass-card rounded-[1.25rem]">
          <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
            <CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Últimos 7 dias</CardDescription>
            <CardTitle className="mt-1 text-lg tracking-[-0.04em]">Volume diário de disparos</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2 sm:p-5 sm:pt-2">
            <div className="flex h-40 items-end gap-2">
              {daily.map((day) => (
                <div key={day.key} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-[11px] font-semibold text-muted-foreground">{day.count}</span>
                  <div className="flex w-full flex-1 items-end">
                    <div className="w-full rounded-t-lg bg-primary/70 transition-all" style={{ height: `${Math.max(4, (day.count / maxDaily) * 100)}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{day.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card rounded-[1.25rem]">
          <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
            <CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Funil de entrega</CardDescription>
            <CardTitle className="mt-1 text-lg tracking-[-0.04em]">Do envio à leitura</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-2 sm:p-5 sm:pt-2">
            <FunnelBar label="Registrados" value={stats.total} total={stats.total} tone="bg-foreground/70" />
            <FunnelBar label="Aceitos pela API" value={stats.accepted} total={stats.total} tone="bg-primary" />
            <FunnelBar label="Entregues" value={stats.delivered} total={stats.total} tone="bg-emerald-500" />
            <FunnelBar label="Lidas" value={stats.read} total={stats.total} tone="bg-sky-500" />
            <FunnelBar label="Falhas" value={stats.failed} total={stats.total} tone="bg-destructive" />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="glass-card rounded-[1.25rem]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 sm:p-5 sm:pb-2">
            <div>
              <CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Atividade recente</CardDescription>
              <CardTitle className="mt-1 text-lg tracking-[-0.04em]">Últimos disparos</CardTitle>
            </div>
            <Button variant="ghost" className="text-primary" onClick={() => onNavigate?.("dispatches")}>Ver todos <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-2 sm:p-5 sm:pt-2">
            {recent.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">{isLoading ? "Carregando registros..." : "Nenhum disparo registrado até agora."}</p>}
            {recent.map((row) => {
              const stamp = row.sentAt || row.createdAt;
              const when = stamp ? new Date(stamp).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
              return (
                <div key={row.id} className="flex items-center gap-3 rounded-xl border border-border/60 p-3">
                  <div className="rounded-lg bg-secondary p-2 text-foreground"><MessageCircle className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{row.templateName || row.preview || row.messageType}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{row.to} · {when}</p>
                  </div>
                  <Badge variant="outline" className="rounded-full text-[10px] uppercase tracking-[0.08em]">{row.status}</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Card className="glass-card rounded-[1.25rem]">
            <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Canal WhatsApp</CardDescription>
                  <CardTitle className="mt-1 text-lg tracking-[-0.04em]">{accountName}</CardTitle>
                </div>
                <Badge variant="outline" className={cn("rounded-full", connected ? "border-primary/30 bg-primary/10 text-primary" : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300")}>
                  {connected ? "Conectado" : "Verificar"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-2 text-sm sm:p-5 sm:pt-2">
              {[{ label: "Número", value: phoneName, icon: Activity }, { label: "Status", value: phoneStatus, icon: ShieldCheck }, { label: "Qualidade", value: phoneQuality, icon: AlertTriangle }].map((row) => (
                <div key={row.label} className="flex items-center gap-3 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                  <row.icon className="h-4 w-4 text-primary" />
                  <span className="flex-1 text-muted-foreground">{row.label}</span>
                  <span className="truncate font-medium">{row.value}</span>
                </div>
              ))}
              <Button variant="ghost" className="w-full justify-between px-2 text-primary hover:bg-primary/10" onClick={() => onNavigate?.("health")}>Abrir saúde da conta <ArrowRight className="h-4 w-4" /></Button>
            </CardContent>
          </Card>

          <Card className="glass-card rounded-[1.25rem]">
            <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
              <CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Distribuição</CardDescription>
              <CardTitle className="mt-1 text-lg tracking-[-0.04em]">Templates mais usados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-2 sm:p-5 sm:pt-2">
              {templateRanking.length === 0 && <p className="text-xs text-muted-foreground">Sem dados suficientes ainda.</p>}
              {templateRanking.map(([name, count], index) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">{String(index + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                  <span className="text-sm font-semibold">{count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Caixa de entrada", icon: MessageCircle, section: "inbox" as const },
          { label: "Fila e entregas", icon: Clock3, section: "queue" as const },
          { label: "Contatos", icon: Users, section: "contacts" as const },
          { label: "Relatórios", icon: BarChart3, section: "reports" as const },
        ].map((shortcut) => (
          <Button key={shortcut.label} variant="outline" className="h-14 justify-between rounded-2xl bg-transparent px-4 text-sm" onClick={() => onNavigate?.(shortcut.section)}>
            <span className="flex items-center gap-3"><shortcut.icon className="h-5 w-5 text-primary" /> {shortcut.label}</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </Button>
        ))}
      </section>

      <p className="text-[11px] leading-5 text-muted-foreground"><FileText className="mr-1 inline h-3 w-3" /> Números mascarados por privacidade. Nenhum dado fictício é exibido neste dashboard.</p>
    </div>
  );
}
