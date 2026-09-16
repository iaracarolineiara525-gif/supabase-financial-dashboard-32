import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { pinSessionHeaders } from "@/lib/v4PinSession";
import { normalizePhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, ListPlus, Pencil, RefreshCw, Send, Trash2, Upload, UserRoundPlus, Users, XCircle } from "lucide-react";

export type ListSummary = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  total: number;
  valid: number;
  invalid: number;
};

type Member = {
  id: string;
  name: string;
  phone: string;
  valid: boolean;
  addedAt: string;
  source: string;
  lastSentAt: string | null;
};

type ParsedRow = { name: string; phone: string; normalized: ReturnType<typeof normalizePhone> };

const NAME_KEYS = ["nome", "name", "contato", "cliente", "full_name", "razao_social"];
const PHONE_KEYS = ["telefone", "phone", "celular", "whatsapp", "numero", "fone", "contato_telefone"];

function normalizeHeader(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

async function parseFile(file: File): Promise<ParsedRow[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("A planilha não possui abas.");
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const headers = records.length > 0 ? Object.keys(records[0]).map((header) => [normalizeHeader(header), header] as const) : [];
  const nameColumn = headers.find(([key]) => NAME_KEYS.includes(key))?.[1];
  const phoneColumn = headers.find(([key]) => PHONE_KEYS.includes(key))?.[1] || headers.find(([key]) => key.includes("tel") || key.includes("fone") || key.includes("whats"))?.[1];

  if (records.length > 0 && nameColumn && phoneColumn) {
    return records.slice(0, 5000).map((record) => {
      const name = String(record[nameColumn] ?? "").trim();
      const phone = String(record[phoneColumn] ?? "").trim();
      return { name, phone, normalized: normalizePhone(phone) };
    });
  }

  // Planilha sem cabeçalho reconhecido: identifica as colunas pelo conteúdo real.
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }).filter((row) => row.some((cell) => String(cell ?? "").trim()));
  if (rows.length === 0) throw new Error("A planilha está vazia.");
  const columnCount = Math.max(...rows.map((row) => row.length));
  const scores = Array.from({ length: columnCount }, (_, column) => rows.filter((row) => normalizePhone(String(row[column] ?? "")).valid).length);
  const phoneIndex = scores.indexOf(Math.max(...scores));
  if (scores[phoneIndex] === 0) throw new Error("Nenhuma coluna com telefones válidos foi encontrada. Use colunas Nome e Telefone.");
  const nameIndex = Array.from({ length: columnCount }, (_, column) => column).find((column) => column !== phoneIndex && rows.some((row) => /[a-zA-ZÀ-ÿ]{2,}/.test(String(row[column] ?? "")))) ?? -1;

  return rows.slice(0, 5000).map((row) => {
    const phone = String(row[phoneIndex] ?? "").trim();
    const name = nameIndex >= 0 ? String(row[nameIndex] ?? "").trim() : "";
    return { name, phone, normalized: normalizePhone(phone) };
  }).filter((row) => row.phone);
}


