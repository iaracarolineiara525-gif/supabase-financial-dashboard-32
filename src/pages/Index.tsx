import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { V4Logo } from "@/components/V4Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { InboxPanel } from "@/components/InboxPanel";
import { AccountHealthPanel, QueuePanel, ReportsPanel, SettingsPanel } from "@/components/OperationalPanels";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import logoMeta from "@/assets/logo-meta-distribuidora.png";
import { supabase } from "@/integrations/supabase/client";
import { pinSessionHeaders } from "@/lib/v4PinSession";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Clock3,
  Code2,
  Copy,
  FileSpreadsheet,
  FileText,
  Filter,
  Gauge,
  History,
  LayoutDashboard,
  ListFilter,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tag,
  TerminalSquare,
  Upload,
  Users,
  UserRoundPlus,
  XCircle,
} from "lucide-react";

type Section = "overview" | "campaigns" | "queue" | "templates" | "contacts" | "inbox" | "reports" | "health" | "api" | "settings";
type NavItem = { id: Section; label: string; description: string; icon: typeof LayoutDashboard };

type Contact = {
  id: string;
  name: string;
  phone: string;
  group: string;
  consent: "Consentido" | "Pendente" | "Descadastrado";
  lastSend: string;
};

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  { label: "Comando", items: [{ id: "overview", label: "Visão geral", description: "Comando central", icon: LayoutDashboard }] },
  { label: "Operação", items: [
    { id: "campaigns", label: "Campanhas", description: "Disparos e agendamento", icon: Send },
    { id: "queue", label: "Fila e entregas", description: "Status por mensagem", icon: ListFilter },
    { id: "templates", label: "Templates", description: "Mensagens aprovadas", icon: FileText },
    { id: "contacts", label: "Contatos e públicos", description: "Listas e consentimento", icon: Users },
    { id: "inbox", label: "Caixa de entrada", description: "Atendimento e respostas", icon: MessageCircle },
    { id: "reports", label: "Relatórios", description: "Desempenho operacional", icon: BarChart3 },
    { id: "health", label: "Saúde da conta", description: "Qualidade e alertas", icon: ShieldCheck },
  ] },
  { label: "Administração", items: [
    { id: "api", label: "Canais e API", description: "Conexão e segurança", icon: Code2 },
    { id: "settings", label: "Configurações", description: "Perfis e regras", icon: Settings2 },
  ] },
];

const contacts: Contact[] = [
  { id: "1", name: "Ana Carolina Mendes", phone: "+55 11 99824-1180", group: "Clientes ativos", consent: "Consentido", lastSend: "Hoje, 09:42" },
  { id: "2", name: "Bruno Henrique Silva", phone: "+55 11 99140-2271", group: "Clientes ativos", consent: "Consentido", lastSend: "Ontem, 17:18" },
  { id: "3", name: "Camila Oliveira Costa", phone: "+55 21 98770-0912", group: "Novos leads", consent: "Consentido", lastSend: "Nunca" },
  { id: "4", name: "Daniel Souza Ribeiro", phone: "+55 31 98854-6620", group: "Clientes ativos", consent: "Pendente", lastSend: "—" },
  { id: "5", name: "Eduarda Martins", phone: "+55 41 99903-4418", group: "Pós-venda", consent: "Consentido", lastSend: "12 ago, 14:06" },
  { id: "6", name: "Fernanda Azevedo", phone: "+55 51 99122-8045", group: "Supressão", consent: "Descadastrado", lastSend: "—" },
];

const campaigns = [
  { name: "Reativação — clientes sem compra", status: "Em execução", delivered: "68%", audience: "148 contatos", time: "Iniciada há 14 min" },
  { name: "Lembrete de pagamento", status: "Agendada", delivered: "—", audience: "42 contatos", time: "Hoje, 18:30" },
  { name: "Boas-vindas novos clientes", status: "Concluída", delivered: "96%", audience: "86 contatos", time: "Ontem, 11:20" },
];

const sectionCopy: Record<Section, { eyebrow: string; title: string; description: string }> = {
  overview: { eyebrow: "CENTRO DE COMANDO", title: "Mensagens que chegam no momento certo.", description: "Organize sua operação, controle seus contatos e acompanhe cada envio com clareza." },
  campaigns: { eyebrow: "OPERAÇÃO CONTROLADA", title: "Campanhas", description: "Selecione o público, revise a mensagem e simule tudo antes de qualquer envio real." },
  queue: { eyebrow: "OPERAÇÃO POR MENSAGEM", title: "Fila e entregas", description: "Separe aceitação, envio, entrega, leitura, falha e retentativa em um único acompanhamento." },
  templates: { eyebrow: "MENSAGENS OFICIAIS", title: "Templates", description: "Crie, acompanhe e utilize somente modelos compatíveis com o status retornado pela Meta." },
  contacts: { eyebrow: "BASE DE RELACIONAMENTO", title: "Contatos e públicos", description: "Organize listas, consentimentos, opt-outs e segmentos antes de preparar uma campanha." },
  inbox: { eyebrow: "ATENDIMENTO CONTROLADO", title: "Caixa de entrada", description: "Acompanhe respostas recebidas e responda dentro da janela e das regras da Meta." },
  reports: { eyebrow: "VISÃO DE DESEMPENHO", title: "Relatórios", description: "Leia o funil de aceitação, entrega, leitura, resposta e opt-out por campanha." },
  health: { eyebrow: "PREVENÇÃO OPERACIONAL", title: "Saúde da conta", description: "Antecipe problemas de qualidade, limites, webhooks atrasados e falhas recentes." },
  api: { eyebrow: "INFRAESTRUTURA DE ENVIO", title: "Canais e API", description: "Conecte o provedor oficial, valide a segurança e deixe o canal pronto para operar." },
  settings: { eyebrow: "ADMINISTRAÇÃO V4", title: "Configurações", description: "Gerencie perfis, regras, trilha de auditoria e preferências da operação." },
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    "Em execução": "border-primary/30 bg-primary/10 text-primary",
    Agendada: "border-border bg-secondary text-foreground",
    Concluída: "border-white/15 bg-white/10 text-white dark:bg-white/10",
    Consentido: "border-primary/25 bg-primary/10 text-primary",
    Pendente: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300",
    Descadastrado: "border-destructive/25 bg-destructive/10 text-destructive",
  };

  return <Badge variant="outline" className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]", styles[status] || "border-border bg-secondary")}>{status}</Badge>;
}

