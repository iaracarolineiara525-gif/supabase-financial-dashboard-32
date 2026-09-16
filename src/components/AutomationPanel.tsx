import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { pinSessionHeaders } from "@/lib/v4PinSession";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  Clock3,
  Copy,
  GitBranch,
  History,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  UserRoundPlus,
  Workflow,
  X,
} from "lucide-react";

type Branch = "main" | "responded" | "no_response";

type FlowSummary = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  listName: string | null;
  maxSteps: number;
  maxAttempts: number;
  createdAt: string;
  stepCount: number;
  contactCount: number;
};

type StepDraft = {
  stepOrder: number;
  branch: Branch;
  title: string;
  messageBody: string;
  templateName: string;
  templateLanguage: string;
  waitDays: number;
  waitHours: number;
  waitMinutes: number;
};

type FlowContact = {
  id: string;
  name: string | null;
  phone: string;
  status: string;
  stepOrder: number;
  branch: Branch;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  lastResponseAt: string | null;
  lastResponsePreview: string | null;
  nextAction: string | null;
  nextRunAt: string | null;
  attempts: number;
  lastError: string | null;
};

type FlowDetail = {
  flow: { id: string; name: string; description: string | null; status: string; listName: string | null; maxSteps: number; maxAttempts: number };
  steps: Array<Omit<StepDraft, "title"> & { id: string; title: string | null; messageBody: string | null; templateName: string | null; templateLanguage: string | null }>;
  contacts: FlowContact[];
};

type ContactEvent = { id: string; step_order: number | null; branch: string | null; event_type: string; detail: string | null; created_at: string };

const VARIABLES = [
  { token: "{{nome}}", label: "Nome" },
  { token: "{{telefone}}", label: "Telefone" },
  { token: "{{empresa}}", label: "Empresa" },
  { token: "{{email}}", label: "E-mail" },
  { token: "{{grupo}}", label: "Grupo" },
];

