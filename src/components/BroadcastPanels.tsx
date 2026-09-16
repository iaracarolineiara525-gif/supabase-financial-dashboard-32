import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { pinSessionHeaders } from "@/lib/v4PinSession";
import { normalizePhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle2, Clock3, FileText, ListFilter, RefreshCw, Send, Users, XCircle } from "lucide-react";

export type Progress = { total: number; pending: number; sending: number; sent: number; delivered: number; failed: number; skipped: number };
export type CampaignRow = {
  id: string;
  name: string;
  list_name: string | null;
  template_name: string | null;
  template_language: string | null;
  status: string;
  total_contacts: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  progress: Progress;
};
type ListSummary = { id: string; name: string; total: number; valid: number; invalid: number };
type MetaTemplate = { name?: string; language?: string; category?: string; status?: string; components?: Array<{ type?: string; text?: string }> };
type Recipient = { id: string; contact_name: string | null; phone: string; status: string; attempts: number; last_error: string | null; sent_at: string | null; delivered_at: string | null; external_id: string | null; updated_at: string };

const EMPTY_PROGRESS: Progress = { total: 0, pending: 0, sending: 0, sent: 0, delivered: 0, failed: 0, skipped: 0 };
const ACTIVE_CAMPAIGN_KEY = "v4:active-campaign";

export function formatStamp(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const RECIPIENT_LABEL: Record<string, string> = {
  pending: "Pendente",
  retry: "Retentativa",
  sending: "Enviando",
  sent: "Enviado",
  delivered: "Entregue",
  read: "Lida",
  failed: "Falhou",
  skipped: "Ignorado",
};

function RecipientStatus({ status }: { status: string }) {
  const tone = status === "failed" ? "border-destructive/25 bg-destructive/10 text-destructive"
    : status === "delivered" || status === "read" ? "border-primary/25 bg-primary/10 text-primary"
    : status === "sent" ? "border-primary/20 bg-primary/5 text-primary"
    : status === "sending" ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
    : "border-border bg-secondary text-foreground";
  return <Badge variant="outline" className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", tone)}>{RECIPIENT_LABEL[status] || status}</Badge>;
}

function ProgressBar({ progress }: { progress: Progress }) {
  const total = Math.max(1, progress.total);
  const sent = (progress.sent / total) * 100;
  const failed = (progress.failed / total) * 100;
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
      <div className="flex h-full">
        <div className="h-full bg-primary transition-all" style={{ width: `${sent}%` }} />
        <div className="h-full bg-destructive transition-all" style={{ width: `${failed}%` }} />
      </div>
    </div>
  );
}

function ProgressCards({ progress }: { progress: Progress }) {
  const cards = [
    { label: "Enviados", value: progress.sent, icon: CheckCircle2, tone: "text-primary" },
    { label: "Entregues", value: progress.delivered, icon: CheckCircle2, tone: "text-primary" },
    { label: "Pendentes", value: progress.pending + progress.sending, icon: Clock3, tone: "text-amber-600 dark:text-amber-300" },
    { label: "Não enviados / erros", value: progress.failed, icon: XCircle, tone: "text-destructive" },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-border/60 bg-secondary/30 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{card.label}</p>
          <p className={cn("mt-1 text-2xl font-semibold", card.tone)}>{card.value}</p>
        </div>
      ))}
    </div>
  );
}