function MetricCard({ label, value, detail, icon: Icon, tone = "neutral" }: { label: string; value: string; detail: string; icon: typeof Users; tone?: "red" | "neutral" | "white" }) {
  return (
    <Card className="glass-card rounded-2xl transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30">
      <CardContent className="p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.06em] text-foreground">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </div>
          <div className={cn("rounded-lg p-2.5", tone === "red" ? "bg-primary/15 text-primary" : tone === "white" ? "bg-foreground text-background" : "bg-secondary text-foreground")}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type ImportRow = {
  name: string;
  phone: string;
  email: string;
  group: string;
  consent: string;
  consentCategory: string;
  consentNoticeVersion: string;
  consentChannel: string;
};

type ImportParseResult = {
  rows: ImportRow[];
  errors: string[];
};

const IMPORT_MAX_BYTES = 10 * 1024 * 1024;
const IMPORT_ALIASES: Record<keyof ImportRow, string[]> = {
  name: ["nome", "name", "full_name", "cliente", "contato"],
  phone: ["telefone", "phone", "celular", "whatsapp", "phone_e164", "numero"],
  email: ["email", "e-mail", "mail"],
  group: ["grupo", "group", "segmento", "tag"],
  consent: ["consentimento", "consent", "opt_in", "optin", "status_consentimento"],
  consentCategory: ["categoria_consentimento", "consent_category", "categoria", "category"],
  consentNoticeVersion: ["versao_aviso", "consent_notice_version", "versao_consentimento"],
  consentChannel: ["canal_consentimento", "consent_channel", "canal"],
};

function normalizeImportHeader(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeImportPhone(value: string): string {
  const compact = value.trim().replace(/[^0-9+]/g, "");
  return compact.startsWith("+") ? `+${compact.slice(1).replace(/\D/g, "")}` : compact.replace(/\D/g, "");
}

function isImportE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(normalizeImportPhone(value));
}

function importConsentLabel(value: string): string {
  const normalized = normalizeImportHeader(value);
  if (["sim", "yes", "true", "consentido", "consented", "opt_in", "optin"].includes(normalized)) return "consentido";
  if (["nao", "no", "false", "descadastrado", "revogado", "revoked", "opt_out", "optout"].includes(normalized)) return "revogado";
  return "pendente";
}

function importConsentCategory(value: string): string {
  const normalized = normalizeImportHeader(value);
  if (["utility", "utilidade", "servico", "service"].includes(normalized)) return "utility";
  if (["marketing", "promocional", "promocao"].includes(normalized)) return "marketing";
  if (["authentication", "autenticacao", "autenticacao"].includes(normalized)) return "authentication";
  if (["all", "todos", "todas", "geral", ""].includes(normalized)) return "all";
  return normalized;
}

function isImportConsentCategory(value: string): boolean {
  return ["all", "utility", "marketing", "authentication"].includes(importConsentCategory(value));
}

async function parseContactsFile(file: File): Promise<ImportParseResult> {
  if (file.size > IMPORT_MAX_BYTES) throw new Error("O arquivo deve ter no máximo 10 MB.");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("A planilha não possui uma aba para importar.");
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheetName], { defval: "" });
  if (records.length === 0) throw new Error("A planilha não possui linhas de dados.");

  const headers = Object.keys(records[0] || {}).map((header) => [normalizeImportHeader(header), header] as const);
  const findColumn = (field: keyof ImportRow) => headers.find(([normalized]) => IMPORT_ALIASES[field].includes(normalized))?.[1];
  const columns = { name: findColumn("name"), phone: findColumn("phone"), email: findColumn("email"), group: findColumn("group"), consent: findColumn("consent"), consentCategory: findColumn("consentCategory"), consentNoticeVersion: findColumn("consentNoticeVersion"), consentChannel: findColumn("consentChannel") };
  if (!columns.name || !columns.phone) throw new Error("A planilha precisa ter colunas Nome e Telefone.");

  const errors: string[] = [];
  const rows = records.slice(0, 500).map((record, index) => {
    const row: ImportRow = {
      name: String(record[columns.name!] ?? "").trim(),
      phone: normalizeImportPhone(String(record[columns.phone!] ?? "")),
      email: columns.email ? String(record[columns.email] ?? "").trim() : "",
      group: columns.group ? String(record[columns.group] ?? "").trim() : "",
      consent: columns.consent ? importConsentLabel(String(record[columns.consent] ?? "")) : "pendente",
      consentCategory: columns.consentCategory ? importConsentCategory(String(record[columns.consentCategory] ?? "")) : "all",
      consentNoticeVersion: columns.consentNoticeVersion ? String(record[columns.consentNoticeVersion] ?? "").trim() : "",
      consentChannel: columns.consentChannel ? String(record[columns.consentChannel] ?? "").trim() : "",
    };
    if (!row.name) errors.push(`Linha ${index + 2}: nome ausente.`);
    else if (!isImportE164(row.phone)) errors.push(`Linha ${index + 2}: telefone inválido; use E.164 com + e DDI.`);
    if (row.email && !/^\S+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push(`Linha ${index + 2}: e-mail inválido.`);
    if (!isImportConsentCategory(row.consentCategory)) errors.push(`Linha ${index + 2}: categoria de consentimento inválida.`);
    return row;
  });

  if (records.length > 500) errors.push("A prévia mostra as primeiras 500 linhas; divida o arquivo para importar o restante.");
  return { rows, errors };
}

type MetaTemplate = {
  id?: string;
  name?: string;
  language?: string;
  category?: string;
  status?: string;
  quality_score?: string | { score?: string };
  components?: Array<{ type?: string; text?: string }>;
};

function MetaTemplateStatus({ status }: { status?: string }) {
  const normalized = status?.toUpperCase() || "UNKNOWN";
  const styles: Record<string, string> = {
    APPROVED: "border-primary/25 bg-primary/10 text-primary",
    ACTIVE: "border-primary/25 bg-primary/10 text-primary",
    PENDING: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300",
    IN_REVIEW: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300",
    REJECTED: "border-destructive/25 bg-destructive/10 text-destructive",
    PAUSED: "border-destructive/25 bg-destructive/10 text-destructive",
    DISABLED: "border-destructive/25 bg-destructive/10 text-destructive",
  };

  return <Badge variant="outline" className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em]", styles[normalized] || "border-border bg-secondary")}>{normalized}</Badge>;
}