const CONTACT_STATUS: Record<string, { label: string; dot: string; className: string }> = {
  waiting: { label: "Aguardando", dot: "bg-amber-500", className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300" },
  responded: { label: "Respondeu", dot: "bg-emerald-500", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" },
  no_response: { label: "Não respondeu", dot: "bg-destructive", className: "border-destructive/30 bg-destructive/10 text-destructive" },
  next_step: { label: "Próxima etapa", dot: "bg-sky-500", className: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300" },
  paused: { label: "Pausado", dot: "bg-muted-foreground", className: "border-border bg-secondary text-muted-foreground" },
  completed: { label: "Concluído", dot: "bg-emerald-600", className: "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300" },
  error: { label: "Erro", dot: "bg-destructive", className: "border-destructive/40 bg-destructive/15 text-destructive" },
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function emptyStep(stepOrder: number, branch: Branch): StepDraft {
  return { stepOrder, branch, title: "", messageBody: "", templateName: "", templateLanguage: "pt_BR", waitDays: 3, waitHours: 0, waitMinutes: 0 };
}

function initialSteps(): StepDraft[] {
  return [emptyStep(1, "main"), emptyStep(2, "responded"), emptyStep(2, "no_response")];
}

async function callFlows<T = Record<string, unknown>>(payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("automation-flows", { body: payload, headers: pinSessionHeaders() });
  if (error) throw new Error(error.message || "Não foi possível falar com o servidor.");
  if (!data?.ok) throw new Error(data?.error || "O servidor recusou a solicitação.");
  return data as T;
}

function StatusPill({ status }: { status: string }) {
  const meta = CONTACT_STATUS[status] || CONTACT_STATUS.waiting;
  return (
    <Badge variant="outline" className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]", meta.className)}>
      <span className={cn("mr-1.5 h-1.5 w-1.5 rounded-full", meta.dot)} /> {meta.label}
    </Badge>
  );
}

function MessageBlock({
  step,
  onChange,
  tone,
}: {
  step: StepDraft;
  onChange: (patch: Partial<StepDraft>) => void;
  tone: "primary" | "success" | "danger";
}) {
  const toneClass = tone === "success" ? "border-emerald-500/30" : tone === "danger" ? "border-destructive/30" : "border-primary/30";
  return (
    <div className={cn("space-y-3 rounded-2xl border bg-card/60 p-4", toneClass)}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Send className="h-3.5 w-3.5 text-primary" /> Mensagem enviada via API
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Canal / API</label>
          <select value="whatsapp_cloud_api" disabled className="h-9 w-full rounded-lg border border-input bg-secondary/40 px-3 text-sm text-foreground">
            <option value="whatsapp_cloud_api">WhatsApp Business Platform (Meta)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Template aprovado (opcional)</label>
          <Input value={step.templateName} onChange={(event) => onChange({ templateName: event.target.value })} placeholder="nome_do_template" className="h-9 rounded-lg text-sm" />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Mensagem</label>
        <Textarea
          value={step.messageBody}
          onChange={(event) => onChange({ messageBody: event.target.value })}
          placeholder="Olá {{nome}}, tudo bem?"
          className="min-h-24 resize-none rounded-lg text-sm"
          maxLength={4096}
        />
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Adicionar variável:</span>
          {VARIABLES.map((variable) => (
            <button
              key={variable.token}
              type="button"
              onClick={() => onChange({ messageBody: `${step.messageBody}${step.messageBody.endsWith(" ") || !step.messageBody ? "" : " "}${variable.token}` })}
              className="rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-[10px] font-medium transition-colors hover:border-primary/40 hover:text-primary"
            >
              {variable.label}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5 text-primary" /> Aguardar antes de verificar a resposta
        </div>
        <div className="grid grid-cols-3 gap-2">
          {([["waitDays", "Dias", 365], ["waitHours", "Horas", 23], ["waitMinutes", "Minutos", 59]] as const).map(([field, label, max]) => (
            <div key={field} className="space-y-1">
              <label className="text-[10px] text-muted-foreground">{label}</label>
              <Input
                type="number"
                min={0}
                max={max}
                value={step[field]}
                onChange={(event) => onChange({ [field]: Math.max(0, Math.min(max, Number(event.target.value) || 0)) } as Partial<StepDraft>)}
                className="h-9 rounded-lg text-sm"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FlowBuilder({
  initial,
  flowId,
  onCancel,
  onSaved,
}: {
  initial: { name: string; description: string; listName: string; maxSteps: number; maxAttempts: number; steps: StepDraft[] };
  flowId: string | null;
  onCancel: () => void;
  onSaved: (flowId: string) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [listName, setListName] = useState(initial.listName);
  const [maxSteps, setMaxSteps] = useState(initial.maxSteps);
  const [maxAttempts, setMaxAttempts] = useState(initial.maxAttempts);
  const [steps, setSteps] = useState<StepDraft[]>(initial.steps.length > 0 ? initial.steps : initialSteps());
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const stageOrders = useMemo(() => [...new Set(steps.map((step) => step.stepOrder))].sort((a, b) => a - b), [steps]);
  const lastOrder = stageOrders[stageOrders.length - 1] || 1;

  const patchStep = (stepOrder: number, branch: Branch, patch: Partial<StepDraft>) => {
    setSteps((current) => current.map((step) => (step.stepOrder === stepOrder && step.branch === branch ? { ...step, ...patch } : step)));
  };

  const addStage = () => {
    if (lastOrder + 1 > maxSteps) {
      toast({ title: "Limite de etapas atingido", description: `Aumente o limite máximo (${maxSteps}) para adicionar mais etapas.`, variant: "destructive" });
      return;
    }
    setSteps((current) => [...current, emptyStep(lastOrder + 1, "responded"), emptyStep(lastOrder + 1, "no_response")]);
  };

  const removeStage = (stepOrder: number) => {
    if (stepOrder === 1) return;
    setSteps((current) => current.filter((step) => step.stepOrder !== stepOrder));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        action: flowId ? "update" : "create",
        flowId,
        name,
        description,
        listName,
        maxSteps,
        maxAttempts,
        steps: steps.map((step) => ({ ...step })),
      };
      const result = await callFlows<{ flow: { id: string } }>(payload);
      toast({ title: flowId ? "Fluxo atualizado" : "Fluxo criado", description: "As mensagens podem ser editadas a qualquer momento sem recriar o fluxo." });
      onSaved(result.flow.id);
    } catch (error) {
      toast({ title: "Não foi possível salvar", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <Card className="glass-card rounded-[1.25rem]">
        <CardHeader className="flex-col gap-3 p-5 pb-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Construtor visual</CardDescription>
            <CardTitle className="mt-1 text-xl tracking-[-0.03em]">{flowId ? "Editar fluxo" : "Criar novo fluxo"}</CardTitle>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-xl bg-transparent" onClick={onCancel}>Cancelar</Button>
            <Button className="rounded-xl" onClick={() => void handleSave()} disabled={isSaving}>{isSaving ? "Salvando..." : "Salvar fluxo"}</Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 p-5 pt-1 lg:grid-cols-5">
          <div className="space-y-1.5 lg:col-span-2">
            <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Nome do fluxo</label>
            <Input value={name} onChange={(event) => setName(event.target.value)} className="h-9 rounded-lg text-sm" placeholder="Recuperação de clientes" />
          </div>
          <div className="space-y-1.5 lg:col-span-1">
            <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Lista de origem</label>
            <Input value={listName} onChange={(event) => setListName(event.target.value)} className="h-9 rounded-lg text-sm" placeholder="Nome da lista" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Máx. etapas</label>
            <Input type="number" min={1} max={50} value={maxSteps} onChange={(event) => setMaxSteps(Math.max(1, Math.min(50, Number(event.target.value) || 1)))} className="h-9 rounded-lg text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Máx. tentativas</label>
            <Input type="number" min={1} max={10} value={maxAttempts} onChange={(event) => setMaxAttempts(Math.max(1, Math.min(10, Number(event.target.value) || 1)))} className="h-9 rounded-lg text-sm" />
          </div>
          <div className="space-y-1.5 lg:col-span-5">
            <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Descrição</label>
            <Input value={description} onChange={(event) => setDescription(event.target.value)} className="h-9 rounded-lg text-sm" placeholder="Objetivo do fluxo" />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="flex justify-center">
          <span className="rounded-full border border-primary/30 bg-primary/10 px-4 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Início</span>
        </div>

        {stageOrders.map((order) => {
          const main = steps.find((step) => step.stepOrder === order && step.branch === "main");
          const responded = steps.find((step) => step.stepOrder === order && step.branch === "responded");
          const noResponse = steps.find((step) => step.stepOrder === order && step.branch === "no_response");
          return (
            <div key={order} className="space-y-2">
              <div className="flex justify-center"><ArrowDown className="h-4 w-4 text-muted-foreground" /></div>
              <Card className="glass-card rounded-[1.25rem]">
                <CardHeader className="flex-row items-center justify-between space-y-0 p-4 pb-2">
                  <CardTitle className="text-sm font-bold uppercase tracking-[0.14em] text-primary">Etapa {order}</CardTitle>
                  {order > 1 && (
                    <Button variant="ghost" size="sm" className="h-8 rounded-lg text-destructive hover:text-destructive" onClick={() => removeStage(order)}>
                      <X className="mr-1 h-3.5 w-3.5" /> Remover etapa
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-3 p-4 pt-1">
                  {main && <MessageBlock step={main} tone="primary" onChange={(patch) => patchStep(order, "main", patch)} />}
                  {(responded || noResponse) && (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {responded && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-600 dark:text-emerald-300">
                            <GitBranch className="h-3.5 w-3.5" /> Se respondeu
                          </div>
                          <MessageBlock step={responded} tone="success" onChange={(patch) => patchStep(order, "responded", patch)} />
                        </div>
                      )}
                      {noResponse && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-destructive">
                            <GitBranch className="h-3.5 w-3.5" /> Se não respondeu
                          </div>
                          <MessageBlock step={noResponse} tone="danger" onChange={(patch) => patchStep(order, "no_response", patch)} />
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    ❓ Verificar resposta ao final da espera
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })}

        <div className="flex justify-center pt-1">
          <Button variant="outline" className="rounded-xl bg-transparent" onClick={addStage}>
            <Plus className="mr-2 h-4 w-4" /> Adicionar etapa
          </Button>
        </div>
      </div>
    </div>
  );
}

function FlowDetailView({ flowId, onBack, onEdit }: { flowId: string; onBack: () => void; onEdit: (detail: FlowDetail) => void }) {
  const [detail, setDetail] = useState<FlowDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [listName, setListName] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [historyContact, setHistoryContact] = useState<FlowContact | null>(null);
  const [events, setEvents] = useState<ContactEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await callFlows<FlowDetail>({ action: "get", flowId });
      setDetail({ flow: data.flow, steps: data.steps, contacts: data.contacts });
      setListName(data.flow.listName || "");
    } catch (error) {
      toast({ title: "Fluxo não carregado", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [flowId, toast]);

  useEffect(() => { void load(); }, [load]);

  const runAction = async (payload: Record<string, unknown>, successTitle: string) => {
    try {
      const data = await callFlows<FlowDetail>(payload);
      if (data.flow) setDetail({ flow: data.flow, steps: data.steps, contacts: data.contacts });
      else await load();
      toast({ title: successTitle });
    } catch (error) {
      toast({ title: "Ação não concluída", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    }
  };

  const openHistory = async (contact: FlowContact) => {
    setHistoryContact(contact);
    setEvents([]);
    try {
      const data = await callFlows<{ events: ContactEvent[] }>({ action: "history", flowContactId: contact.id });
      setEvents(data.events || []);
    } catch {
      setEvents([]);
    }
  };

  const runEngine = async () => {
    setIsRunning(true);
    const { data, error } = await supabase.functions.invoke("automation-engine", { body: { flowId }, headers: pinSessionHeaders() });
    setIsRunning(false);
    if (error || !data?.ok) {
      toast({ title: "Motor não executado", description: data?.error || error?.message || "Verifique se o fluxo está ativo.", variant: "destructive" });
      return;
    }
    toast({ title: "Ciclo executado", description: `${data.sent || 0} envio(s), ${data.advanced || 0} avanço(s), ${data.errors || 0} erro(s).` });
    void load();
  };

  if (isLoading || !detail) {
    return <Card className="glass-card rounded-[1.25rem]"><CardContent className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin text-primary" /> Carregando fluxo...</CardContent></Card>;
  }

  const counts = detail.contacts.reduce<Record<string, number>>((acc, contact) => ({ ...acc, [contact.status]: (acc[contact.status] || 0) + 1 }), {});

  return (
    <div className="space-y-3">
      <Card className="glass-card rounded-[1.25rem]">
        <CardHeader className="flex-col gap-3 p-5 pb-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Fluxo de automação</CardDescription>
            <CardTitle className="mt-1 text-xl tracking-[-0.03em]">{detail.flow.name}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{detail.flow.description || "Sem descrição"} · Limite de {detail.flow.maxSteps} etapas e {detail.flow.maxAttempts} tentativas</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-xl bg-transparent" onClick={onBack}>Voltar</Button>
            <Button variant="outline" className="rounded-xl bg-transparent" onClick={() => onEdit(detail)}>Editar fluxo</Button>
            <Button className="rounded-xl" onClick={() => void runEngine()} disabled={isRunning}>
              <Play className="mr-2 h-4 w-4" /> {isRunning ? "Executando..." : "Executar ciclo agora"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-5 pt-1">
          <div className="flex flex-wrap gap-2">
            {Object.entries(CONTACT_STATUS).map(([key, meta]) => (
              <span key={key} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium", meta.className)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} /> {meta.label}: {counts[key] || 0}
              </span>
            ))}
          </div>
          <div className="grid gap-2 rounded-xl border border-border/60 bg-secondary/20 p-3 lg:grid-cols-[1.2fr_1fr_1fr_auto]">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Adicionar por lista</label>
              <Input value={listName} onChange={(event) => setListName(event.target.value)} className="h-9 rounded-lg text-sm" placeholder="Nome exato da lista" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Ou nome do contato</label>
              <Input value={manualName} onChange={(event) => setManualName(event.target.value)} className="h-9 rounded-lg text-sm" placeholder="Maria Silva" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Telefone</label>
              <Input value={manualPhone} onChange={(event) => setManualPhone(event.target.value)} className="h-9 rounded-lg text-sm" placeholder="(11) 99999-9999" />
            </div>
            <div className="flex items-end">
              <Button
                className="h-9 w-full rounded-lg lg:w-auto"
                onClick={() => void runAction({
                  action: "addContacts",
                  flowId,
                  listName: manualPhone ? "" : listName,
                  contacts: manualPhone ? [{ name: manualName, phone: manualPhone }] : [],
                }, "Contatos adicionados ao fluxo")}
              >
                <UserRoundPlus className="mr-2 h-4 w-4" /> Adicionar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card rounded-[1.25rem]">
        <CardHeader className="p-5 pb-2"><CardTitle className="text-lg">Contatos no fluxo</CardTitle></CardHeader>
        <CardContent className="p-5 pt-1">
          {detail.contacts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Nenhum contato neste fluxo ainda. Adicione uma lista ou um contato individual acima.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                    <th className="pb-3">Contato</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Etapa</th>
                    <th className="pb-3">Última mensagem</th>
                    <th className="pb-3">Última resposta</th>
                    <th className="pb-3">Próxima ação</th>
                    <th className="pb-3">Tentativas</th>
                    <th className="pb-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {detail.contacts.map((contact) => (
                    <tr key={contact.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/30">
                      <td className="py-3">
                        <p className="font-semibold">{contact.name || "Sem nome"}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">+{contact.phone}</p>
                      </td>
                      <td className="py-3"><StatusPill status={contact.status} />{contact.lastError && <p className="mt-1 max-w-[180px] truncate text-[10px] text-destructive">{contact.lastError}</p>}</td>
                      <td className="py-3 text-xs">{contact.stepOrder} · {contact.branch === "responded" ? "respondeu" : contact.branch === "no_response" ? "não respondeu" : "principal"}</td>
                      <td className="py-3 text-xs text-muted-foreground"><p className="max-w-[180px] truncate">{contact.lastMessagePreview || "—"}</p><p>{formatDateTime(contact.lastMessageAt)}</p></td>
                      <td className="py-3 text-xs text-muted-foreground"><p className="max-w-[160px] truncate">{contact.lastResponsePreview || "—"}</p><p>{formatDateTime(contact.lastResponseAt)}</p></td>
                      <td className="py-3 text-xs text-muted-foreground"><p className="max-w-[180px] truncate">{contact.nextAction || "—"}</p><p>{formatDateTime(contact.nextRunAt)}</p></td>
                      <td className="py-3 text-xs">{contact.attempts}</td>
                      <td className="py-3">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Histórico" onClick={() => void openHistory(contact)}><History className="h-4 w-4" /></Button>
                          {contact.status === "paused" ? (
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Retomar" onClick={() => void runAction({ action: "contactAction", flowContactId: contact.id, contactAction: "resume" }, "Contato retomado")}><Play className="h-4 w-4" /></Button>
                          ) : (
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Pausar contato" onClick={() => void runAction({ action: "contactAction", flowContactId: contact.id, contactAction: "pause" }, "Contato pausado")}><Pause className="h-4 w-4" /></Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Nova tentativa" onClick={() => void runAction({ action: "contactAction", flowContactId: contact.id, contactAction: "retry" }, "Nova tentativa agendada")}><RotateCcw className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Remover do fluxo" onClick={() => void runAction({ action: "contactAction", flowContactId: contact.id, contactAction: "remove" }, "Contato removido do fluxo")}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(historyContact)} onOpenChange={(open) => !open && setHistoryContact(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Histórico de {historyContact?.name || "contato"}</DialogTitle>
            <DialogDescription>+{historyContact?.phone} · registro completo das ações do fluxo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {events.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum evento registrado ainda.</p>
            ) : events.map((event) => (
              <div key={event.id} className="rounded-lg border border-border/60 bg-secondary/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{event.event_type}</span>
                  <span className="text-[10px] text-muted-foreground">{formatDateTime(event.created_at)}</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">Etapa {event.step_order ?? "—"} · {event.branch || "—"}</p>
                {event.detail && <p className="mt-1 text-xs">{event.detail}</p>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AutomationPanel() {
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<"list" | "builder" | "detail">("list");
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null);
  const [builderInitial, setBuilderInitial] = useState<{ name: string; description: string; listName: string; maxSteps: number; maxAttempts: number; steps: StepDraft[] } | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await callFlows<{ flows: FlowSummary[] }>({ action: "list" });
      setFlows(data.flows || []);
    } catch (error) {
      toast({ title: "Fluxos não carregados", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const flowAction = async (payload: Record<string, unknown>, successTitle: string) => {
    try {
      const data = await callFlows<{ flows?: FlowSummary[] }>(payload);
      if (data.flows) setFlows(data.flows);
      else await load();
      toast({ title: successTitle });
    } catch (error) {
      toast({ title: "Ação não concluída", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    }
  };

  const startCreate = () => {
    setActiveFlowId(null);
    setBuilderInitial({ name: "", description: "", listName: "", maxSteps: 10, maxAttempts: 3, steps: initialSteps() });
    setView("builder");
  };

  const startEdit = async (flowId: string) => {
    try {
      const data = await callFlows<FlowDetail>({ action: "get", flowId });
      setActiveFlowId(flowId);
      setBuilderInitial({
        name: data.flow.name,
        description: data.flow.description || "",
        listName: data.flow.listName || "",
        maxSteps: data.flow.maxSteps,
        maxAttempts: data.flow.maxAttempts,
        steps: data.steps.map((step) => ({
          stepOrder: step.stepOrder,
          branch: step.branch,
          title: step.title || "",
          messageBody: step.messageBody || "",
          templateName: step.templateName || "",
          templateLanguage: step.templateLanguage || "pt_BR",
          waitDays: step.waitDays,
          waitHours: step.waitHours,
          waitMinutes: step.waitMinutes,
        })),
      });
      setView("builder");
    } catch (error) {
      toast({ title: "Fluxo não carregado", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    }
  };

  if (view === "builder" && builderInitial) {
    return (
      <FlowBuilder
        initial={builderInitial}
        flowId={activeFlowId}
        onCancel={() => { setView(activeFlowId ? "detail" : "list"); void load(); }}
        onSaved={(flowId) => { setActiveFlowId(flowId); setView("detail"); void load(); }}
      />
    );
  }

  if (view === "detail" && activeFlowId) {
    return <FlowDetailView flowId={activeFlowId} onBack={() => { setView("list"); void load(); }} onEdit={() => void startEdit(activeFlowId)} />;
  }

  return (
    <div className="space-y-3">
      <Card className="glass-card rounded-[1.25rem]">
        <CardHeader className="flex-col gap-3 p-5 pb-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Automação por etapas</CardDescription>
            <CardTitle className="mt-1 text-xl tracking-[-0.03em] sm:text-2xl">Fluxos automáticos de mensagens</CardTitle>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              Cada fluxo envia mensagens pela API oficial, aguarda o prazo configurado, verifica a resposta pelo webhook e segue pelo caminho "respondeu" ou "não respondeu".
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-xl bg-transparent" onClick={() => void load()} disabled={isLoading}>
              <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} /> Atualizar
            </Button>
            <Button className="rounded-xl" onClick={startCreate}><Plus className="mr-2 h-4 w-4" /> Criar novo fluxo</Button>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-1">
          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin text-primary" /> Carregando fluxos...</div>
          ) : flows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <Workflow className="mx-auto h-8 w-8 text-primary" />
              <p className="mt-3 text-sm font-semibold">Nenhum fluxo criado</p>
              <p className="mt-1 text-xs text-muted-foreground">Crie o primeiro fluxo para automatizar mensagens, esperas e verificações de resposta.</p>
              <Button className="mt-4 rounded-xl" onClick={startCreate}><Plus className="mr-2 h-4 w-4" /> Criar novo fluxo</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                    <th className="pb-3">Nome do fluxo</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Etapas</th>
                    <th className="pb-3">Contatos</th>
                    <th className="pb-3">Criado em</th>
                    <th className="pb-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {flows.map((flow) => (
                    <tr key={flow.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/30">
                      <td className="py-3">
                        <button type="button" className="text-left" onClick={() => { setActiveFlowId(flow.id); setView("detail"); }}>
                          <p className="font-semibold hover:text-primary">{flow.name}</p>
                          <p className="text-[11px] text-muted-foreground">{flow.description || flow.listName || "Sem descrição"}</p>
                        </button>
                      </td>
                      <td className="py-3">
                        <Badge variant="outline" className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]", flow.status === "active" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "border-border bg-secondary text-muted-foreground")}>
                          {flow.status === "active" ? "Ativo" : "Pausado"}
                        </Badge>
                      </td>
                      <td className="py-3">{flow.stepCount}</td>
                      <td className="py-3">{flow.contactCount}</td>
                      <td className="py-3 text-xs text-muted-foreground">{formatDateTime(flow.createdAt)}</td>
                      <td className="py-3">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-8 rounded-lg text-xs" onClick={() => void startEdit(flow.id)}>Editar</Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Duplicar" onClick={() => void flowAction({ action: "duplicate", flowId: flow.id }, "Fluxo duplicado")}><Copy className="h-4 w-4" /></Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title={flow.status === "active" ? "Pausar fluxo" : "Ativar fluxo"}
                            onClick={() => void flowAction({ action: "toggleStatus", flowId: flow.id, status: flow.status === "active" ? "paused" : "active" }, flow.status === "active" ? "Fluxo pausado" : "Fluxo ativado")}
                          >
                            {flow.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            title="Excluir"
                            onClick={() => { if (window.confirm(`Excluir o fluxo "${flow.name}" e todo o histórico dos contatos?`)) void flowAction({ action: "delete", flowId: flow.id }, "Fluxo excluído"); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card rounded-[1.25rem]">
        <CardHeader className="p-5 pb-2"><CardTitle className="text-lg">Como o fluxo funciona</CardTitle></CardHeader>
        <CardContent className="p-5 pt-1">
          <div className="flex flex-col items-center gap-1 rounded-xl border border-border/60 bg-secondary/20 p-4 text-center text-xs">
            <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-semibold uppercase tracking-[0.14em] text-primary">Início</span>
            <ArrowDown className="h-4 w-4 text-muted-foreground" />
            <span className="rounded-lg border border-border bg-card px-3 py-1.5">📤 Mensagem 1</span>
            <ArrowDown className="h-4 w-4 text-muted-foreground" />
            <span className="rounded-lg border border-border bg-card px-3 py-1.5">⏱ Aguardar X dias</span>
            <ArrowDown className="h-4 w-4 text-muted-foreground" />
            <span className="rounded-lg border border-border bg-card px-3 py-1.5">❓ Respondeu?</span>
            <div className="mt-2 grid w-full max-w-md grid-cols-2 gap-3">
              <div className="space-y-1 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-300">Sim</p>
                <p>📤 Mensagem 2A</p>
                <p>⏱ Aguardar</p>
                <p>❓ Verificar novamente</p>
              </div>
              <div className="space-y-1 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-destructive">Não</p>
                <p>📤 Mensagem 2B</p>
                <p>⏱ Aguardar</p>
                <p>❓ Verificar novamente</p>
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
            O servidor garante que a mesma mensagem nunca é enviada duas vezes para a mesma etapa. Respostas recebidas pelo webhook atualizam o contato imediatamente, mesmo antes do prazo de espera terminar.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default AutomationPanel;