export function BroadcastPanel({ initialList }: { initialList?: string | null }) {
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [templates, setTemplates] = useState<MetaTemplate[]>([]);
  const [mode, setMode] = useState<"list" | "single">("list");
  const [listName, setListName] = useState(initialList || "");
  const [singleName, setSingleName] = useState("");
  const [singlePhone, setSinglePhone] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [variables, setVariables] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [done, setDone] = useState(false);
  const [history, setHistory] = useState<CampaignRow[]>([]);
  const runningRef = useRef(false);
  const resumeRef = useRef<((id: string) => Promise<void>) | null>(null);
  const { toast } = useToast();

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    const [listsResponse, templatesResponse, historyResponse] = await Promise.all([
      supabase.functions.invoke("message-lists", { body: { action: "overview" }, headers: pinSessionHeaders() }),
      supabase.functions.invoke("meta-templates-list", { body: {}, headers: pinSessionHeaders() }),
      supabase.functions.invoke("message-broadcast", { body: { action: "history" }, headers: pinSessionHeaders() }),
    ]);
    if (!silent) setIsLoading(false);
    if (listsResponse.data?.ok) setLists(listsResponse.data.lists || []);
    if (templatesResponse.data?.ok) setTemplates((templatesResponse.data.templates || []).filter((template: MetaTemplate) => String(template.status || "").toUpperCase() === "APPROVED"));
    if (historyResponse.data?.ok) setHistory(historyResponse.data.campaigns || []);
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);
  useEffect(() => { if (initialList) { setMode("list"); setListName(initialList); } }, [initialList]);

  // Retoma automaticamente um disparo que ficou em andamento após atualizar a página
  useEffect(() => {
    const stored = window.localStorage.getItem(ACTIVE_CAMPAIGN_KEY);
    if (!stored) return;
    setCampaignId(stored);
    void (async () => {
      const { data } = await supabase.functions.invoke("message-broadcast", { body: { action: "status", campaignId: stored }, headers: pinSessionHeaders() });
      if (!data?.ok) { window.localStorage.removeItem(ACTIVE_CAMPAIGN_KEY); setCampaignId(null); return; }
      if (data.progress) setProgress(data.progress as Progress);
      const finished = Boolean(data.done) || (data.progress?.pending ?? 0) === 0;
      if (finished) { setDone(true); window.localStorage.removeItem(ACTIVE_CAMPAIGN_KEY); return; }
      void resumeRef.current?.(stored);
    })();
  }, []);


  const selectedList = lists.find((list) => list.name === listName) || null;
  const selectedTemplate = templates.find((template) => `${template.name}|${template.language}` === templateKey) || null;
  const templateBody = selectedTemplate?.components?.find((component) => component.type?.toUpperCase() === "BODY")?.text || "";
  const variableCount = useMemo(() => {
    const matches: string[] = templateBody.match(/\{\{\s*(\d+)\s*\}\}/g) ?? [];
    return matches.reduce<number>((max, token) => Math.max(max, Number(token.replace(/\D/g, "")) || 0), 0);
  }, [templateBody]);

  const singleNormalized = normalizePhone(singlePhone);
  const audienceCount = mode === "list" ? (selectedList?.valid || 0) : (singleNormalized.valid ? 1 : 0);
  const canStart = Boolean(selectedTemplate) && audienceCount > 0 && !isStarting
    && Array.from({ length: variableCount }).every((_, index) => (variables[index] || "").trim().length > 0);

  const runLoop = useCallback(async (id: string) => {
    if (runningRef.current) return;
    runningRef.current = true;
    window.localStorage.setItem(ACTIVE_CAMPAIGN_KEY, id);
    try {
      for (let iteration = 0; iteration < 400; iteration += 1) {
        const { data, error } = await supabase.functions.invoke("message-broadcast", { body: { action: "run", campaignId: id }, headers: pinSessionHeaders() });
        if (error || !data?.ok) {
          toast({ title: "Processamento interrompido", description: data?.error || error?.message || "Tente retomar em instantes.", variant: "destructive" });
          break;
        }
        if (data.progress) setProgress(data.progress as Progress);
        if (data.done) { setDone(true); window.localStorage.removeItem(ACTIVE_CAMPAIGN_KEY); break; }
        await new Promise((resolve) => setTimeout(resolve, data.rateLimited ? 8000 : 1200));
      }
    } finally {
      runningRef.current = false;
      void loadAll(true);
    }
  }, [loadAll, toast]);

  useEffect(() => { resumeRef.current = runLoop; }, [runLoop]);


  const handleStart = async () => {
    if (!selectedTemplate) return;
    const parameters = Array.from({ length: variableCount }, (_, index) => (variables[index] || "").trim());
    setIsStarting(true);
    const { data, error } = await supabase.functions.invoke("message-broadcast", {
      body: {
        action: "start",
        ...(mode === "list" ? { listName } : { phone: singlePhone, name: singleName || "Contato" }),
        templateName: selectedTemplate.name,
        templateLanguage: selectedTemplate.language || "pt_BR",
        templateCategory: (selectedTemplate.category || "utility").toLowerCase(),
        parameters,
      },
      headers: pinSessionHeaders(),
    });
    setIsStarting(false);
    if (error || !data?.ok) {
      toast({ title: "Disparo não iniciado", description: data?.error || error?.message || "Revise a seleção e tente novamente.", variant: "destructive" });
      return;
    }
    setCampaignId(String(data.campaign.id));
    setProgress((data.progress as Progress) || { ...EMPTY_PROGRESS, total: data.total, pending: data.total });
    setDone(false);
    toast({ title: "Disparo iniciado", description: `${data.total} contato(s) na fila. O sistema processa tudo automaticamente.` });
    void runLoop(String(data.campaign.id));
  };

  return (
    <div className="space-y-3">
      <Card className="glass-card rounded-[1.25rem]">
        <CardHeader className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Envio em massa</CardDescription>
            <CardTitle className="mt-1 text-xl tracking-[-0.04em]">Disparos</CardTitle>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Escolha a lista ou um contato, selecione o template aprovado e inicie com 1 clique. O sistema envia, retenta falhas temporárias e acompanha tudo em tempo real.</p>
          </div>
          <Button variant="outline" className="rounded-xl bg-transparent" onClick={() => void loadAll()} disabled={isLoading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} /> Atualizar
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">1 · Público</p>
              <div className="mt-2 flex gap-1 rounded-xl border border-border/60 bg-secondary/30 p-1">
                {[{ id: "list", label: "Lista" }, { id: "single", label: "Contato individual" }].map((option) => (
                  <button key={option.id} type="button" onClick={() => setMode(option.id as "list" | "single")} className={cn("flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors", mode === option.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{option.label}</button>
                ))}
              </div>
              {mode === "list" ? (
                <div className="mt-2 space-y-2">
                  <select value={listName} onChange={(event) => setListName(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm">
                    <option value="">Selecione uma lista</option>
                    {lists.map((list) => <option key={list.id} value={list.name}>{list.name} · {list.total} contatos</option>)}
                  </select>
                  {selectedList && (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg border border-border/60 bg-secondary/30 p-2.5"><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Contatos</p><p className="text-lg font-semibold">{selectedList.total}</p></div>
                      <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5"><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Válidos</p><p className="text-lg font-semibold text-primary">{selectedList.valid}</p></div>
                      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-2.5"><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Inválidos</p><p className="text-lg font-semibold text-destructive">{selectedList.invalid}</p></div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <Input value={singleName} onChange={(event) => setSingleName(event.target.value)} placeholder="Nome do contato" className="h-11 rounded-xl" />
                  <Input value={singlePhone} onChange={(event) => setSinglePhone(event.target.value)} placeholder="(44) 99999-9999" className="h-11 rounded-xl" />
                  {singlePhone && <p className={cn("text-[11px]", singleNormalized.valid ? "text-primary" : "text-destructive")}>{singleNormalized.valid ? `Padronizado: ${singleNormalized.e164}` : singleNormalized.reason}</p>}
                </div>
              )}
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">2 · Template aprovado na Meta</p>
              <select value={templateKey} onChange={(event) => { setTemplateKey(event.target.value); setVariables([]); }} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm">
                <option value="">Selecione um template aprovado</option>
                {templates.map((template) => <option key={`${template.name}|${template.language}`} value={`${template.name}|${template.language}`}>{template.name} · {template.language} · {template.category || "—"}</option>)}
              </select>
              {templates.length === 0 && <p className="mt-1 text-[11px] text-muted-foreground">Nenhum template aprovado disponível. Sincronize na aba Templates.</p>}
              {templateBody && <div className="mt-2 rounded-xl border border-border/60 bg-secondary/20 p-3 text-[11px] leading-5 text-muted-foreground">{templateBody}</div>}
              {variableCount > 0 && (
                <div className="mt-2 space-y-2">
                  {Array.from({ length: variableCount }, (_, index) => (
                    <div key={index} className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{`Variável {{${index + 1}}}`}</label>
                      <Input value={variables[index] || ""} onChange={(event) => setVariables((current) => { const next = [...current]; next[index] = event.target.value; return next; })} placeholder="Use {{nome}} para o primeiro nome do contato" className="h-10 rounded-lg text-sm" />
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground">Dica: escreva <span className="font-mono">{"{{nome}}"}</span> para personalizar com o primeiro nome de cada contato.</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">3 · Resumo</p>
              <div className="mt-2 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Público</span><span className="font-semibold">{mode === "list" ? (listName || "—") : (singleName || singleNormalized.e164 || "—")}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Contatos válidos</span><span className="font-semibold">{audienceCount}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Template</span><span className="font-semibold">{selectedTemplate?.name || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Idioma</span><span className="font-semibold">{selectedTemplate?.language || "—"}</span></div>
              </div>
              <Button className="mt-3 w-full rounded-xl" onClick={() => void handleStart()} disabled={!canStart}>
                <Send className="mr-2 h-4 w-4" /> {isStarting ? "Iniciando..." : `Iniciar disparo (${audienceCount})`}
              </Button>
              <p className="mt-2 text-[10px] leading-4 text-muted-foreground">Envio real pela Meta. Duplicidades e números inválidos já foram removidos automaticamente.</p>
            </div>

            {campaignId && (
              <div className="space-y-2 rounded-xl border border-border/60 bg-secondary/20 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{done ? "Disparo concluído" : "Processando disparo..."}</p>
                  <Badge variant="outline" className="rounded-full text-[10px]">{progress.sent + progress.failed}/{progress.total}</Badge>
                </div>
                <ProgressBar progress={progress} />
                <ProgressCards progress={progress} />
                {!done && <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><RefreshCw className="h-3 w-3 animate-spin" /> Retentativas automáticas ativas — pode acompanhar em Fila e entregas.</p>}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card rounded-[1.25rem]">
        <CardHeader className="border-b border-border/60 p-4 sm:p-5"><CardTitle className="text-lg">Últimos disparos</CardTitle><CardDescription className="text-xs">Data, hora, lista, template e resultado de cada envio.</CardDescription></CardHeader>
        <CardContent className="p-3 sm:p-5">
          <BroadcastHistoryTable campaigns={history} />
        </CardContent>
      </Card>
    </div>
  );
}

export function BroadcastHistoryTable({ campaigns }: { campaigns: CampaignRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full min-w-[900px] text-left text-xs">
        <thead className="bg-secondary/40 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          <tr><th className="px-3 py-3">Data e hora</th><th className="px-3 py-3">Lista</th><th className="px-3 py-3">Template</th><th className="px-3 py-3">Contatos</th><th className="px-3 py-3">Enviados</th><th className="px-3 py-3">Entregues</th><th className="px-3 py-3">Não enviados</th><th className="px-3 py-3">Pendentes</th><th className="px-3 py-3">Status</th></tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => (
            <tr key={campaign.id} className="border-t border-border/50">
              <td className="px-3 py-3 text-muted-foreground">{formatStamp(campaign.started_at || campaign.created_at)}</td>
              <td className="px-3 py-3 font-medium">{campaign.list_name || "—"}</td>
              <td className="px-3 py-3 text-muted-foreground">{campaign.template_name || "—"}</td>
              <td className="px-3 py-3">{campaign.progress.total}</td>
              <td className="px-3 py-3 text-primary">{campaign.progress.sent}</td>
              <td className="px-3 py-3">{campaign.progress.delivered}</td>
              <td className="px-3 py-3 text-destructive">{campaign.progress.failed}</td>
              <td className="px-3 py-3">{campaign.progress.pending + campaign.progress.sending}</td>
              <td className="px-3 py-3"><Badge variant="outline" className="rounded-full text-[10px]">{campaign.status === "completed" ? "Concluído" : campaign.status === "running" ? "Em execução" : campaign.status}</Badge></td>
            </tr>
          ))}
          {campaigns.length === 0 && <tr className="border-t border-border/50"><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Nenhum disparo registrado ainda.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function BroadcastQueuePanel() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [campaignId, setCampaignId] = useState<string>("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const loadCampaigns = useCallback(async () => {
    const { data } = await supabase.functions.invoke("message-broadcast", { body: { action: "history" }, headers: pinSessionHeaders() });
    if (data?.ok) {
      const list = (data.campaigns || []) as CampaignRow[];
      setCampaigns(list);
      setCampaignId((current) => current || (list[0]?.id ?? ""));
    }
  }, []);

  const loadStatus = useCallback(async (id: string, silent = false) => {
    if (!id) return;
    if (!silent) setIsLoading(true);
    const { data } = await supabase.functions.invoke("message-broadcast", { body: { action: "status", campaignId: id }, headers: pinSessionHeaders() });
    if (!silent) setIsLoading(false);
    if (data?.ok) {
      setRecipients((data.recipients || []) as Recipient[]);
      setProgress((data.progress as Progress) || EMPTY_PROGRESS);
    }
  }, []);

  useEffect(() => { void loadCampaigns(); }, [loadCampaigns]);
  useEffect(() => { void loadStatus(campaignId); }, [campaignId, loadStatus]);
  useEffect(() => {
    const interval = window.setInterval(() => { void loadStatus(campaignId, true); }, 8000);
    return () => window.clearInterval(interval);
  }, [campaignId, loadStatus]);

  const visible = onlyFailed ? recipients.filter((row) => ["failed", "pending", "retry"].includes(row.status)) : recipients;

  return (
    <Card className="glass-card rounded-[1.25rem]">
      <CardHeader className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Acompanhamento em tempo real</CardDescription>
          <CardTitle className="mt-1 text-xl tracking-[-0.04em]">Fila e entregas</CardTitle>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Status individual de cada contato do disparo, atualizado automaticamente pelo retorno da Meta.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={onlyFailed ? "default" : "outline"} className={cn("rounded-xl", !onlyFailed && "bg-transparent")} onClick={() => setOnlyFailed((current) => !current)}><ListFilter className="mr-2 h-4 w-4" /> Não receberam</Button>
          <Button variant="outline" className="rounded-xl bg-transparent" onClick={() => void loadStatus(campaignId)} disabled={isLoading}><RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} /> Atualizar</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-3 sm:p-5">
        <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm">
          {campaigns.length === 0 && <option value="">Nenhum disparo registrado</option>}
          {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{formatStamp(campaign.started_at || campaign.created_at)} · {campaign.list_name} · {campaign.template_name}</option>)}
        </select>
        <ProgressCards progress={progress} />
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="bg-secondary/40 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              <tr><th className="px-3 py-3">Contato</th><th className="px-3 py-3">Telefone</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Tentativas</th><th className="px-3 py-3">Enviado</th><th className="px-3 py-3">Entregue</th><th className="px-3 py-3">Erro</th></tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="border-t border-border/50">
                  <td className="px-3 py-3 font-medium">{row.contact_name || "—"}</td>
                  <td className="px-3 py-3 font-mono text-muted-foreground">{row.phone}</td>
                  <td className="px-3 py-3"><RecipientStatus status={row.status} /></td>
                  <td className="px-3 py-3 text-muted-foreground">{row.attempts}</td>
                  <td className="px-3 py-3 text-muted-foreground">{formatStamp(row.sent_at)}</td>
                  <td className="px-3 py-3 text-muted-foreground">{formatStamp(row.delivered_at)}</td>
                  <td className="px-3 py-3 text-destructive">{row.last_error ? <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {row.last_error.slice(0, 60)}</span> : "—"}</td>
                </tr>
              ))}
              {visible.length === 0 && <tr className="border-t border-border/50"><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">{isLoading ? "Carregando fila..." : "Nenhum contato neste filtro."}</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function campaignsToCsv(campaigns: CampaignRow[]): string {
  const header = ["Data", "Hora", "Lista", "Template", "Total", "Enviados", "Entregues", "Nao enviados", "Erros", "Pendentes", "Status"];
  const lines = campaigns.map((campaign) => {
    const stamp = new Date(campaign.started_at || campaign.created_at);
    return [
      stamp.toLocaleDateString("pt-BR"),
      stamp.toLocaleTimeString("pt-BR"),
      campaign.list_name || "",
      campaign.template_name || "",
      campaign.progress.total,
      campaign.progress.sent,
      campaign.progress.delivered,
      campaign.progress.failed,
      campaign.progress.failed,
      campaign.progress.pending + campaign.progress.sending,
      campaign.status,
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",");
  });
  return [header.join(","), ...lines].join("\n");
}

export function BroadcastReportsPanel() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    const { data } = await supabase.functions.invoke("message-broadcast", { body: { action: "history" }, headers: pinSessionHeaders() });
    setIsLoading(false);
    if (data?.ok) setCampaigns((data.campaigns || []) as CampaignRow[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const totals = campaigns.reduce((accumulator, campaign) => ({
    contacts: accumulator.contacts + campaign.progress.total,
    sent: accumulator.sent + campaign.progress.sent,
    delivered: accumulator.delivered + campaign.progress.delivered,
    failed: accumulator.failed + campaign.progress.failed,
    pending: accumulator.pending + campaign.progress.pending + campaign.progress.sending,
  }), { contacts: 0, sent: 0, delivered: 0, failed: 0, pending: 0 });

  const handleExport = () => {
    const blob = new Blob([campaignsToCsv(campaigns)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `meta-distribuidora-disparos-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="glass-card rounded-[1.25rem]">
      <CardHeader className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Histórico da operação</CardDescription>
          <CardTitle className="mt-1 text-xl tracking-[-0.04em]">Relatórios</CardTitle>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Cada disparo é registrado automaticamente com data, hora, lista, template e resultados.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-xl bg-transparent" onClick={() => void load()} disabled={isLoading}><RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} /> Atualizar</Button>
          <Button variant="outline" className="rounded-xl bg-transparent" onClick={handleExport} disabled={campaigns.length === 0}><FileText className="mr-2 h-4 w-4" /> Exportar CSV</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-3 sm:p-5">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Disparos", value: campaigns.length, icon: Send },
            { label: "Contatos", value: totals.contacts, icon: Users },
            { label: "Enviados", value: totals.sent, icon: CheckCircle2 },
            { label: "Entregues", value: totals.delivered, icon: CheckCircle2 },
            { label: "Não enviados", value: totals.failed, icon: XCircle },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-border/60 bg-secondary/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-2xl font-semibold">{card.value}</p>
            </div>
          ))}
        </div>
        <BroadcastHistoryTable campaigns={campaigns} />
      </CardContent>
    </Card>
  );
}