function MetaTemplatesPanel() {
  const [templates, setTemplates] = useState<MetaTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [templateName, setTemplateName] = useState("v4_novidade_cliente");
  const [templateLanguage, setTemplateLanguage] = useState("pt_BR");
  const [templateCategory, setTemplateCategory] = useState("utility");
  const [templateBody, setTemplateBody] = useState("Olá, {{1}}! Temos uma novidade especial para você.");
  const [templateExample, setTemplateExample] = useState("Mariana");
  const { toast } = useToast();

  const loadTemplates = async (notify = false) => {
    setIsLoading(true);
    const { data, error } = await supabase.functions.invoke("meta-templates-list", { body: {}, headers: pinSessionHeaders() });
    setIsLoading(false);
    if (error || !data?.ok) {
      setLoadError("Não foi possível atualizar os modelos agora. Verifique a Saúde da conta e tente novamente.");
      if (notify) toast({ title: "Templates não atualizados", description: "A consulta à Meta falhou sem expor detalhes sensíveis.", variant: "destructive" });
      return;
    }
    setLoadError(null);
    setTemplates(Array.isArray(data.templates) ? data.templates : []);
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  const handleSubmit = async () => {
    if (!templateName.trim() || !templateBody.trim() || !templateExample.trim()) {
      toast({ title: "Complete o template", description: "Informe nome, corpo e exemplo da variável.", variant: "destructive" });
      return;
    }
    const confirmed = window.confirm("Enviar este template para análise da Meta? A Meta fará a aprovação; o V4 não marca templates como aprovados localmente.");
    if (!confirmed) return;

    setIsSubmitting(true);
    const { data, error } = await supabase.functions.invoke("meta-templates-create", {
      body: {
        name: templateName.trim().toLowerCase(),
        language: templateLanguage,
        category: templateCategory,
        parameter_format: "positional",
        components: [{ type: "BODY", text: templateBody.trim(), example: { body_text: [[templateExample.trim()]] } }],
      },
      headers: pinSessionHeaders(),
    });
    setIsSubmitting(false);
    if (error || !data?.ok) {
      toast({ title: "Template não enviado", description: data?.error || error?.message || "A Meta recusou a solicitação.", variant: "destructive" });
      return;
    }
    toast({ title: data.dryRun ? "Prévia registrada" : "Template enviado para análise", description: data.dryRun ? "O modo de teste está ativo; nenhum template foi criado na Meta." : "Consulte novamente para acompanhar o status retornado pela Meta." });
    if (!data.dryRun) void loadTemplates();
  };

  return (
    <Card className="glass-card rounded-[1.25rem]">
      <CardHeader className="flex-row items-start justify-between space-y-0 p-5 pb-3">
        <div>
          <CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Templates Meta</CardDescription>
          <CardTitle className="mt-1 text-lg tracking-[-0.03em]">Modelos oficiais do WhatsApp</CardTitle>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Crie um rascunho, envie para análise e acompanhe o status real devolvido pela Meta.</p>
        </div>
        <Button variant="outline" size="sm" className="rounded-lg bg-transparent" onClick={() => void loadTemplates(true)} disabled={isLoading}>
          <RefreshCw className={cn("mr-2 h-3.5 w-3.5", isLoading && "animate-spin")} /> Atualizar
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 p-5 pt-1 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-3 rounded-xl border border-border/60 bg-secondary/20 p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="space-y-1.5"><label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Nome técnico</label><Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} className="h-9 rounded-lg text-sm" placeholder="v4_novidade_cliente" /></div>
            <div className="space-y-1.5"><label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Idioma</label><select value={templateLanguage} onChange={(event) => setTemplateLanguage(event.target.value)} className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"><option value="pt_BR">Português (Brasil)</option><option value="en_US">English (US)</option><option value="es_ES">Español</option></select></div>
          </div>
          <div className="space-y-1.5"><label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Categoria Meta</label><select value={templateCategory} onChange={(event) => setTemplateCategory(event.target.value)} className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"><option value="utility">Utilidade</option><option value="marketing">Marketing</option><option value="authentication">Autenticação</option></select></div>
          <div className="space-y-1.5"><div className="flex items-center justify-between"><label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Corpo</label><span className="text-[10px] text-muted-foreground">{templateBody.length}/1024</span></div><Textarea value={templateBody} onChange={(event) => setTemplateBody(event.target.value)} className="min-h-20 resize-none rounded-lg text-sm" maxLength={1024} /><p className="text-[11px] text-muted-foreground">Use variáveis posicionais como <code className="rounded bg-secondary px-1">{"{{1}}"}</code>.</p></div>
          <div className="space-y-1.5"><label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Exemplo da variável</label><Input value={templateExample} onChange={(event) => setTemplateExample(event.target.value)} className="h-9 rounded-lg text-sm" placeholder="Mariana" /></div>
          <Button onClick={() => void handleSubmit()} disabled={isSubmitting} className="w-full rounded-lg">{isSubmitting ? "Enviando..." : "Enviar para análise da Meta"}</Button>
          <p className="text-[10px] leading-4 text-muted-foreground">O status só muda após a análise da Meta. No modo Sandbox atual, a submissão fica em prévia e não altera a conta.</p>
        </div>
        <div className="min-w-0 rounded-xl border border-border/60 p-4">
          {loadError && <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-700 dark:text-amber-300">{loadError}</div>}
          <div className="mb-3 flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Templates cadastrados</p><span className="text-[11px] text-muted-foreground">{templates.length} encontrados</span></div>
          {isLoading ? <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin text-primary" /> Consultando a Meta...</div> : templates.length === 0 ? <div className="rounded-lg border border-dashed border-border p-5 text-center text-xs leading-5 text-muted-foreground">Nenhum template retornado para esta WABA. Use o formulário ao lado para preparar uma submissão.</div> : <div className="max-h-64 space-y-2 overflow-y-auto pr-1">{templates.map((template, index) => <div key={template.id || `${template.name}-${template.language}-${index}`} className="rounded-lg border border-border/60 bg-secondary/20 p-3"><div className="flex flex-wrap items-center gap-2"><p className="min-w-0 flex-1 truncate text-sm font-semibold">{template.name || "Sem nome"}</p><MetaTemplateStatus status={template.status} /></div><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground"><span>{template.language || "—"}</span><span>{template.category || "—"}</span>{template.id && <span className="font-mono">ID {template.id}</span>}</div><p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{template.components?.find((component) => component.type?.toUpperCase() === "BODY")?.text || "Corpo não informado pela Meta."}</p></div>)}</div>}
          <p className="mt-3 text-[10px] leading-4 text-muted-foreground">Somente templates com status aprovado/ativo devem ser usados em mensagens fora da janela de atendimento.</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Index() {
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [apiMode, setApiMode] = useState("Sandbox");
  const [apiProvider, setApiProvider] = useState("WhatsApp Business Platform");
  const [message, setMessage] = useState("Olá {{nome}}, tudo bem? Temos uma novidade especial para você. Acesse {{link}} para conferir.");
  const [campaignName, setCampaignName] = useState("Novidade para clientes ativos");
  const [search, setSearch] = useState("");
  const [consentFilter, setConsentFilter] = useState<"all" | "consented" | "pending" | "revoked">("all");
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [importPreview, setImportPreview] = useState<ImportParseResult | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [testRecipient, setTestRecipient] = useState("");
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const { theme } = useTheme();
  const { signOut, operator } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const copy = sectionCopy[activeSection];
  const filteredContacts = useMemo(() => contacts.filter((contact) => {
    const matchesSearch = `${contact.name} ${contact.phone} ${contact.group}`.toLowerCase().includes(search.toLowerCase());
    const matchesConsent = consentFilter === "all" || (consentFilter === "consented" && contact.consent === "Consentido") || (consentFilter === "pending" && contact.consent === "Pendente") || (consentFilter === "revoked" && contact.consent === "Descadastrado");
    return matchesSearch && matchesConsent;
  }), [consentFilter, search]);

  const resetImport = () => {
    setImportPreview(null);
    setImportFileName("");
    setImportSummary(null);
  };

  const handleImportFile = async (file: File) => {
    try {
      const result = await parseContactsFile(file);
      setImportPreview(result);
      setImportFileName(file.name);
      setImportSummary(null);
      toast({ title: "Prévia pronta", description: `${result.rows.length} linhas lidas. Revise os erros antes de importar.` });
    } catch (error) {
      toast({ title: "Arquivo não lido", description: error instanceof Error ? error.message : "Escolha um arquivo XLSX ou CSV válido.", variant: "destructive" });
    }
  };

  const handleImport = async () => {
    if (!importPreview) return;
    const validRows = importPreview.rows.filter((row) => row.name && isImportE164(row.phone) && (!row.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) && isImportConsentCategory(row.consentCategory));
    if (validRows.length === 0) {
      toast({ title: "Nenhum contato válido", description: "Corrija nome e telefone no arquivo e tente novamente.", variant: "destructive" });
      return;
    }
    setIsImporting(true);
    const { data, error } = await supabase.functions.invoke("message-contacts-import", { body: { rows: validRows }, headers: pinSessionHeaders() });
    setIsImporting(false);
    if (error || !data?.ok) {
      toast({ title: "Importação não concluída", description: data?.error || error?.message || "O servidor recusou os registros.", variant: "destructive" });
      return;
    }
    setImportSummary(`${data.created || 0} novos, ${data.updated || 0} atualizados, ${data.blockedBySuppression || 0} ignorados por supressão.`);
    toast({ title: "Importação concluída", description: "A lista foi validada no servidor e registrada com auditoria." });
  };

  const validImportCount = importPreview?.rows.filter((row) => row.name && isImportE164(row.phone) && (!row.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) && isImportConsentCategory(row.consentCategory)).length || 0;

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const showDemoToast = (title: string, description: string) => toast({ title, description });

  const handleTestConnection = async () => {
    setIsCheckingConnection(true);
    const { data, error } = await supabase.functions.invoke("meta-health", { body: {}, headers: pinSessionHeaders() });
    setIsCheckingConnection(false);
    if (error || !data?.ok) {
      toast({ title: "Falha na conexão", description: data?.error || error?.message || "Não foi possível validar a Meta.", variant: "destructive" });
      return;
    }
    showDemoToast("Conexão validada", "A Meta respondeu sem realizar envio de mensagem.");
  };

  const handleDryRun = async () => {
    if (!testRecipient.trim()) {
      toast({ title: "Informe o número de teste", description: "Use o formato internacional, por exemplo +5511999999999.", variant: "destructive" });
      return;
    }
    setIsSending(true);
    const { data, error } = await supabase.functions.invoke("meta-send", { body: { to: testRecipient, message, dryRun: true, idempotencyKey: `dry-run-${Date.now()}` }, headers: pinSessionHeaders() });
    setIsSending(false);
    if (error || !data?.ok) {
      toast({ title: "Dry run não concluído", description: data?.error || error?.message || "Verifique a configuração do backend.", variant: "destructive" });
      return;
    }
    showDemoToast("Dry run concluído", "As validações passaram e nenhuma mensagem real foi enviada.");
  };

  const handleRealSend = async () => {
    if (dryRun) {
      showDemoToast("Ative o envio real somente após homologação", "Desative o dry run quando o backend estiver configurado e revisado.");
      return;
    }
    if (!testRecipient.trim()) {
      toast({ title: "Informe o destinatário autorizado", description: "Use apenas um número autorizado para o primeiro teste.", variant: "destructive" });
      return;
    }
    const confirmed = window.confirm(`Confirma o envio REAL da campanha "${campaignName}" para 1 destinatário?`);
    if (!confirmed) return;
    setIsSending(true);
    const { data, error } = await supabase.functions.invoke("meta-send", { body: { to: testRecipient, message, dryRun: false, idempotencyKey: `manual-${Date.now()}` }, headers: pinSessionHeaders() });
    setIsSending(false);
    if (error || !data?.ok) {
      toast({ title: "Envio não realizado", description: data?.error || error?.message || "O backend bloqueou o envio.", variant: "destructive" });
      return;
    }
    showDemoToast("Solicitação aceita pela Meta", "Acompanhe o status pelo webhook antes de ampliar a campanha.");
  };

  const toggleContact = (id: string) => {
    setSelectedContacts((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const renderOverview = () => (
    <div className="space-y-4">
      <section className="grid gap-3 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="relative overflow-hidden rounded-[1.35rem] border-primary/20 bg-black text-white shadow-2xl shadow-black/20">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/25 blur-3xl" aria-hidden="true" />
          <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:32px_32px]" aria-hidden="true" />
          <CardContent className="relative p-4 sm:p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-red-200"><Sparkles className="h-3.5 w-3.5 text-primary" /> Operação em foco</div>
            <h2 className="mt-3 max-w-2xl text-xl font-semibold leading-[1.04] tracking-[-0.055em] sm:text-3xl">Cada contato merece uma mensagem <span className="text-primary">bem direcionada.</span></h2>
            <p className="mt-3 max-w-xl text-sm leading-5 text-white/60">Crie campanhas com revisão humana, respeite o consentimento e acompanhe a entrega de ponta a ponta.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => setActiveSection("campaigns")} className="rounded-xl bg-white px-5 text-black hover:bg-white/90"><Plus className="mr-2 h-4 w-4" /> Criar campanha</Button>
              <Button onClick={() => setActiveSection("api")} variant="outline" className="rounded-xl border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Settings2 className="mr-2 h-4 w-4" /> Canais e API</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card rounded-[1.25rem]">
          <CardHeader className="flex-row items-start justify-between space-y-0 p-5 pb-3">
            <div><CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Canal principal</CardDescription><CardTitle className="mt-2 text-xl tracking-[-0.04em]">WhatsApp Business</CardTitle></div>
            <div className="rounded-xl bg-primary/15 p-3 text-primary"><MessageCircle className="h-5 w-5" /></div>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-1">
            <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" /></span><span className="text-sm font-medium">Sandbox conectado</span><span className="ml-auto text-xs text-muted-foreground">Teste</span></div>
            <div className="space-y-3 text-sm"><div className="flex justify-between gap-4"><span className="text-muted-foreground">Provedor</span><span className="font-medium text-foreground">Meta Cloud API</span></div><div className="flex justify-between gap-4"><span className="text-muted-foreground">Limite atual</span><span className="font-medium text-foreground">80 mensagens/min</span></div><div className="flex justify-between gap-4"><span className="text-muted-foreground">Última verificação</span><span className="font-medium text-foreground">Há 4 min</span></div></div>
            <Button variant="ghost" className="w-full justify-between rounded-xl px-3 text-sm text-primary hover:bg-primary/10" onClick={() => setActiveSection("api")}>Ver detalhes da conexão <ArrowRight className="h-4 w-4" /></Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Contatos elegíveis" value="1.284" detail="+12,4% neste mês" icon={Users} tone="red" />
        <MetricCard label="Mensagens enviadas" value="3.842" detail="96,2% aceitas pela API" icon={Send} tone="neutral" />
        <MetricCard label="Entregues" value="3.588" detail="93,4% do volume enviado" icon={CheckCircle2} tone="white" />
        <MetricCard label="Em fila" value="42" detail="Próximo processamento em 2 min" icon={Clock3} tone="red" />
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="glass-card rounded-[1.25rem]">
          <CardHeader className="flex-row items-end justify-between space-y-0 p-5 pb-3"><div><CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Acompanhamento</CardDescription><CardTitle className="mt-2 text-xl tracking-[-0.04em]">Campanhas recentes</CardTitle></div><Button variant="ghost" size="sm" className="text-primary" onClick={() => setActiveSection("campaigns")}>Ver todas <ArrowRight className="ml-2 h-3.5 w-3.5" /></Button></CardHeader>
          <CardContent className="space-y-2 p-5 pt-1">{campaigns.map((campaign) => <div key={campaign.name} className="group flex flex-col gap-3 rounded-2xl border border-border/60 p-4 transition-colors hover:border-primary/30 sm:flex-row sm:items-center"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground"><Send className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold">{campaign.name}</p><StatusBadge status={campaign.status} /></div><p className="mt-1 text-xs text-muted-foreground">{campaign.audience} · {campaign.time}</p></div><div className="text-left sm:text-right"><p className="text-sm font-semibold">{campaign.delivered}</p><p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">entregues</p></div><MoreHorizontal className="hidden h-4 w-4 text-muted-foreground sm:block" /></div>)}</CardContent>
        </Card>

        <Card className="glass-card rounded-[1.25rem]">
          <CardHeader className="p-4 pb-2"><CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Saúde da operação</CardDescription><CardTitle className="mt-2 text-xl tracking-[-0.04em]">Pronto para o próximo envio</CardTitle></CardHeader>
          <CardContent className="space-y-3 p-4 pt-1"><div className="flex items-center gap-4"><div className="relative flex h-16 w-16 items-center justify-center rounded-full border-[6px] border-primary/20 border-t-primary"><span className="text-base font-semibold">98%</span></div><div><p className="font-semibold">Índice operacional</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Acompanhe qualidade, consentimento e estabilidade do canal.</p></div></div><div className="space-y-2">{[{ label: "API e credenciais", value: "Verificado", icon: ShieldCheck }, { label: "Lista de supressão", value: "Atualizada", icon: ListFilter }, { label: "Fila de mensagens", value: "Estável", icon: Activity }].map((item) => <div key={item.label} className="flex items-center gap-3 text-sm"><item.icon className="h-4 w-4 text-primary" /><span className="flex-1 text-muted-foreground">{item.label}</span><span className="text-xs font-medium text-foreground">{item.value}</span><Check className="h-3.5 w-3.5 text-primary" /></div>)}</div></CardContent>
        </Card>
      </section>
    </div>
  );

  const renderApi = () => (
    <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
      <Card className="glass-card rounded-[1.25rem]"><CardHeader className="p-4 pb-3"><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20"><TerminalSquare className="h-5 w-5" /></div><CardTitle className="text-xl tracking-[-0.04em] sm:text-2xl">Conexão com a Meta</CardTitle><CardDescription className="mt-2 max-w-xl leading-6">As credenciais ficam protegidas no servidor e nunca aparecem no navegador ou no histórico de logs.</CardDescription></CardHeader><CardContent className="space-y-3 p-4 pt-1"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Provedor</label><select value={apiProvider} onChange={(e) => setApiProvider(e.target.value)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none ring-offset-background focus:ring-2 focus:ring-ring"><option>WhatsApp Business Platform</option><option>Outro provedor compatível</option></select></div><div className="space-y-2"><label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Ambiente</label><div className="grid grid-cols-2 gap-2">{["Sandbox", "Produção"].map((mode) => <button key={mode} type="button" onClick={() => { if (mode === "Produção") { toast({ title: "Produção bloqueada", description: "Homologue o sandbox e confirme a autorização da Meta antes de ativar este ambiente.", variant: "destructive" }); return; } setApiMode(mode); }} className={cn("h-10 rounded-xl border text-sm font-medium transition-colors", apiMode === mode ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary/50 text-muted-foreground hover:border-primary/40")}>{mode}</button>)}</div></div></div><div className="space-y-2"><label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Endpoint da API</label><Input value="https://graph.facebook.com/v26.0/{phone_number_id}/messages" readOnly className="h-10 rounded-xl bg-secondary/30 font-mono text-xs" /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Phone Number ID</label><Input placeholder="Informe o identificador da conta" className="h-10 rounded-xl" /></div><div className="space-y-2"><label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Token de acesso</label><div className="relative"><Input type="password" placeholder="••••••••••••••••••••" className="h-10 rounded-xl pr-10" /><LockKeyhole className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /></div></div></div><div className="flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-md text-xs leading-5 text-muted-foreground">O modo Produção só deve ser ativado após a confirmação explícita do administrador.</p><Button onClick={handleTestConnection} disabled={isCheckingConnection} className="rounded-xl"><RefreshCw className="mr-2 h-4 w-4" /> {isCheckingConnection ? "Validando..." : "Testar conexão"}</Button></div></CardContent></Card>
      <div className="space-y-3"><Card className="glass-card rounded-[1.25rem] border-primary/20"><CardHeader className="p-4 pb-2"><div className="flex items-center justify-between"><CardTitle className="text-lg">Status da integração</CardTitle><Badge className="rounded-full bg-amber-500/15 text-amber-600 hover:bg-amber-500/15 dark:text-amber-300"><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" /> Configuração pendente</Badge></div></CardHeader><CardContent className="space-y-3 p-5 pt-1"><div className="rounded-2xl bg-secondary/60 p-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-primary/15 p-2.5 text-primary"><MessageCircle className="h-5 w-5" /></div><div><p className="text-sm font-semibold">{apiProvider}</p><p className="text-xs text-muted-foreground">Ambiente {apiMode.toLowerCase()}</p></div></div></div>{[{ label: "Autenticação", value: "Protegida" }, { label: "Webhook", value: "Aguardando configuração" }, { label: "Último teste", value: "Aguardando configuração" }].map((row) => <div key={row.label} className="flex justify-between border-b border-border/50 pb-3 text-sm last:border-0 last:pb-0"><span className="text-muted-foreground">{row.label}</span><span className="font-medium">{row.value}</span></div>)}</CardContent></Card><Card className="glass-card rounded-[1.25rem]"><CardHeader className="p-4 pb-2"><CardTitle className="text-lg">Checklist de segurança</CardTitle></CardHeader><CardContent className="space-y-3 p-4 pt-1">{["Token armazenado fora do frontend", "Modo sandbox selecionado", "Erros sem dados sensíveis", "Idempotência preparada"].map((item) => <div key={item} className="flex items-center gap-3 text-sm"><CheckCircle2 className="h-4 w-4 text-primary" /><span>{item}</span></div>)}<Button variant="ghost" className="mt-2 w-full justify-between px-0 text-primary hover:bg-transparent hover:text-primary">Ver política de segurança <ArrowRight className="h-4 w-4" /></Button></CardContent></Card></div>
    </div>
  );

  const renderTemplates = () => <MetaTemplatesPanel />;
  const renderCampaigns = () => (
    <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
      <Card className="glass-card rounded-[1.25rem]"><CardHeader className="p-4 pb-2"><div className="flex items-start justify-between gap-4"><div><CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Nova campanha</CardDescription><CardTitle className="mt-2 text-xl tracking-[-0.04em] sm:text-2xl">Prepare seu próximo envio</CardTitle></div><Badge variant="outline" className="rounded-full border-primary/30 bg-primary/10 text-primary">Rascunho</Badge></div></CardHeader><CardContent className="space-y-3 p-4 pt-1"><div className="grid grid-cols-3 gap-2">{[{ step: "01", label: "Mensagem", active: true }, { step: "02", label: "Público", active: false }, { step: "03", label: "Revisão", active: false }].map((item) => <div key={item.step} className={cn("border-t-2 pt-3", item.active ? "border-primary" : "border-border")}><p className={cn("text-[10px] font-bold tracking-[0.16em]", item.active ? "text-primary" : "text-muted-foreground")}>{item.step}</p><p className="mt-1 text-xs font-medium">{item.label}</p></div>)}</div><div className="space-y-2"><label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Nome interno da campanha</label><Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} className="h-10 rounded-xl" /></div><div className="space-y-2"><div className="flex items-center justify-between"><label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Mensagem</label><span className="text-xs text-muted-foreground">{message.length}/1024</span></div><Textarea value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-36 resize-none rounded-xl leading-6" /><div className="flex flex-wrap gap-2"><span className="text-xs text-muted-foreground">Variáveis:</span>{["{{nome}}", "{{empresa}}", "{{link}}"].map((variable) => <button key={variable} type="button" onClick={() => setMessage((current) => `${current} ${variable}`)} className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 font-mono text-[10px] text-primary transition-colors hover:bg-primary/15">{variable}</button>)}</div></div><div className="space-y-2"><label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Destinatário autorizado para teste</label><Input value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)} placeholder="+55 11 99999-9999" className="h-10 rounded-xl" /><p className="text-[11px] leading-4 text-muted-foreground">Use um número autorizado pela Meta. O dry run não envia mensagem.</p></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Público</label><button type="button" className="flex h-10 w-full items-center justify-between rounded-xl border border-input bg-background px-3 text-sm"><span className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Clientes ativos · 42</span><ChevronDown className="h-4 w-4 text-muted-foreground" /></button></div><div className="space-y-2"><label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Velocidade</label><button type="button" className="flex h-10 w-full items-center justify-between rounded-xl border border-input bg-background px-3 text-sm"><span className="flex items-center gap-2"><Gauge className="h-4 w-4 text-primary" /> 20 mensagens/min</span><ChevronDown className="h-4 w-4 text-muted-foreground" /></button></div></div><div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><div className="mt-0.5 rounded-lg bg-primary/15 p-2 text-primary"><CircleDashed className="h-4 w-4" /></div><div><p className="text-sm font-semibold">Modo prévia / dry run</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Valida contatos e variáveis sem enviar mensagens reais.</p></div></div><button type="button" onClick={() => setDryRun(!dryRun)} className={cn("relative h-6 w-11 rounded-full transition-colors", dryRun ? "bg-primary" : "bg-muted")} aria-label="Alternar dry run"><span className={cn("absolute top-1 h-4 w-4 rounded-full bg-white transition-transform", dryRun ? "left-6" : "left-1")} /></button></div><div className="flex flex-col-reverse gap-3 border-t border-border/60 pt-5 sm:flex-row sm:justify-end"><Button variant="outline" className="rounded-xl" onClick={handleDryRun} disabled={isSending}><Play className="mr-2 h-4 w-4" /> {isSending ? "Validando..." : "Simular envio"}</Button><Button variant="outline" className="rounded-xl border-primary/30 text-primary hover:bg-primary/10" onClick={handleRealSend} disabled={isSending}><Send className="mr-2 h-4 w-4" /> Enviar teste real</Button><Button className="rounded-xl" onClick={() => showDemoToast("Campanha salva", "O rascunho foi salvo e ainda não envia mensagens.")}><Check className="mr-2 h-4 w-4" /> Salvar rascunho</Button></div></CardContent></Card>
      <Card className="glass-card overflow-hidden rounded-[1.25rem]"><CardHeader className="border-b border-border/60 p-5 pb-3"><div className="flex items-center justify-between"><div><CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Prévia no celular</CardDescription><CardTitle className="mt-2 text-lg">Veja antes de enviar</CardTitle></div><Smartphone className="h-5 w-5 text-primary" /></div></CardHeader><CardContent className="flex flex-col items-center gap-3 p-5"><div className="w-full max-w-[280px] rounded-[2rem] border-[6px] border-foreground/15 bg-secondary p-2 shadow-xl"><div className="overflow-hidden rounded-[1.4rem] bg-background"><div className="flex items-center gap-2 border-b border-border/60 bg-card px-3 py-3"><div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">M</div><div><p className="text-[10px] font-semibold">Meta Distribuidora</p><p className="text-[8px] text-muted-foreground">online</p></div></div><div className="min-h-40 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.05),transparent_34%),hsl(var(--muted))] p-3"><div className="rounded-2xl rounded-tl-sm bg-card p-3 shadow-sm"><p className="text-[11px] leading-5 text-foreground">{message.replace("{{nome}}", "Mariana").replace("{{link}}", "meta.com/oferta").replace("{{empresa}}", "Meta Distribuidora")}</p><p className="mt-2 text-right text-[8px] text-muted-foreground">10:42 ✓✓</p></div></div></div></div><div className="w-full space-y-3 rounded-2xl border border-border/60 p-4"><div className="flex justify-between text-sm"><span className="text-muted-foreground">Destinatários elegíveis</span><span className="font-semibold">42</span></div><div className="flex justify-between text-sm"><span className="text-muted-foreground">Bloqueados por consentimento</span><span className="font-semibold text-primary">3</span></div><div className="flex justify-between text-sm"><span className="text-muted-foreground">Modo atual</span><span className="font-semibold">{dryRun ? "Dry run" : "Revisão"}</span></div></div></CardContent></Card>
    </div>
  );

  const renderContacts = () => (
    <div className="space-y-3"><Card className="glass-card rounded-[1.25rem]"><CardHeader className="flex-col gap-3 p-5 pb-3 lg:flex-row lg:items-center lg:justify-between"><div><CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Públicos e consentimento</CardDescription><CardTitle className="mt-2 text-xl tracking-[-0.04em] sm:text-2xl">Contatos e públicos</CardTitle><p className="mt-2 text-sm text-muted-foreground">1.284 contatos totais · 1.242 com opt-in válido · 42 em supressão</p></div><div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><label className="inline-flex h-10 w-full cursor-pointer items-center rounded-xl border border-border bg-secondary/40 px-3 text-sm font-medium transition-colors hover:border-primary/40"><Upload className="mr-2 h-4 w-4 text-primary" /> Importar Excel/CSV<input type="file" accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleImportFile(file); event.currentTarget.value = ""; }} /></label><Button className="w-full rounded-xl sm:w-auto" onClick={() => showDemoToast("Novo contato", "A tela de cadastro está pronta para receber os dados do contato.")}><UserRoundPlus className="mr-2 h-4 w-4" /> Novo contato</Button></div></CardHeader><CardContent className="p-5 pt-1">{importPreview && <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-sm font-semibold">Prévia: {importFileName}</p><p className="mt-1 text-xs text-muted-foreground">{validImportCount} válidos de {importPreview.rows.length} linhas. Opt-out e consentimento ausente não entram em campanhas.</p></div><div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => void handleImport()} disabled={isImporting || validImportCount === 0} className="rounded-lg">{isImporting ? "Importando..." : `Importar ${validImportCount} válidos`}</Button><Button size="sm" variant="outline" onClick={resetImport} className="rounded-lg bg-transparent">Cancelar</Button></div></div>{importSummary && <p className="mt-2 text-xs font-medium text-primary">{importSummary}</p>}{importPreview.errors.length > 0 && <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs"><p className="font-semibold text-amber-700 dark:text-amber-300">{importPreview.errors.length} aviso(s) de validação</p><ul className="mt-1 list-inside list-disc space-y-0.5 text-muted-foreground">{importPreview.errors.slice(0, 3).map((error) => <li key={error}>{error}</li>)}</ul></div>}<div className="mt-3 overflow-x-auto rounded-lg border border-border/60"><table className="w-full min-w-[560px] text-left text-xs"><thead className="bg-secondary/40 text-[10px] uppercase tracking-[0.1em] text-muted-foreground"><tr><th className="px-3 py-2">Nome</th><th className="px-3 py-2">Telefone</th><th className="px-3 py-2">Grupo</th><th className="px-3 py-2">Consentimento</th></tr></thead><tbody>{importPreview.rows.slice(0, 8).map((row, index) => <tr key={`${row.phone}-${index}`} className="border-t border-border/40"><td className="px-3 py-2 font-medium">{row.name || "—"}</td><td className={cn("px-3 py-2 font-mono", isImportE164(row.phone) ? "text-foreground" : "text-destructive")}>{row.phone || "—"}</td><td className="px-3 py-2 text-muted-foreground">{row.group || "—"}</td><td className="px-3 py-2"><span className="capitalize">{row.consent}</span></td></tr>)}</tbody></table></div></div>}<div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center"><div className="relative flex-1"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar por nome, telefone ou grupo..." className="h-10 rounded-xl pl-10" /></div><div className="flex flex-col gap-2 sm:flex-row"><div className="flex flex-wrap gap-1 rounded-xl border border-border/60 bg-secondary/30 p-1">{[{ value: "all", label: "Todos" }, { value: "consented", label: "Opt-in" }, { value: "pending", label: "Pendentes" }, { value: "revoked", label: "Opt-out" }].map((filter) => <button key={filter.value} type="button" onClick={() => setConsentFilter(filter.value as typeof consentFilter)} className={cn("rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors", consentFilter === filter.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-background hover:text-foreground")}>{filter.label}</button>)}</div><Button variant="outline" className="w-full rounded-xl bg-transparent sm:w-auto"><Filter className="mr-2 h-4 w-4" /> Filtros</Button><Button variant="outline" className="w-full rounded-xl bg-transparent sm:w-auto"><FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar</Button></div></div>{selectedContacts.length > 0 && <div className="mb-4 flex flex-col gap-2 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-sm font-medium">{selectedContacts.length} contato(s) selecionado(s)</span><div className="flex gap-2"><Button size="sm" variant="ghost" className="text-primary" onClick={() => setActiveSection("campaigns")}>Criar campanha <ArrowRight className="ml-2 h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" onClick={() => setSelectedContacts([])}>Limpar</Button></div></div>}<div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-border/60 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground"><th className="w-10 pb-3"><input type="checkbox" checked={selectedContacts.length === filteredContacts.length && filteredContacts.length > 0} onChange={(e) => setSelectedContacts(e.target.checked ? filteredContacts.map((contact) => contact.id) : [])} className="h-4 w-4 accent-[hsl(var(--primary))]" /></th><th className="pb-3">Nome</th><th className="pb-3">Telefone</th><th className="pb-3">Grupo</th><th className="pb-3">Consentimento</th><th className="pb-3">Último envio</th><th className="pb-3"></th></tr></thead><tbody>{filteredContacts.map((contact) => <tr key={contact.id} className="border-b border-border/40 text-sm last:border-0 hover:bg-secondary/30"><td className="py-3"><input type="checkbox" checked={selectedContacts.includes(contact.id)} onChange={() => toggleContact(contact.id)} className="h-4 w-4 accent-[hsl(var(--primary))]" /></td><td className="py-3"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold">{contact.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><div><p className="font-semibold">{contact.name}</p><p className="text-xs text-muted-foreground">Incluído em 12 ago, 2026</p></div></div></td><td className="py-4 font-mono text-xs text-muted-foreground">{contact.phone}</td><td className="py-3"><span className="inline-flex items-center gap-1.5 text-xs"><Tag className="h-3.5 w-3.5 text-primary" /> {contact.group}</span></td><td className="py-3"><StatusBadge status={contact.consent} /></td><td className="py-4 text-xs text-muted-foreground">{contact.lastSend}</td><td className="py-4 text-right"><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></td></tr>)}</tbody></table></div><div className="mt-5 flex flex-col gap-3 border-t border-border/60 pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>Mostrando {filteredContacts.length} de 1.284 contatos</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" className="rounded-lg bg-transparent" disabled>Anterior</Button><span className="rounded-lg bg-primary px-2.5 py-1.5 font-semibold text-primary-foreground">1</span><Button variant="outline" size="sm" className="rounded-lg bg-transparent">2</Button><Button variant="outline" size="sm" className="rounded-lg bg-transparent">Próxima</Button></div></div></CardContent></Card><div className="grid gap-5 md:grid-cols-3"><Card className="glass-card rounded-2xl"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-primary/15 p-2.5 text-primary"><Users className="h-4 w-4" /></div><div><p className="text-2xl font-semibold">1.242</p><p className="text-xs text-muted-foreground">Com consentimento</p></div></div></CardContent></Card><Card className="glass-card rounded-2xl"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-secondary p-2.5"><Tag className="h-4 w-4" /></div><div><p className="text-2xl font-semibold">18</p><p className="text-xs text-muted-foreground">Grupos ativos</p></div></div></CardContent></Card><Card className="glass-card rounded-2xl border-primary/20"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-primary/15 p-2.5 text-primary"><ShieldCheck className="h-4 w-4" /></div><div><p className="text-2xl font-semibold">42</p><p className="text-xs text-muted-foreground">Na lista de supressão</p></div></div></CardContent></Card></div></div>
  );

  return (
    <div className={`relative min-h-[100dvh] overflow-hidden ${theme === "dark" ? "v4-gradient-radial" : "v4-gradient-radial-light"} v4-grid`}>
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_75%_0%,hsl(var(--primary)/0.08),transparent_30%)]" aria-hidden="true" />
      {mobileNavOpen && <button type="button" aria-label="Fechar menu" className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] lg:hidden" onClick={() => setMobileNavOpen(false)} />}
      <aside className={cn("fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(86vw,280px)] flex-col border-r border-border/70 bg-card/95 shadow-2xl shadow-black/10 backdrop-blur-md transition-transform duration-300 lg:z-40 lg:w-56 lg:translate-x-0 xl:w-60", mobileNavOpen ? "translate-x-0" : "-translate-x-full", sidebarOpen ? "lg:w-56 xl:w-60" : "lg:w-16 xl:w-16")}>
        <div className="border-b border-border/60 p-3"><div className={cn("flex items-center", sidebarOpen ? "gap-3" : "justify-center")}><V4Logo className="h-10 shrink-0" />{(sidebarOpen || mobileNavOpen) && <div className="min-w-0"><p className="text-sm font-bold tracking-[0.12em]">V4</p><p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Messaging control</p></div>}</div></div>
        <div className={cn("border-b border-border/60 p-3", sidebarOpen ? "" : "flex justify-center")}>
          {(sidebarOpen || mobileNavOpen) ? <div className="flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 p-2.5"><img src={logoMeta} alt="Meta Distribuidora de Cosméticos" className="h-10 w-10 rounded-xl bg-white object-contain p-1" /><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">Cliente ativo</p><p className="truncate text-xs font-semibold">Meta Distribuidora</p><p className="truncate text-[10px] text-muted-foreground">Cosméticos</p></div></div> : <img src={logoMeta} alt="Meta Distribuidora de Cosméticos" className="h-9 w-9 rounded-xl bg-white object-contain p-1" />}
        </div>
        <nav className="flex-1 space-y-3 overflow-y-auto p-2.5">{navGroups.map((group) => <div key={group.label} className="space-y-1">{(sidebarOpen || mobileNavOpen) && <p className="px-2.5 pt-1 text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">{group.label}</p>}{group.items.map((item) => <button key={item.id} type="button" onClick={() => { setActiveSection(item.id); setMobileNavOpen(false); }} className={cn("group flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-all duration-200", activeSection === item.id ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground hover:bg-secondary hover:text-foreground", !sidebarOpen && !mobileNavOpen && "justify-center px-2")}><item.icon className="h-5 w-5 shrink-0" />{(sidebarOpen || mobileNavOpen) && <span className="min-w-0"><span className="block text-sm font-semibold">{item.label}</span><span className={cn("mt-0.5 block text-[10px]", activeSection === item.id ? "text-primary-foreground/70" : "text-muted-foreground/70")}>{item.description}</span></span>}</button>)}</div>)}</nav>
        <div className="space-y-1 border-t border-border/60 p-2"><button type="button" onClick={() => mobileNavOpen ? setMobileNavOpen(false) : setSidebarOpen(!sidebarOpen)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground", !sidebarOpen && !mobileNavOpen && "justify-center px-2")}><Menu className="h-4 w-4" />{(sidebarOpen || mobileNavOpen) && (mobileNavOpen ? "Fechar menu" : "Recolher menu")}</button><button type="button" onClick={handleSignOut} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive", !sidebarOpen && !mobileNavOpen && "justify-center px-2")}><LogOut className="h-4 w-4" />{(sidebarOpen || mobileNavOpen) && "Sair do sistema"}</button></div>
      </aside>

      <main className={cn("relative z-10 min-h-screen min-w-0 transition-all duration-300", sidebarOpen ? "lg:ml-56 xl:ml-60" : "lg:ml-16")}>
        <header className="sticky top-0 z-30 border-b border-border/70 bg-card/90 shadow-sm backdrop-blur-xl"><div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5 lg:hidden"><Button variant="outline" size="icon" className="h-9 w-9 rounded-xl bg-transparent" aria-label="Abrir menu" onClick={() => setMobileNavOpen(true)}><Menu className="h-4 w-4" /></Button><V4Logo className="h-7" /><ThemeToggle /></div><div className="flex flex-col gap-2.5 px-4 py-3 sm:px-5 lg:px-6"><div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between"><div><div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> {copy.eyebrow}</div><h1 className="max-w-3xl text-xl font-semibold leading-tight tracking-[-0.05em] sm:text-2xl lg:text-3xl">{copy.title}</h1><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{copy.description}</p></div><div className="hidden flex-wrap items-center gap-2 lg:flex"><div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2"><img src={logoMeta} alt="Meta Distribuidora de Cosméticos" className="h-7 w-7 rounded-lg bg-white object-contain p-0.5" /><div className="hidden text-left sm:block"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Conta selecionada</p><p className="text-xs font-semibold">Meta Distribuidora</p><p className="text-[10px] text-primary">{operator?.role === "owner" ? "Proprietário V4" : operator?.role === "admin" ? "Administrador" : operator?.role === "operator" ? "Operador" : operator?.role === "viewer" ? "Leitura" : "Sessão ativa"}</p></div></div><ThemeToggle /><Button variant="outline" size="icon" className="rounded-xl bg-transparent" onClick={() => showDemoToast("Atualizado", "Os dados da operação foram atualizados.")}><RefreshCw className="h-4 w-4" /></Button><Button variant="outline" size="icon" className="rounded-xl bg-transparent"><Bell className="h-4 w-4" /></Button></div></div><div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Sandbox conectado</span><span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-secondary/50 px-2.5 py-1"><LockKeyhole className="h-3 w-3" /> Ambiente protegido</span><span className="ml-auto hidden items-center gap-1.5 md:inline-flex"><Activity className="h-3.5 w-3.5" /> Atualizado agora</span></div></div></header>
        <div className="p-3 sm:p-4 lg:p-5">{activeSection === "overview" && renderOverview()}{activeSection === "campaigns" && renderCampaigns()}{activeSection === "queue" && <QueuePanel />}{activeSection === "templates" && renderTemplates()}{activeSection === "contacts" && renderContacts()}{activeSection === "inbox" && <InboxPanel />}{activeSection === "reports" && <ReportsPanel />}{activeSection === "health" && <AccountHealthPanel />}{activeSection === "api" && renderApi()}{activeSection === "settings" && <SettingsPanel operatorRole={operator?.role || "Sessão ativa"} />}</div>
        <footer className="border-t border-border/60 px-3 py-2 text-center text-[11px] text-muted-foreground sm:px-5 lg:px-7"><span>V4 · Operação de mensagens</span><span className="mx-2 text-border">•</span><span>Dados e consentimentos sob controle</span></footer>
      </main>
    </div>
  );
}
