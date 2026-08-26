import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { pinSessionHeaders } from "@/lib/v4PinSession";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { CheckCheck, Clock3, MessageCircle, RefreshCw, Send, ShieldCheck, UserRound } from "lucide-react";

type Conversation = {
  id: string;
  phone_e164: string;
  contact_id?: string | null;
  contact_name?: string | null;
  status: "open" | "closed" | "archived";
  service_window_expires_at?: string | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  last_message_direction?: "inbound" | "outbound" | null;
  unread_count: number;
};

type ConversationMessage = {
  id: string;
  external_id?: string | null;
  direction: "inbound" | "outbound";
  message_type: string;
  body?: string | null;
  status: string;
  operator_key?: string | null;
  created_at: string;
};

function formatTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatDate(value?: string | null): string {
  if (!value) return "Sem atividade";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem atividade";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function hasServiceWindow(conversation?: Conversation | null): boolean {
  if (!conversation?.service_window_expires_at) return false;
  const date = new Date(conversation.service_window_expires_at);
  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
}

export function InboxPanel() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isThreadLoading, setIsThreadLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();

  const selectedConversation = useMemo(() => conversations.find((conversation) => conversation.id === selectedId) || null, [conversations, selectedId]);
  const canReply = hasServiceWindow(selectedConversation) && selectedConversation?.status !== "archived";

  const loadConversations = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.functions.invoke("message-inbox-list", { body: {}, headers: pinSessionHeaders() });
    setIsLoading(false);
    if (error || !data?.ok) {
      toast({ title: "Inbox não carregado", description: data?.error || error?.message || "Não foi possível consultar as conversas.", variant: "destructive" });
      return;
    }
    const next = Array.isArray(data.conversations) ? data.conversations as Conversation[] : [];
    setConversations(next);
    if (selectedId && !next.some((conversation) => conversation.id === selectedId)) {
      setSelectedId(null);
      setMessages([]);
    }
  };

  const loadThread = async (conversationId: string) => {
    setSelectedId(conversationId);
    setIsThreadLoading(true);
    const { data, error } = await supabase.functions.invoke("message-inbox-list", { body: { conversationId }, headers: pinSessionHeaders() });
    setIsThreadLoading(false);
    if (error || !data?.ok) {
      toast({ title: "Conversa não carregada", description: data?.error || error?.message || "Não foi possível consultar o histórico.", variant: "destructive" });
      return;
    }
    setMessages(Array.isArray(data.messages) ? data.messages as ConversationMessage[] : []);
    setConversations((current) => current.map((conversation) => conversation.id === conversationId ? { ...conversation, unread_count: 0 } : conversation));
  };

  useEffect(() => {
    void loadConversations();
  }, []);

  const handleReply = async () => {
    if (!selectedConversation || !draft.trim()) return;
    if (!canReply) {
      toast({ title: "Janela encerrada", description: "Só é possível responder livremente dentro da janela de atendimento de 24 horas. Use um template aprovado da Meta.", variant: "destructive" });
      return;
    }
    if (!dryRun && !window.confirm("Confirma o envio desta resposta para a Meta? A mensagem será enviada ao cliente.")) return;

    setIsSending(true);
    const { data, error } = await supabase.functions.invoke("message-inbox-reply", {
      body: { conversationId: selectedConversation.id, message: draft.trim(), dryRun, idempotencyKey: `inbox-${selectedConversation.id}-${Date.now()}` },
      headers: pinSessionHeaders(),
    });
    setIsSending(false);
    if (error || !data?.ok) {
      toast({ title: "Resposta não enviada", description: data?.error || error?.message || "O servidor recusou a resposta.", variant: "destructive" });
      return;
    }
    setDraft("");
    toast({ title: data.dryRun ? "Resposta simulada" : "Resposta enviada", description: data.dryRun ? "O modo de teste está ativo; nenhuma mensagem real saiu da V4." : "Acompanhe a entrega pelo status do webhook." });
    await loadThread(selectedConversation.id);
    await loadConversations();
  };

  return (
    <Card className="glass-card overflow-hidden rounded-[1.25rem]">
      <CardHeader className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Atendimento WhatsApp</CardDescription>
          <CardTitle className="mt-1 text-xl tracking-[-0.04em]">Chat e respostas recebidas</CardTitle>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Responda dentro da janela de atendimento e mantenha toda a conversa registrada.</p>
        </div>
        <Button variant="outline" size="sm" className="w-full rounded-lg bg-transparent sm:w-auto" onClick={() => void loadConversations()} disabled={isLoading}>
          <RefreshCw className={cn("mr-2 h-3.5 w-3.5", isLoading && "animate-spin")} /> Atualizar inbox
        </Button>
      </CardHeader>
      <CardContent className="grid min-h-[28rem] gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(230px,0.72fr)_minmax(0,1.28fr)]">
        <div className="min-w-0 rounded-xl border border-border/60 bg-secondary/20 p-2">
          <div className="mb-2 flex items-center justify-between px-2 py-1"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Conversas</p><span className="text-[11px] text-muted-foreground">{conversations.length}</span></div>
          {isLoading && conversations.length === 0 ? <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin text-primary" /> Carregando...</div> : conversations.length === 0 ? <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs leading-5 text-muted-foreground">Nenhuma resposta recebida ainda. Quando a Meta entregar uma mensagem, ela aparecerá aqui.</div> : <div className="space-y-1">{conversations.map((conversation) => { const open = hasServiceWindow(conversation); return <button key={conversation.id} type="button" onClick={() => void loadThread(conversation.id)} className={cn("w-full rounded-lg border p-3 text-left transition-colors", selectedId === conversation.id ? "border-primary/40 bg-primary/10" : "border-transparent hover:border-border hover:bg-background/60")}><div className="flex items-start gap-2"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground"><UserRound className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-xs font-semibold">{conversation.contact_name || conversation.phone_e164}</p>{conversation.unread_count > 0 && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">{conversation.unread_count}</span>}</div><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{conversation.last_message_preview || "Sem mensagem de texto"}</p><div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground"><span>{formatDate(conversation.last_message_at)}</span><span className={cn("rounded-full px-1.5 py-0.5", open ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>{open ? "Janela aberta" : "Template"}</span></div></div></div></button>; })}</div>}
        </div>

        <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-background/30">
          {!selectedConversation ? <div className="flex min-h-[20rem] flex-1 flex-col items-center justify-center p-6 text-center"><div className="mb-3 rounded-2xl bg-primary/10 p-3 text-primary"><MessageCircle className="h-6 w-6" /></div><p className="text-sm font-semibold">Selecione uma conversa</p><p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">O histórico, a janela de atendimento e o campo de resposta aparecerão aqui.</p></div> : <>
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-3 sm:px-4"><div className="min-w-0"><p className="truncate text-sm font-semibold">{selectedConversation.contact_name || selectedConversation.phone_e164}</p><p className="text-[11px] text-muted-foreground">{selectedConversation.phone_e164} · última atividade {formatDate(selectedConversation.last_message_at)}</p></div><Badge variant="outline" className={cn("shrink-0 rounded-full text-[10px]", canReply ? "border-primary/30 bg-primary/10 text-primary" : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300")}>{canReply ? "Janela 24h aberta" : "Template necessário"}</Badge></div>
            <div className="flex-1 space-y-2 overflow-y-auto p-3 sm:p-4">{isThreadLoading ? <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin text-primary" /> Carregando histórico...</div> : messages.length === 0 ? <p className="py-10 text-center text-xs text-muted-foreground">Nenhuma mensagem persistida nesta conversa.</p> : messages.map((message) => <div key={message.id} className={cn("flex", message.direction === "outbound" ? "justify-end" : "justify-start")}><div className={cn("max-w-[88%] rounded-2xl px-3 py-2 text-xs", message.direction === "outbound" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-secondary text-foreground")}><p className="whitespace-pre-wrap break-words">{message.body || `[${message.message_type}]`}</p><div className={cn("mt-1 flex items-center justify-end gap-1 text-[9px]", message.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground")}><span>{formatTime(message.created_at)}</span>{message.direction === "outbound" && <CheckCheck className="h-3 w-3" />}</div></div></div>)}</div>
            <div className="border-t border-border/60 p-3 sm:p-4"><div className="mb-2 flex items-center justify-between gap-2"><div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> {dryRun ? "Modo de teste protegido" : "Envio real habilitado"}</div><button type="button" className={cn("relative h-5 w-9 rounded-full transition-colors", dryRun ? "bg-primary" : "bg-muted")} onClick={() => { if (dryRun) { setDryRun(false); } else { setDryRun(true); } }} aria-label="Alternar modo de teste"><span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform", dryRun ? "left-4" : "left-0.5")} /></button></div><Textarea value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!canReply || isSending} placeholder={canReply ? "Escreva uma resposta..." : "Janela fechada: selecione um template aprovado"} className="min-h-20 resize-none rounded-lg text-sm" maxLength={4096} /><div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-[10px] leading-4 text-muted-foreground">{canReply ? "Resposta livre permitida pela janela de atendimento." : "A V4 bloqueia mensagens livres fora da janela de 24 horas."}</p><Button onClick={() => void handleReply()} disabled={!canReply || !draft.trim() || isSending} className="w-full rounded-lg sm:w-auto"><Send className="mr-2 h-3.5 w-3.5" />{isSending ? "Enviando..." : dryRun ? "Simular resposta" : "Enviar resposta"}</Button></div></div>
          </>}
        </div>
      </CardContent>
    </Card>
  );
}
