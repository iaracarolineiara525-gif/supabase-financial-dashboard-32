import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { pinSessionHeaders } from "@/lib/v4PinSession";
import { CheckCircle2, Clock3, RefreshCw, Search, Send, XCircle } from "lucide-react";

export type DispatchRow = {
  id: string;
  createdAt: string | null;
  sentAt: string | null;
  to: string;
  messageType: string;
  templateName: string | null;
  preview: string;
  status: string;
  dryRun: boolean;
  externalId: string | null;
  lastError: string | null;
  operatorKey: string | null;
};

type DispatchTotals = {
  total: number;
  real: number;
  simulated: number;
  failed: number;
  accepted: number;
  lastSendAt: string | null;
};

const REFRESH_INTERVAL_MS = 30_000;

const statusTone: Record<string, string> = {
  falhou: "border-destructive/25 bg-destructive/10 text-destructive",
  simulada: "border-border bg-secondary text-foreground",
  pending: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  processando: "border-primary/25 bg-primary/10 text-primary",
  entregue: "border-primary/25 bg-primary/10 text-primary",
  lida: "border-primary/25 bg-primary/10 text-primary",
};

function formatDateTime(value: string | null): { date: string; time: string } {
  if (!value) return { date: "—", time: "—" };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: "—", time: "—" };
  return {
    date: parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }),
    time: parsed.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

function DispatchMetric({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof Send; tone: "primary" | "neutral" | "danger" }) {
  return (
    <Card className="glass-card rounded-2xl">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
            <p className="mt-1.5 text-2xl font-semibold tracking-[-0.05em]">{value}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
          </div>
          <div className={cn("rounded-xl p-2.5", tone === "primary" ? "bg-primary/15 text-primary" : tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-secondary text-foreground")}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function DispatchPanel() {
  const [rows, setRows] = useState<DispatchRow[]>([]);
  const [totals, setTotals] = useState<DispatchTotals | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modeFilter, setModeFilter] = useState<"all" | "real" | "simulated" | "failed">("all");

  const loadDispatches = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.functions.invoke("message-outbox-list", { body: { limit: 200 }, headers: pinSessionHeaders() });
    setIsLoading(false);
    if (error || !data?.ok) {
      setLoadError("Não foi possível carregar o histórico de disparos agora.");
      return;
    }
    setLoadError(null);
    setRows(Array.isArray(data.rows) ? data.rows : []);
    setTotals(data.totals || null);
    setFetchedAt(typeof data.fetchedAt === "string" ? data.fetchedAt : null);
  };

  useEffect(() => {
    void loadDispatches();
    const timer = window.setInterval(() => void loadDispatches(), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const matchesSearch = `${row.to} ${row.templateName || ""} ${row.preview} ${row.status}`.toLowerCase().includes(search.toLowerCase());
    const matchesMode = modeFilter === "all"
      || (modeFilter === "real" && !row.dryRun)
      || (modeFilter === "simulated" && row.dryRun)
      || (modeFilter === "failed" && row.status.toLowerCase() === "falhou");
    return matchesSearch && matchesMode;
  }), [rows, search, modeFilter]);

  const lastSend = formatDateTime(totals?.lastSendAt ?? null);
  const updated = formatDateTime(fetchedAt);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DispatchMetric label="Disparos registrados" value={String(totals?.total ?? 0)} detail="Últimos 200 registros reais" icon={Send} tone="primary" />
        <DispatchMetric label="Envios reais" value={String(totals?.real ?? 0)} detail="Enviados para a Meta" icon={CheckCircle2} tone="neutral" />
        <DispatchMetric label="Simulações" value={String(totals?.simulated ?? 0)} detail="Dry run, sem envio" icon={Clock3} tone="neutral" />
        <DispatchMetric label="Falhas" value={String(totals?.failed ?? 0)} detail="Revisar antes de retentar" icon={XCircle} tone="danger" />
      </div>

      <Card className="glass-card rounded-[1.25rem]">
        <CardHeader className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Histórico de disparos</CardDescription>
            <CardTitle className="mt-1 text-xl tracking-[-0.04em]">Disparos</CardTitle>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              Lista real de cada envio com data, hora, destino, tipo e status. Último envio: {lastSend.date} às {lastSend.time} · Atualizado às {updated.time}
            </p>
          </div>
          <Button variant="outline" size="sm" className="rounded-lg bg-transparent" onClick={() => void loadDispatches()} disabled={isLoading}>
            <RefreshCw className={cn("mr-2 h-3.5 w-3.5", isLoading && "animate-spin")} /> Forçar atualização
          </Button>
        </CardHeader>
        <CardContent className="p-3 sm:p-5">
          {loadError && <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-700 dark:text-amber-300">{loadError}</div>}

          <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por destino, template ou status..." className="h-10 rounded-xl pl-10" />
            </div>
            <div className="flex flex-wrap gap-1 rounded-xl border border-border/60 bg-secondary/30 p-1">
              {[{ value: "all", label: "Todos" }, { value: "real", label: "Reais" }, { value: "simulated", label: "Simulados" }, { value: "failed", label: "Falhas" }].map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setModeFilter(filter.value as typeof modeFilter)}
                  className={cn("rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors", modeFilter === filter.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-background hover:text-foreground")}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full min-w-[960px] text-left text-xs">
              <thead className="bg-secondary/40 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">Data</th>
                  <th className="px-3 py-3">Hora</th>
                  <th className="px-3 py-3">Destino</th>
                  <th className="px-3 py-3">Tipo</th>
                  <th className="px-3 py-3">Template</th>
                  <th className="px-3 py-3">Mensagem</th>
                  <th className="px-3 py-3">Modo</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Message ID</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const stamp = formatDateTime(row.sentAt || row.createdAt);
                  return (
                    <tr key={row.id} className="border-t border-border/50 align-top">
                      <td className="px-3 py-3 text-muted-foreground">{stamp.date}</td>
                      <td className="px-3 py-3 font-mono text-[11px]">{stamp.time}</td>
                      <td className="px-3 py-3 font-mono text-[11px]">{row.to}</td>
                      <td className="px-3 py-3 capitalize text-muted-foreground">{row.messageType}</td>
                      <td className="px-3 py-3 text-muted-foreground">{row.templateName || "—"}</td>
                      <td className="max-w-[18rem] truncate px-3 py-3">{row.preview || "—"}</td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", row.dryRun ? "border-border bg-secondary" : "border-primary/25 bg-primary/10 text-primary")}>
                          {row.dryRun ? "Simulado" : "Real"}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", statusTone[row.status.toLowerCase()] || "border-border bg-secondary")}>
                          {row.status}
                        </Badge>
                        {row.lastError && <p className="mt-1 max-w-[16rem] text-[10px] leading-4 text-destructive">{row.lastError}</p>}
                      </td>
                      <td className="px-3 py-3 font-mono text-[10px] text-muted-foreground">{row.externalId || "—"}</td>
                    </tr>
                  );
                })}
                {filteredRows.length === 0 && (
                  <tr className="border-t border-border/50">
                    <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">{isLoading ? "Carregando disparos..." : "Nenhum disparo registrado até agora."}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
            Mostrando {filteredRows.length} de {rows.length} registros. Números aparecem mascarados; a lista atualiza sozinha a cada 30 segundos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