export function ListsPanel({ onUseList }: { onUseList?: (listName: string) => void }) {
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMembersLoading, setIsMembersLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [preview, setPreview] = useState<{ fileName: string; rows: ParsedRow[] } | null>(null);
  const [editing, setEditing] = useState<Member | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "" });
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  const loadLists = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    const { data, error } = await supabase.functions.invoke("message-lists", { body: { action: "overview" }, headers: pinSessionHeaders() });
    if (!silent) setIsLoading(false);
    if (error || !data?.ok) {
      if (!silent) toast({ title: "Listas não carregadas", description: data?.error || error?.message || "Tente novamente.", variant: "destructive" });
      return;
    }
    setLists(Array.isArray(data.lists) ? data.lists : []);
  }, [toast]);

  const loadMembers = useCallback(async (listName: string) => {
    setSelected(listName);
    setIsMembersLoading(true);
    const { data, error } = await supabase.functions.invoke("message-lists", { body: { action: "members", listName }, headers: pinSessionHeaders() });
    setIsMembersLoading(false);
    if (error || !data?.ok) {
      toast({ title: "Contatos não carregados", description: data?.error || error?.message || "Tente novamente.", variant: "destructive" });
      return;
    }
    setMembers(Array.isArray(data.members) ? data.members : []);
  }, [toast]);

  useEffect(() => { void loadLists(); }, [loadLists]);

  const previewStats = useMemo(() => {
    if (!preview) return null;
    const valid = preview.rows.filter((row) => row.normalized.valid);
    const unique = new Set(valid.map((row) => row.normalized.digits));
    return { total: preview.rows.length, valid: unique.size, invalid: preview.rows.length - valid.length, duplicates: valid.length - unique.size };
  }, [preview]);

  const handleCreateList = async () => {
    const name = newListName.trim();
    if (name.length < 2) {
      toast({ title: "Informe o nome da lista", description: "Use pelo menos 2 caracteres.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    const { data, error } = await supabase.functions.invoke("message-lists", { body: { action: "create", name }, headers: pinSessionHeaders() });
    setIsSaving(false);
    if (error || !data?.ok) {
      toast({ title: "Lista não criada", description: data?.error || error?.message || "Tente novamente.", variant: "destructive" });
      return;
    }
    setNewListName("");
    toast({ title: data.duplicate ? "Lista já existia" : "Lista criada", description: `Lista "${name}" pronta para receber contatos.` });
    await loadLists(true);
    void loadMembers(name);
  };

  const handleFile = async (file: File) => {
    try {
      const rows = await parseFile(file);
      setPreview({ fileName: file.name, rows });
    } catch (error) {
      toast({ title: "Arquivo não lido", description: error instanceof Error ? error.message : "Use XLSX ou CSV com Nome e Telefone.", variant: "destructive" });
    }
  };

  const handleUpload = async () => {
    if (!preview || !selected) return;
    setIsSaving(true);
    const { data, error } = await supabase.functions.invoke("message-lists", {
      body: { action: "add", listName: selected, source: "upload", rows: preview.rows.map((row) => ({ name: row.name, phone: row.phone })) },
      headers: pinSessionHeaders(),
    });
    setIsSaving(false);
    if (error || !data?.ok) {
      toast({ title: "Importação não concluída", description: data?.error || error?.message || "Tente novamente.", variant: "destructive" });
      return;
    }
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
    toast({ title: "Lista atualizada", description: `${data.valid} válidos · ${data.created} novos · ${data.invalid} inválidos ignorados.` });
    await loadLists(true);
    await loadMembers(selected);
  };

  const handleAddContact = async () => {
    if (!selected) {
      toast({ title: "Selecione uma lista", description: "Escolha ou crie a lista de destino.", variant: "destructive" });
      return;
    }
    const normalized = normalizePhone(contactPhone);
    if (!normalized.valid) {
      toast({ title: "Telefone inválido", description: normalized.reason || "Revise o número informado.", variant: "destructive" });
      return;
    }
    if (contactName.trim().length < 2) {
      toast({ title: "Informe o nome real", description: "O nome do contato é usado nas mensagens e nos relatórios.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    const { data, error } = await supabase.functions.invoke("message-lists", {
      body: { action: "add", listName: selected, source: "manual", rows: [{ name: contactName.trim(), phone: contactPhone }] },
      headers: pinSessionHeaders(),
    });
    setIsSaving(false);
    if (error || !data?.ok) {
      toast({ title: "Contato não adicionado", description: data?.error || error?.message || "Tente novamente.", variant: "destructive" });
      return;
    }
    setContactName("");
    setContactPhone("");
    toast({ title: "Contato adicionado", description: `${normalized.e164} vinculado à lista ${selected}.` });
    await loadLists(true);
    await loadMembers(selected);
  };

  const handleDeleteList = async (deleteContacts: boolean) => {
    if (!selected) return;
    const question = deleteContacts
      ? `Apagar a lista "${selected}" e excluir definitivamente os contatos que só pertencem a ela?`
      : `Apagar a lista "${selected}"? Os contatos continuam cadastrados em outras listas.`;
    if (!window.confirm(question)) return;
    setIsSaving(true);
    const { data, error } = await supabase.functions.invoke("message-lists", { body: { action: "deleteList", listName: selected, deleteContacts }, headers: pinSessionHeaders() });
    setIsSaving(false);
    if (error || !data?.ok) {
      toast({ title: "Lista não apagada", description: data?.error || error?.message || "Tente novamente.", variant: "destructive" });
      return;
    }
    toast({ title: "Lista apagada", description: `"${selected}" foi removida.` });
    setSelected(null);
    setMembers([]);
    await loadLists(true);
  };

  const handleRemoveContact = async (member: Member, deleteContact: boolean) => {
    if (!selected) return;
    const question = deleteContact
      ? `Excluir definitivamente o contato ${member.name}?`
      : `Remover ${member.name} da lista "${selected}"?`;
    if (!window.confirm(question)) return;
    const { data, error } = await supabase.functions.invoke("message-lists", { body: { action: "removeContact", contactId: member.id, listName: selected, deleteContact }, headers: pinSessionHeaders() });
    if (error || !data?.ok) {
      toast({ title: "Contato não removido", description: data?.error || error?.message || "Tente novamente.", variant: "destructive" });
      return;
    }
    toast({ title: deleteContact ? "Contato excluído" : "Contato removido da lista" });
    await loadLists(true);
    await loadMembers(selected);
  };

  const handleSaveEdit = async () => {
    if (!editing || !selected) return;
    if (editForm.name.trim().length < 2) {
      toast({ title: "Informe o nome real", description: "Use pelo menos 2 caracteres.", variant: "destructive" });
      return;
    }
    if (editForm.phone.trim() && !normalizePhone(editForm.phone).valid) {
      toast({ title: "Telefone inválido", description: normalizePhone(editForm.phone).reason || "Revise o número.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    const { data, error } = await supabase.functions.invoke("message-lists", {
      body: { action: "updateContact", contactId: editing.id, name: editForm.name.trim(), phone: editForm.phone.trim() || undefined },
      headers: pinSessionHeaders(),
    });
    setIsSaving(false);
    if (error || !data?.ok) {
      toast({ title: "Contato não atualizado", description: data?.error || error?.message || "Tente novamente.", variant: "destructive" });
      return;
    }
    setEditing(null);
    toast({ title: "Contato atualizado" });
    await loadMembers(selected);
  };

  const selectedList = lists.find((list) => list.name === selected) || null;

  return (
    <div className="space-y-3">
      <Card className="glass-card rounded-[1.25rem]">
        <CardHeader className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <CardDescription className="text-[10px] font-semibold uppercase tracking-[0.18em]">Base de relacionamento</CardDescription>
            <CardTitle className="mt-1 text-xl tracking-[-0.04em]">Listas</CardTitle>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Suba uma planilha com Nome e Telefone ou cadastre um contato. O sistema padroniza os números, marca os inválidos e evita duplicados automaticamente.</p>
          </div>
          <Button variant="outline" className="rounded-xl bg-transparent" onClick={() => void loadLists()} disabled={isLoading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} /> Atualizar
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-3">
            <div className="rounded-xl border border-border/60 bg-secondary/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Nova lista</p>
              <div className="mt-2 flex gap-2">
                <Input value={newListName} onChange={(event) => setNewListName(event.target.value)} placeholder="Ex.: Clientes agosto" className="h-10 rounded-lg" />
                <Button className="rounded-lg" onClick={() => void handleCreateList()} disabled={isSaving}><ListPlus className="mr-2 h-4 w-4" /> Criar</Button>
              </div>
            </div>

            <div className="space-y-1.5">
              {lists.length === 0 && !isLoading && <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Nenhuma lista criada ainda.</p>}
              {lists.map((list) => (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => void loadMembers(list.name)}
                  className={cn("w-full rounded-xl border p-3 text-left transition-colors", selected === list.name ? "border-primary/40 bg-primary/10" : "border-border/60 hover:bg-secondary/40")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{list.name}</p>
                    <Badge variant="outline" className="shrink-0 rounded-full text-[10px]">{list.total} contatos</Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1 text-primary"><CheckCircle2 className="h-3 w-3" /> {list.valid} válidos</span>
                    <span className="inline-flex items-center gap-1"><XCircle className="h-3 w-3" /> {list.invalid} inválidos</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {!selected ? (
              <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-xl border border-dashed border-border p-6 text-center">
                <Users className="mb-3 h-6 w-6 text-primary" />
                <p className="text-sm font-semibold">Selecione uma lista</p>
                <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">Escolha uma lista à esquerda para subir uma planilha, adicionar um contato ou iniciar um disparo.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-secondary/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold">{selected}</p>
                    <p className="text-[11px] text-muted-foreground">{selectedList?.total || 0} contatos · {selectedList?.valid || 0} válidos · {selectedList?.invalid || 0} inválidos</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button className="rounded-lg" onClick={() => onUseList?.(selected)}><Send className="mr-2 h-4 w-4" /> Usar no disparo</Button>
                    <Button variant="outline" className="rounded-lg bg-transparent" onClick={() => void handleDeleteList(false)} disabled={isSaving}><Trash2 className="mr-2 h-4 w-4" /> Apagar lista</Button>
                    <Button variant="outline" className="rounded-lg bg-transparent text-destructive hover:text-destructive" onClick={() => void handleDeleteList(true)} disabled={isSaving}><Trash2 className="mr-2 h-4 w-4" /> Apagar lista + contatos</Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2 rounded-xl border border-border/60 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Subir lista (Nome + Telefone)</p>
                    <label className="inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-lg border border-border bg-secondary/40 px-3 text-sm font-medium transition-colors hover:border-primary/40">
                      <Upload className="mr-2 h-4 w-4 text-primary" /> Escolher arquivo XLSX/CSV
                      <input ref={fileRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFile(file); }} />
                    </label>
                    {preview && previewStats && (
                      <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                        <p className="text-xs font-semibold">{preview.fileName}</p>
                        <p className="text-[11px] text-muted-foreground">{previewStats.total} linhas · {previewStats.valid} válidos · {previewStats.invalid} inválidos · {previewStats.duplicates} duplicados</p>
                        <div className="flex gap-2">
                          <Button size="sm" className="rounded-lg" onClick={() => void handleUpload()} disabled={isSaving || previewStats.valid === 0}>{isSaving ? "Importando..." : `Importar ${previewStats.valid}`}</Button>
                          <Button size="sm" variant="outline" className="rounded-lg bg-transparent" onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = ""; }}>Cancelar</Button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 rounded-xl border border-border/60 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Adicionar contato individual</p>
                    <Input value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="Nome" className="h-10 rounded-lg" />
                    <Input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} placeholder="(44) 99999-9999" className="h-10 rounded-lg" />
                    {contactPhone && <p className={cn("text-[11px]", normalizePhone(contactPhone).valid ? "text-primary" : "text-destructive")}>{normalizePhone(contactPhone).valid ? `Padronizado: ${normalizePhone(contactPhone).e164}` : normalizePhone(contactPhone).reason}</p>}
                    <Button className="w-full rounded-lg" onClick={() => void handleAddContact()} disabled={isSaving}><UserRoundPlus className="mr-2 h-4 w-4" /> Adicionar à lista</Button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-border/60">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead className="bg-secondary/40 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      <tr><th className="px-3 py-3">Nome</th><th className="px-3 py-3">Telefone</th><th className="px-3 py-3">Situação</th><th className="px-3 py-3">Origem</th><th className="px-3 py-3">Último envio</th><th className="px-3 py-3 text-right">Ações</th></tr>
                    </thead>
                    <tbody>
                      {members.map((member) => (
                        <tr key={member.id} className="border-t border-border/50">
                          <td className="px-3 py-3 font-medium">{member.name}</td>
                          <td className="px-3 py-3 font-mono text-muted-foreground">{member.phone}</td>
                          <td className="px-3 py-3">{member.valid ? <Badge variant="outline" className="rounded-full border-primary/25 bg-primary/10 text-[10px] text-primary">Válido</Badge> : <Badge variant="outline" className="rounded-full border-destructive/25 bg-destructive/10 text-[10px] text-destructive">Inválido</Badge>}</td>
                          <td className="px-3 py-3 text-muted-foreground">{member.source}</td>
                          <td className="px-3 py-3 text-muted-foreground">{member.lastSentAt ? new Date(member.lastSentAt).toLocaleString("pt-BR") : "—"}</td>
                          <td className="px-3 py-3">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" title="Editar contato" onClick={() => { setEditing(member); setEditForm({ name: member.name, phone: "" }); }}><Pencil className="h-3.5 w-3.5" /></Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" title="Remover da lista" onClick={() => void handleRemoveContact(member, false)}><XCircle className="h-3.5 w-3.5" /></Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-destructive hover:text-destructive" title="Excluir contato" onClick={() => void handleRemoveContact(member, true)}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {members.length === 0 && <tr className="border-t border-border/50"><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">{isMembersLoading ? "Carregando contatos..." : "Nenhum contato nesta lista."}</td></tr>}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar contato</DialogTitle>
            <DialogDescription>Atualize o nome real e, se precisar, o telefone. A alteração vale para todas as listas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={editForm.name} onChange={(event) => setEditForm((state) => ({ ...state, name: event.target.value }))} placeholder="Nome real" className="h-10 rounded-lg" />
            <Input value={editForm.phone} onChange={(event) => setEditForm((state) => ({ ...state, phone: event.target.value }))} placeholder={`Telefone atual: ${editing?.phone ?? ""}`} className="h-10 rounded-lg" />
            {editForm.phone && <p className={cn("text-[11px]", normalizePhone(editForm.phone).valid ? "text-primary" : "text-destructive")}>{normalizePhone(editForm.phone).valid ? `Padronizado: ${normalizePhone(editForm.phone).e164}` : normalizePhone(editForm.phone).reason}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-lg bg-transparent" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button className="rounded-lg" onClick={() => void handleSaveEdit()} disabled={isSaving}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
