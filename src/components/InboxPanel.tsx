import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { pinSessionHeaders } from "@/lib/v4PinSession";
import { acceptAttribute, uploadMedia, validateFile } from "@/lib/whatsappMedia";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Check, CheckCheck, Clock3, FileText, ListFilter, MessageCircle, Plus, RefreshCw, Send, UserRound, Wifi, WifiOff, X } from "lucide-react";

type Conversation = {
  id: string;
  phone_e164: string;
  contact_id?: string | null;
  contact_name?: string | null;
  status: "open" | "closed" | "archived";
  origin_list?: string | null;
  last_template_name?: string | null;
  service_window_expires_at?: string | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  last_message_direction?: "inbound" | "outbound" | null;
  unread_count: number;
  lists?: string[];
};

type ConversationMessage = {
  id: string;
  external_id?: string | null;
  direction: "inbound" | "outbound";
  message_type: string;
  body?: string | null;
  status: string;
  operator_key?: string | null;
  template_name?: string | null;
  media_id?: string | null;
  media_mime_type?: string | null;
  media_sha256?: string | null;
  media_storage_path?: string | null;
  media_caption?: string | null;
  media_duration?: number | null;
  transcription?: string | null;
  processing_status?: string | null;
  media_url?: string | null;
  provider_timestamp?: string | null;
  created_at: string;
};


type ContactOption = {
  id: string;
  full_name: string;
  phone_e164: string;
  group_name?: string | null;
  lists?: { list_name: string; source: string; added_at: string }[];
};

type MetaTemplate = {
  id?: string;
  name?: string;
  language?: string;
  category?: string;
  status?: string;
  components?: { type?: string; text?: string }[];
};

type MetaConnection = {
  ok: boolean;
  displayPhone?: string | null;
  accountName?: string | null;
  connected: boolean;
  verified: boolean;
  webhookSubscribed: boolean;
  error?: string | null;
};

type FilterKey = "all" | "unread" | "waiting" | "answered" | "closed";

const FILTERS: { id: FilterKey; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "unread", label: "Não lidas" },
  { id: "waiting", label: "Aguardando resposta" },
  { id: "answered", label: "Respondidas" },
  { id: "closed", label: "Encerradas" },
];

const POLL_INTERVAL_MS = 15000;

function formatTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatDateTime(value?: string | null): string {
  if (!value) return "Sem atividade";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem atividade";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function dayKey(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

function hasServiceWindow(conversation?: Conversation | null): boolean {
  if (!conversation?.service_window_expires_at) return false;
  const date = new Date(conversation.service_window_expires_at);
  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
}

function countVariables(template?: MetaTemplate | null): number {
  const body = template?.components?.find((component) => component.type?.toUpperCase() === "BODY")?.text || "";
  const matches = body.match(/\{\{\s*\d+\s*\}\}/g);
  if (!matches) return 0;
  return new Set(matches.map((match) => match.replace(/\D/g, ""))).size;
}

const OUTBOUND_STATUS_LABEL: Record<string, string> = {
  processing: "Enviando",
  processando: "Enviando",
  pending: "Na fila",
  sent: "Enviada",
  enviada: "Enviada",
  delivered: "Entregue",
  entregue: "Entregue",
  read: "Lida",
  lida: "Lida",
  failed: "Falhou",
  falhou: "Falhou",
  simulated: "Simulada",
  simulada: "Simulada",
};

function outboundStatusLabel(status: string): string {
  return OUTBOUND_STATUS_LABEL[status?.toLowerCase()] || status || "—";
}

function OutboundStatusIcon({ status }: { status: string }) {
  const normalized = status?.toLowerCase();
  if (normalized === "read" || normalized === "lida") return <CheckCheck className="h-3 w-3 text-sky-300" />;
  if (normalized === "delivered" || normalized === "entregue") return <CheckCheck className="h-3 w-3" />;
  if (normalized === "sent" || normalized === "enviada") return <Check className="h-3 w-3" />;
  if (normalized === "failed" || normalized === "falhou") return <AlertTriangle className="h-3 w-3" />;
  return <Clock3 className="h-3 w-3" />;
}

export function InboxPanel() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [threadLists, setThreadLists] = useState<{ list_name: string; source: string; added_at: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isThreadLoading, setIsThreadLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [connection, setConnection] = useState<MetaConnection | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState<"audio" | "video">("audio");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaCaption, setMediaCaption] = useState("");
  const [mediaProgress, setMediaProgress] = useState(0);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isSendingMedia, setIsSendingMedia] = useState(false);

  const [templates, setTemplates] = useState<MetaTemplate[]>([]);
  const [templateKey, setTemplateKey] = useState("");
  const [templateVariables, setTemplateVariables] = useState<string[]>([]);

  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [knownLists, setKnownLists] = useState<string[]>([]);
  const [newMode, setNewMode] = useState<"existing" | "new">("existing");
  const [newContactId, setNewContactId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newList, setNewList] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  const selectedIdRef = useRef<string | null>(null);
  const { toast } = useToast();

  const selectedConversation = useMemo(() => conversations.find((conversation) => conversation.id === selectedId) || null, [conversations, selectedId]);
  const windowOpen = hasServiceWindow(selectedConversation);
  const isArchived = selectedConversation?.status === "archived";
  const canSendFreeText = windowOpen && !isArchived;

  const selectedTemplate = useMemo(() => templates.find((template) => `${template.name}|${template.language}` === templateKey) || null, [templates, templateKey]);
  const templateBody = selectedTemplate?.components?.find((component) => component.type?.toUpperCase() === "BODY")?.text || "";
  const variableCount = countVariables(selectedTemplate);

  const filteredConversations = useMemo(() => conversations.filter((conversation) => {
    const closed = conversation.status === "closed" || conversation.status === "archived";
    if (filter === "unread") return conversation.unread_count > 0 && !closed;
    if (filter === "waiting") return !closed && conversation.last_message_direction === "outbound";
    if (filter === "answered") return !closed && conversation.last_message_direction === "inbound";
    if (filter === "closed") return closed;
    return true;
  }), [conversations, filter]);

  const totals = useMemo(() => ({
    inbound: messages.filter((message) => message.direction === "inbound").length,
    outbound: messages.filter((message) => message.direction === "outbound").length,
    unread: conversations.reduce((sum, conversation) => sum + (conversation.unread_count || 0), 0),
  }), [messages, conversations]);

  const filterCounts = useMemo(() => ({
    all: conversations.length,
    unread: conversations.filter((conversation) => conversation.unread_count > 0 && conversation.status === "open").length,
    waiting: conversations.filter((conversation) => conversation.status === "open" && conversation.last_message_direction === "outbound").length,
    answered: conversations.filter((conversation) => conversation.status === "open" && conversation.last_message_direction === "inbound").length,
    closed: conversations.filter((conversation) => conversation.status !== "open").length,
  }), [conversations]);

  const loadConnection = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("meta-health", { body: {}, headers: pinSessionHeaders() });
    if (error || !data) {
      setConnection({ ok: false, connected: false, verified: false, webhookSubscribed: false, error: error?.message || "Conexão Meta indisponível" });
      return;
    }
    const phone = (data.phone || {}) as Record<string, unknown>;
    const firstError = Array.isArray(data.errors) && data.errors.length > 0 ? String(data.errors[0]) : null;
    setConnection({
      ok: Boolean(data.ok),
      accountName: typeof data.account?.name === "string" ? data.account.name : null,
      displayPhone: typeof phone.display_phone_number === "string" ? phone.display_phone_number : null,
      connected: String(phone.status ?? "").toUpperCase() === "CONNECTED",
      verified: String(phone.code_verification_status ?? "").toUpperCase().includes("VERIFIED"),
      webhookSubscribed: Boolean(data.webhook?.subscribed),
      error: data.ok ? null : firstError,
    });
  }, []);

  const loadTemplates = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("meta-templates-list", { body: {}, headers: pinSessionHeaders() });
    if (error || !data?.ok) return;
    const approved = (Array.isArray(data.templates) ? data.templates as MetaTemplate[] : []).filter((template) => String(template.status || "").toUpperCase() === "APPROVED");
    setTemplates(approved);
  }, []);

  const loadContacts = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("message-inbox-start", { body: { action: "contacts" }, headers: pinSessionHeaders() });
    if (error || !data?.ok) return;
    setContacts(Array.isArray(data.contacts) ? data.contacts as ContactOption[] : []);
    setKnownLists(Array.isArray(data.lists) ? data.lists as string[] : []);
  }, []);

  const loadConversations = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    const { data, error } = await supabase.functions.invoke("message-inbox-list", { body: {}, headers: pinSessionHeaders() });
    if (!silent) setIsLoading(false);
    if (error || !data?.ok) {
      if (!silent) toast({ title: "Inbox não carregado", description: data?.error || error?.message || "Não foi possível consultar as conversas.", variant: "destructive" });
      return;
    }
    const next = Array.isArray(data.conversations) ? data.conversations as Conversation[] : [];
    setConversations(next);
    setLastSyncAt(typeof data.fetchedAt === "string" ? data.fetchedAt : new Date().toISOString());
    if (selectedIdRef.current && !next.some((conversation) => conversation.id === selectedIdRef.current)) {
      selectedIdRef.current = null;
      setSelectedId(null);
      setMessages([]);
    }
  }, [toast]);

  const loadThread = useCallback(async (conversationId: string, silent = false) => {
    selectedIdRef.current = conversationId;
    setSelectedId(conversationId);
    if (!silent) setIsThreadLoading(true);
    const { data, error } = await supabase.functions.invoke("message-inbox-list", { body: { conversationId }, headers: pinSessionHeaders() });
    if (!silent) setIsThreadLoading(false);
    if (error || !data?.ok) {
      if (!silent) toast({ title: "Conversa não carregada", description: data?.error || error?.message || "Não foi possível consultar o histórico.", variant: "destructive" });
      return;
    }
    setMessages(Array.isArray(data.messages) ? data.messages as ConversationMessage[] : []);
    setThreadLists(Array.isArray(data.lists) ? data.lists : []);
    setConversations((current) => current.map((conversation) => conversation.id === conversationId
      ? { ...conversation, ...(data.conversation || {}), unread_count: 0 }
      : conversation));
  }, [toast]);

  useEffect(() => {
    void loadConversations();
    void loadConnection();
    void loadTemplates();
    void loadContacts();
  }, [loadConversations, loadConnection, loadTemplates, loadContacts]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadConversations(true);
      if (selectedIdRef.current) void loadThread(selectedIdRef.current, true);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [loadConversations, loadThread]);

  useEffect(() => {
    setTemplateVariables(Array.from({ length: variableCount }, () => ""));
  }, [templateKey, variableCount]);

  const groupedMessages = useMemo(() => {
    const groups: { day: string; items: ConversationMessage[] }[] = [];
    for (const message of messages) {
      const day = dayKey(message.provider_timestamp || message.created_at);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(message);
      else groups.push({ day, items: [message] });
    }
    return groups;
  }, [messages]);

  const handleRefresh = async () => {
    await Promise.all([loadConversations(), loadConnection(), loadTemplates(), loadContacts()]);
    if (selectedIdRef.current) await loadThread(selectedIdRef.current, true);
  };

  const handleStartConversation = async () => {
    const listName = newList.trim();
    if (!listName) {
      toast({ title: "Lista obrigatória", description: "Informe de qual lista este contato/lead veio.", variant: "destructive" });
      return;
    }
    if (newMode === "existing" && !newContactId) {
      toast({ title: "Selecione um contato", description: "Escolha um contato existente ou cadastre um novo.", variant: "destructive" });
      return;
    }
    if (newMode === "new" && (!newName.trim() || !newPhone.trim())) {
      toast({ title: "Dados incompletos", description: "Informe nome e número de WhatsApp do novo contato.", variant: "destructive" });
      return;
    }

    setIsStarting(true);
    const { data, error } = await supabase.functions.invoke("message-inbox-start", {
      body: newMode === "existing"
        ? { contactId: newContactId, listName }
        : { fullName: newName.trim(), phone: newPhone.trim(), listName },
      headers: pinSessionHeaders(),
    });
    setIsStarting(false);
    if (error || !data?.ok) {
      toast({ title: "Conversa não criada", description: data?.error || error?.message || "Não foi possível abrir a conversa.", variant: "destructive" });
      return;
    }
    setIsComposerOpen(false);
    setNewContactId("");
    setNewName("");
    setNewPhone("");
    await loadConversations();
    await loadContacts();
    if (data.conversation?.id) await loadThread(data.conversation.id);
    toast({ title: "Conversa aberta", description: `Origem registrada na lista "${listName}".` });
  };

  const handleSend = async () => {
    if (!selectedConversation || isArchived) return;
    const useTemplate = !canSendFreeText;

    if (useTemplate) {
      if (!selectedTemplate?.name) {
        toast({ title: "Template obrigatório", description: "Fora da janela de 24 horas o WhatsApp só permite templates aprovados.", variant: "destructive" });
        return;
      }
      if (templateVariables.some((value) => !value.trim())) {
        toast({ title: "Variáveis incompletas", description: "Preencha todas as variáveis do template.", variant: "destructive" });
        return;
      }
    } else if (!draft.trim()) {
      return;
    }

    if (!window.confirm("Confirma o envio real desta mensagem pelo WhatsApp da Meta?")) return;

    setIsSending(true);
    const { data, error } = await supabase.functions.invoke("message-inbox-reply", {
      body: useTemplate
        ? {
          conversationId: selectedConversation.id,
          templateName: selectedTemplate?.name,
          templateLanguage: selectedTemplate?.language || "pt_BR",
          parameters: templateVariables.map((value) => value.trim()),
          dryRun: false,
          idempotencyKey: `inbox-tpl-${selectedConversation.id}-${Date.now()}`,
        }
        : {
          conversationId: selectedConversation.id,
          message: draft.trim(),
          dryRun: false,
          idempotencyKey: `inbox-${selectedConversation.id}-${Date.now()}`,
        },
      headers: pinSessionHeaders(),
    });
    setIsSending(false);
    if (error || !data?.ok) {
      toast({ title: "Mensagem não enviada", description: data?.error || error?.message || "O servidor recusou o envio.", variant: "destructive" });
      return;
    }
    if (!useTemplate) setDraft("");
    else setTemplateVariables(Array.from({ length: variableCount }, () => ""));
    toast({ title: "Mensagem enviada à Meta", description: "O status de entrega será atualizado automaticamente pelo webhook." });
    await loadThread(selectedConversation.id);
    await loadConversations(true);
  };

  const handleSendMedia = async () => {
    if (!selectedConversation || isArchived || !mediaFile) return;
    if (!canSendFreeText) {
      toast({ title: "Janela fechada", description: "Áudio e vídeo só podem ser enviados dentro da janela de 24 horas.", variant: "destructive" });
      return;
    }
    const localError = validateFile(mediaKind, mediaFile);
    if (localError) {
      setMediaError(localError);
      return;
    }
    if (!window.confirm(`Confirma o envio real deste ${mediaKind === "audio" ? "áudio" : "vídeo"} pelo WhatsApp da Meta?`)) return;

    setMediaError(null);
    setIsSendingMedia(true);
    setMediaProgress(0);
    try {
      const upload = await uploadMedia({ file: mediaFile, kind: mediaKind, target: "message", onProgress: setMediaProgress });
      if (upload.codecWarning) toast({ title: "Atenção com o arquivo", description: upload.codecWarning });
      if (!upload.mediaId && !upload.dryRun) throw new Error("A Meta não devolveu o identificador do arquivo.");

      const { data, error } = await supabase.functions.invoke("message-inbox-reply", {
        body: {
          conversationId: selectedConversation.id,
          mediaType: mediaKind,
          mediaId: upload.mediaId,
          mediaMimeType: upload.mimeType,
          caption: mediaKind === "video" ? mediaCaption.trim() : "",
          dryRun: Boolean(upload.dryRun),
          idempotencyKey: `inbox-${mediaKind}-${selectedConversation.id}-${upload.mediaId || "dry"}`,
        },
        headers: pinSessionHeaders(),
      });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || "O servidor recusou o envio.");

      setMediaFile(null);
      setMediaCaption("");
      setMediaProgress(0);
      toast({ title: mediaKind === "audio" ? "Áudio enviado" : "Vídeo enviado", description: "O status de entrega será atualizado pelo webhook." });
      await loadThread(selectedConversation.id);
      await loadConversations(true);
    } catch (sendError) {
      const description = sendError instanceof Error ? sendError.message : "Falha no envio do arquivo.";
      setMediaError(description);
      toast({ title: "Arquivo não enviado", description, variant: "destructive" });
    } finally {
      setIsSendingMedia(false);
    }
  };



  return (
    <Card className="glass-card overflow-hidden rounded-[1.25rem]">
      <CardHeader className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Atendimento WhatsApp</CardDescription>
          <CardTitle className="mt-1 text-xl tracking-[-0.04em]">Caixa de entrada</CardTitle>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Espelho da conexão Meta: mensagens recebidas e enviadas na mesma linha do tempo, com lista de origem, status real de entrega e data/hora de cada evento.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="sm" className="w-full rounded-lg sm:w-auto" onClick={() => { setIsComposerOpen((open) => !open); void loadContacts(); }}>
            <Plus className="mr-2 h-3.5 w-3.5" /> Nova conversa
          </Button>
          <Button variant="outline" size="sm" className="w-full rounded-lg bg-transparent sm:w-auto" onClick={() => void handleRefresh()} disabled={isLoading}>
            <RefreshCw className={cn("mr-2 h-3.5 w-3.5", isLoading && "animate-spin")} /> Sincronizar com a Meta
          </Button>
        </div>
      </CardHeader>

      {isComposerOpen && (
        <div className="border-b border-border/60 bg-secondary/20 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Iniciar conversa</p>
            <Button variant="ghost" size="sm" className="h-8 rounded-lg" onClick={() => setIsComposerOpen(false)}><X className="h-4 w-4" /></Button>
          </div>
          <div className="mb-3 flex gap-2">
            {([["existing", "Contato existente"], ["new", "Novo contato"]] as const).map(([mode, label]) => (
              <button key={mode} type="button" onClick={() => setNewMode(mode)} className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors", newMode === mode ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30")}>{label}</button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {newMode === "existing" ? (
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Contato cadastrado</label>
                <select value={newContactId} onChange={(event) => {
                  setNewContactId(event.target.value);
                  const contact = contacts.find((item) => item.id === event.target.value);
                  if (contact && !newList) setNewList(contact.lists?.[0]?.list_name || contact.group_name || "");
                }} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                  <option value="">Selecione um contato</option>
                  {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name} · {contact.phone_e164}</option>)}
                </select>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Nome do contato</label>
                  <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Maria Silva" className="h-10 rounded-lg" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">WhatsApp (internacional)</label>
                  <Input value={newPhone} onChange={(event) => setNewPhone(event.target.value)} placeholder="+55 11 99999-9999" className="h-10 rounded-lg" />
                </div>
              </>
            )}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Lista de origem (obrigatória)</label>
              <Input value={newList} onChange={(event) => setNewList(event.target.value)} list="inbox-known-lists" placeholder="Ex.: Leads Instagram" className="h-10 rounded-lg" />
              <datalist id="inbox-known-lists">{knownLists.map((list) => <option key={list} value={list} />)}</datalist>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[10px] leading-4 text-muted-foreground">O histórico de listas é mantido: se o contato já pertence a outras listas, todas continuam registradas.</p>
            <Button size="sm" className="rounded-lg" onClick={() => void handleStartConversation()} disabled={isStarting}>{isStarting ? "Abrindo..." : "Abrir conversa"}</Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-semibold", connection?.connected ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>
            {connection?.connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {connection === null ? "Verificando conexão..." : connection.connected ? "Meta conectada" : "Meta desconectada"}
          </span>
          {connection?.displayPhone && <span className="text-muted-foreground">{connection.displayPhone}</span>}
          {connection?.accountName && <span className="text-muted-foreground">· {connection.accountName}</span>}
          {connection && (
            <span className={cn("rounded-full px-2 py-0.5 font-semibold", connection.webhookSubscribed ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-700 dark:text-amber-300")}>
              {connection.webhookSubscribed ? "Recebimento ativo" : "Recebimento inativo"}
            </span>
          )}
          {connection?.error && <span className="text-destructive">· {connection.error}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><ArrowDownLeft className="h-3.5 w-3.5 text-primary" /> Recebidas {totals.inbound}</span>
          <span className="inline-flex items-center gap-1"><ArrowUpRight className="h-3.5 w-3.5 text-primary" /> Enviadas {totals.outbound}</span>
          <span>Não lidas {totals.unread}</span>
          <span>Sincronizado {formatTime(lastSyncAt)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-2.5 sm:px-5">
        <ListFilter className="h-3.5 w-3.5 text-muted-foreground" />
        {FILTERS.map((item) => (
          <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={cn("rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors", filter === item.id ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30")}>
            {item.label} <span className="opacity-70">{filterCounts[item.id]}</span>
          </button>
        ))}
      </div>

      <CardContent className="grid min-h-[28rem] gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(230px,0.72fr)_minmax(0,1.28fr)]">
        <div className="min-w-0 rounded-xl border border-border/60 bg-secondary/20 p-2">
          <div className="mb-2 flex items-center justify-between px-2 py-1"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Conversas</p><span className="text-[11px] text-muted-foreground">{filteredConversations.length}</span></div>
          {isLoading && conversations.length === 0 ? (
            <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin text-primary" /> Carregando...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs leading-5 text-muted-foreground">Nenhuma conversa neste filtro. Use "Nova conversa" para iniciar um atendimento a partir de uma lista.</div>
          ) : (
            <div className="space-y-1">
              {filteredConversations.map((conversation) => {
                const open = hasServiceWindow(conversation);
                const lists = conversation.lists && conversation.lists.length > 0 ? conversation.lists : (conversation.origin_list ? [conversation.origin_list] : []);
                return (
                  <button key={conversation.id} type="button" onClick={() => void loadThread(conversation.id)} className={cn("w-full rounded-lg border p-3 text-left transition-colors", selectedId === conversation.id ? "border-primary/40 bg-primary/10" : "border-transparent hover:border-border hover:bg-background/60")}>
                    <div className="flex items-start gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground"><UserRound className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-xs font-semibold">{conversation.contact_name || conversation.phone_e164}</p>
                          {conversation.unread_count > 0 && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">{conversation.unread_count}</span>}
                        </div>
                        <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-muted-foreground">
                          {conversation.last_message_direction === "outbound" ? <ArrowUpRight className="h-3 w-3 shrink-0" /> : <ArrowDownLeft className="h-3 w-3 shrink-0" />}
                          <span className="truncate">{conversation.last_message_preview || "Sem mensagem de texto"}</span>
                        </p>
                        {lists.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {lists.slice(0, 2).map((list) => <span key={list} className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] text-muted-foreground">{list}</span>)}
                            {lists.length > 2 && <span className="text-[9px] text-muted-foreground">+{lists.length - 2}</span>}
                          </div>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{formatDateTime(conversation.last_message_at)}</span>
                          <span className={cn("rounded-full px-1.5 py-0.5", open ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>{open ? "Janela aberta" : "Template"}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-background/30">
          {!selectedConversation ? (
            <div className="flex min-h-[20rem] flex-1 flex-col items-center justify-center p-6 text-center">
              <div className="mb-3 rounded-2xl bg-primary/10 p-3 text-primary"><MessageCircle className="h-6 w-6" /></div>
              <p className="text-sm font-semibold">Selecione uma conversa</p>
              <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">O histórico de entrada e saída, a lista de origem, a janela de atendimento e o campo de resposta aparecerão aqui.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2 border-b border-border/60 px-3 py-3 sm:px-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{selectedConversation.contact_name || selectedConversation.phone_e164}</p>
                    <p className="text-[11px] text-muted-foreground">{selectedConversation.phone_e164} · última atividade {formatDateTime(selectedConversation.last_message_at)}</p>
                  </div>
                  <Badge variant="outline" className={cn("shrink-0 rounded-full text-[10px]", canSendFreeText ? "border-primary/30 bg-primary/10 text-primary" : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300")}>{canSendFreeText ? "Janela 24h aberta" : "Fora da janela · template"}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold">Status: {selectedConversation.status === "open" ? "Aberta" : selectedConversation.status === "closed" ? "Encerrada" : "Arquivada"}</span>
                  {(threadLists.length > 0 ? threadLists.map((item) => item.list_name) : selectedConversation.origin_list ? [selectedConversation.origin_list] : []).map((list) => (
                    <span key={list} className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">Lista: {list}</span>
                  ))}
                  {selectedConversation.last_template_name && <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5"><FileText className="h-3 w-3" /> Último template: {selectedConversation.last_template_name}</span>}
                  {selectedConversation.service_window_expires_at && <span>Janela expira {formatDateTime(selectedConversation.service_window_expires_at)}</span>}
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
                {isThreadLoading ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin text-primary" /> Carregando histórico...</div>
                ) : messages.length === 0 ? (
                  <p className="py-10 text-center text-xs text-muted-foreground">Nenhuma mensagem persistida nesta conversa.</p>
                ) : (
                  groupedMessages.map((group) => (
                    <div key={group.day} className="space-y-2">
                      <div className="flex justify-center"><span className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{group.day}</span></div>
                      {group.items.map((message) => (
                        <div key={message.id} className={cn("flex", message.direction === "outbound" ? "justify-end" : "justify-start")}>
                          <div className={cn("max-w-[88%] rounded-2xl px-3 py-2 text-xs", message.direction === "outbound" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-secondary text-foreground")}>
                            <p className={cn("mb-1 text-[9px] font-semibold uppercase tracking-[0.12em]", message.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground")}>
                              {message.direction === "outbound" ? "Enviada" : "Recebida"}
                              {message.message_type !== "text" ? ` · ${message.message_type}` : ""}
                              {message.template_name ? ` · ${message.template_name}` : ""}
                            </p>
                            {message.message_type === "audio" && (
                              message.media_url
                                ? <audio controls preload="none" src={message.media_url} className="w-56 max-w-full" />
                                : <p className="italic opacity-80">{message.processing_status === "media_download_failed" ? "Não foi possível baixar este áudio." : "Áudio recebido, aguardando processamento."}</p>
                            )}
                            {message.message_type === "video" && (
                              message.media_url
                                ? <video controls preload="metadata" src={message.media_url} className="w-64 max-w-full rounded-lg" />
                                : <p className="italic opacity-80">{message.processing_status === "media_download_failed" ? "Não foi possível baixar este vídeo." : "Vídeo recebido, aguardando processamento."}</p>
                            )}
                            {message.media_caption && <p className="mt-1 whitespace-pre-wrap break-words">{message.media_caption}</p>}
                            {message.message_type === "audio" && (message.transcription
                              ? <p className="mt-1 whitespace-pre-wrap break-words opacity-90">{message.transcription}</p>
                              : message.media_storage_path && <p className="mt-1 text-[10px] opacity-70">Aguardando transcrição.</p>)}
                            {message.message_type !== "audio" && message.message_type !== "video" && <p className="whitespace-pre-wrap break-words">{message.body || `[${message.message_type}]`}</p>}
                            <div className={cn("mt-1 flex items-center justify-end gap-1 text-[9px]", message.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground")}>
                              <span>{formatDateTime(message.provider_timestamp || message.created_at)}</span>
                              {message.direction === "outbound" ? (
                                <>
                                  <span>· {outboundStatusLabel(message.status)}</span>
                                  <OutboundStatusIcon status={message.status} />
                                </>
                              ) : (
                                <ArrowDownLeft className="h-3 w-3" />
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-border/60 p-3 sm:p-4">
                {canSendFreeText ? (
                  <>
                    <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} disabled={isSending} placeholder="Escreva uma resposta..." className="min-h-20 resize-none rounded-lg text-sm" maxLength={4096} />
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-[10px] leading-4 text-muted-foreground">Janela de 24 horas aberta: mensagem livre permitida. O status de entrega é atualizado pelo webhook.</p>
                      <Button onClick={() => void handleSend()} disabled={!draft.trim() || isSending} className="w-full rounded-lg sm:w-auto"><Send className="mr-2 h-3.5 w-3.5" />{isSending ? "Enviando..." : "Enviar mensagem"}</Button>
                    </div>
                    <div className="mt-3 space-y-2 rounded-lg border border-border/60 bg-secondary/20 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Áudio ou vídeo</p>
                        <select
                          value={mediaKind}
                          onChange={(event) => { setMediaKind(event.target.value as "audio" | "video"); setMediaFile(null); setMediaError(null); setMediaProgress(0); }}
                          className="h-8 rounded-lg border border-input bg-background px-2 text-xs text-foreground"
                        >
                          <option value="audio">Áudio</option>
                          <option value="video">Vídeo</option>
                        </select>
                      </div>
                      <input
                        type="file"
                        accept={acceptAttribute(mediaKind)}
                        onChange={(event) => { setMediaFile(event.target.files?.[0] || null); setMediaError(null); }}
                        disabled={isSendingMedia}
                        className="w-full rounded-lg border border-input bg-background p-2 text-xs text-foreground"
                      />
                      {mediaKind === "video" && <Input value={mediaCaption} onChange={(event) => setMediaCaption(event.target.value)} maxLength={1024} placeholder="Legenda do vídeo (opcional)" className="h-8 rounded-lg text-xs" />}
                      {mediaProgress > 0 && mediaProgress < 100 && <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${mediaProgress}%` }} /></div>}
                      {mediaError && <p className="text-[11px] text-destructive">{mediaError}</p>}
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-[10px] leading-4 text-muted-foreground">{mediaKind === "audio" ? "AAC, MP4/M4A, MP3, AMR ou OGG/Opus até 16 MB." : "MP4 ou 3GP até 16 MB, vídeo H.264 e áudio AAC."}</p>
                        <Button variant="outline" onClick={() => void handleSendMedia()} disabled={!mediaFile || isSendingMedia} className="w-full rounded-lg bg-transparent sm:w-auto"><Send className="mr-2 h-3.5 w-3.5" />{isSendingMedia ? "Enviando..." : `Enviar ${mediaKind === "audio" ? "áudio" : "vídeo"}`}</Button>
                      </div>
                    </div>
                  </>
                ) : isArchived ? (
                  <p className="text-[11px] text-muted-foreground">Conversa arquivada: não é possível enviar mensagens.</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Fora da janela de 24h · template aprovado</p>
                    <select value={templateKey} onChange={(event) => setTemplateKey(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                      <option value="">Selecione um template aprovado</option>
                      {templates.map((template) => <option key={`${template.name}|${template.language}`} value={`${template.name}|${template.language}`}>{template.name} · {template.language} · {template.category || "—"}</option>)}
                    </select>
                    {templates.length === 0 && <p className="text-[11px] text-muted-foreground">Nenhum template aprovado disponível nesta conta da Meta.</p>}
                    {templateBody && <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 text-[11px] leading-5 text-muted-foreground">{templateBody}</div>}
                    {variableCount > 0 && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {Array.from({ length: variableCount }, (_, index) => (
                          <div key={index} className="space-y-1">
                            <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{`Variável {{${index + 1}}}`}</label>
                            <Input value={templateVariables[index] || ""} onChange={(event) => setTemplateVariables((current) => { const next = [...current]; next[index] = event.target.value; return next; })} className="h-9 rounded-lg text-sm" />
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-[10px] leading-4 text-muted-foreground">Fora da janela de atendimento o WhatsApp só permite templates aprovados pela Meta.</p>
                      <Button onClick={() => void handleSend()} disabled={!selectedTemplate || isSending} className="w-full rounded-lg sm:w-auto"><Send className="mr-2 h-3.5 w-3.5" />{isSending ? "Enviando..." : "Enviar template"}</Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
