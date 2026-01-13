import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEmployees, useCommissions, useCreateCommission, useUpdateCommissionStatus, useUpdateCommission, useDeleteCommission } from "@/hooks/useEmployeeData";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { Percent, Plus, CheckCircle2, Clock, Calendar, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DateFilters } from "./DateFilters";
import { SearchInput } from "./SearchInput";

export const CommissionsPanel = () => {
  const [filters, setFilters] = useState<{ year?: number; month?: number; day?: number }>({});
  const { data: employees } = useEmployees();
  const { data: commissions, isLoading } = useCommissions(filters);
  const createCommission = useCreateCommission();
  const updateStatus = useUpdateCommissionStatus();
  const updateCommission = useUpdateCommission();
  const deleteCommission = useDeleteCommission();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCommission, setEditingCommission] = useState<{
    id: string;
    employee_id: string;
    amount: string;
    percentage: string;
    commission_date: string;
    status: string;
    description: string;
  } | null>(null);
  
  const [newCommission, setNewCommission] = useState({
    employee_id: "",
    amount: "",
    percentage: "",
    commission_date: new Date().toISOString().split('T')[0],
    status: "pending",
    description: ""
  });
  const [searchTerm, setSearchTerm] = useState("");

  // Filter commissions by search term
  const filteredCommissions = useMemo(() => {
    if (!commissions || !searchTerm.trim()) return commissions;
    const term = searchTerm.toLowerCase();
    return commissions.filter((c) =>
      c.employee?.name?.toLowerCase().includes(term) ||
      c.description?.toLowerCase().includes(term)
    );
  }, [commissions, searchTerm]);

  // Calculate final value based on percentage
  const calculatedValue = useMemo(() => {
    const amount = parseFloat(newCommission.amount) || 0;
    const percentage = parseFloat(newCommission.percentage) || 0;
    if (amount > 0 && percentage > 0) {
      return (amount * percentage) / 100;
    }
    return 0;
  }, [newCommission.amount, newCommission.percentage]);

  const editCalculatedValue = useMemo(() => {
    if (!editingCommission) return 0;
    const amount = parseFloat(editingCommission.amount) || 0;
    const percentage = parseFloat(editingCommission.percentage) || 0;
    if (amount > 0 && percentage > 0) {
      return (amount * percentage) / 100;
    }
    return 0;
  }, [editingCommission?.amount, editingCommission?.percentage]);

  const handleCreate = async () => {
    const baseAmount = parseFloat(newCommission.amount);
    const percentage = parseFloat(newCommission.percentage) || 0;
    if (!newCommission.employee_id || !baseAmount) {
      toast.error("Selecione um colaborador e informe o valor");
      return;
    }
    // Use calculated value if percentage is set, otherwise use base amount
    const finalAmount = percentage > 0 ? (baseAmount * percentage) / 100 : baseAmount;
    try {
      await createCommission.mutateAsync({
        employee_id: newCommission.employee_id,
        amount: finalAmount,
        percentage: percentage || null,
        commission_date: newCommission.commission_date,
        status: newCommission.status,
        paid_date: newCommission.status === "paid" ? newCommission.commission_date : null,
        description: newCommission.description || null,
        installment_id: null
      });
      toast.success("Comissão registrada!");
      setDialogOpen(false);
      setNewCommission({
        employee_id: "",
        amount: "",
        percentage: "",
        commission_date: new Date().toISOString().split('T')[0],
        status: "pending",
        description: ""
      });
    } catch {
      toast.error("Erro ao registrar comissão");
    }
  };

  const handleEdit = (commission: typeof commissions extends (infer T)[] | undefined ? T : never) => {
    if (!commission) return;
    setEditingCommission({
      id: commission.id,
      employee_id: commission.employee_id,
      amount: String(commission.amount),
      percentage: commission.percentage ? String(commission.percentage) : "",
      commission_date: commission.commission_date,
      status: commission.status,
      description: commission.description || ""
    });
    setEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingCommission) return;
    const baseAmount = parseFloat(editingCommission.amount);
    const percentage = parseFloat(editingCommission.percentage) || 0;
    if (!baseAmount) {
      toast.error("Informe o valor");
      return;
    }
    // Use calculated value if percentage is set, otherwise use base amount
    const finalAmount = percentage > 0 ? (baseAmount * percentage) / 100 : baseAmount;
    try {
      await updateCommission.mutateAsync({
        id: editingCommission.id,
        employee_id: editingCommission.employee_id,
        amount: finalAmount,
        percentage: percentage || null,
        commission_date: editingCommission.commission_date,
        status: editingCommission.status,
        paid_date: editingCommission.status === "paid" ? editingCommission.commission_date : null,
        description: editingCommission.description || null
      });
      toast.success("Comissão atualizada!");
      setEditDialogOpen(false);
      setEditingCommission(null);
    } catch {
      toast.error("Erro ao atualizar comissão");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCommission.mutateAsync(id);
      toast.success("Comissão excluída!");
    } catch {
      toast.error("Erro ao excluir comissão");
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "paid" ? "pending" : "paid";
    const paid_date = newStatus === "paid" ? new Date().toISOString().split('T')[0] : undefined;
    try {
      await updateStatus.mutateAsync({ id, status: newStatus, paid_date });
      toast.success(newStatus === "paid" ? "Comissão marcada como paga!" : "Comissão desmarcada");
    } catch {
      toast.error("Erro ao atualizar status");
    }
  };

  const totalPending = filteredCommissions?.filter(c => c.status === "pending").reduce((sum, c) => sum + Number(c.amount), 0) || 0;
  const totalPaid = filteredCommissions?.filter(c => c.status === "paid").reduce((sum, c) => sum + Number(c.amount), 0) || 0;

  if (isLoading) {
    return (
      <Card className="h-full glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Percent className="h-5 w-5 text-primary" />
            Controle de Comissões
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-secondary/50 rounded-lg" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col glass-card">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Percent className="h-5 w-5 text-primary" />
              Controle de Comissões
            </CardTitle>
            <CardDescription>Comissões dos colaboradores</CardDescription>
          </div>
          <div className="w-full sm:w-64">
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Pesquisar comissão..."
            />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Comissão
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-card border-border/50">
              <DialogHeader>
                <DialogTitle>Registrar Comissão</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Colaborador *</Label>
                  <Select value={newCommission.employee_id} onValueChange={(v) => setNewCommission({ ...newCommission, employee_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees?.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Valor *</Label>
                    <Input 
                      type="text" 
                      inputMode="decimal"
                      value={newCommission.amount} 
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9.,]/g, '');
                        setNewCommission({ ...newCommission, amount: val });
                      }} 
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <Label>Percentual (%)</Label>
                    <Input 
                      type="text" 
                      inputMode="decimal"
                      value={newCommission.percentage} 
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9.,]/g, '');
                        setNewCommission({ ...newCommission, percentage: val });
                      }} 
                      placeholder="0"
                    />
                  </div>
                </div>
                {calculatedValue > 0 && (
                  <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                    <p className="text-xs text-muted-foreground">Valor da Comissão (calculado)</p>
                    <p className="text-lg font-bold text-primary">{formatCurrency(calculatedValue)}</p>
                  </div>
                )}
                <div>
                  <Label>Data da Comissão</Label>
                  <Input type="date" value={newCommission.commission_date} onChange={(e) => setNewCommission({ ...newCommission, commission_date: e.target.value })} />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={newCommission.status} onValueChange={(v) => setNewCommission({ ...newCommission, status: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="paid">Paga</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Input value={newCommission.description} onChange={(e) => setNewCommission({ ...newCommission, description: e.target.value })} placeholder="Observação" />
                </div>
                <Button onClick={handleCreate} className="w-full">Registrar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        <DateFilters filters={filters} onFiltersChange={setFilters} />

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-warning/10 rounded-lg border border-warning/20">
            <p className="text-xs text-muted-foreground">Pendentes</p>
            <p className="text-lg font-bold text-warning">{formatCurrency(totalPending)}</p>
          </div>
          <div className="p-3 bg-success/10 rounded-lg border border-success/20">
            <p className="text-xs text-muted-foreground">Pagas</p>
            <p className="text-lg font-bold text-success">{formatCurrency(totalPaid)}</p>
          </div>
        </div>

        <ScrollArea className="h-[350px]">
          <div className="space-y-2">
            {filteredCommissions?.map((commission) => (
              <div key={commission.id} className={`p-3 rounded-lg border ${commission.status === "paid" ? "bg-success/5 border-success/20" : "bg-warning/5 border-warning/20"}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-sm">{commission.employee?.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(commission.commission_date)}
                      {commission.percentage && ` • ${commission.percentage}%`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">{formatCurrency(commission.amount)}</p>
                    <Badge variant={commission.status === "paid" ? "default" : "secondary"} className="text-xs">
                      {commission.status === "paid" ? (
                        <><CheckCircle2 className="h-3 w-3 mr-1" />Paga</>
                      ) : (
                        <><Clock className="h-3 w-3 mr-1" />Pendente</>
                      )}
                    </Badge>
                  </div>
                </div>
                {commission.description && (
                  <p className="text-xs text-muted-foreground mt-1">{commission.description}</p>
                )}
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant={commission.status === "paid" ? "ghost" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => handleToggleStatus(commission.id, commission.status)}
                  >
                    {commission.status === "paid" ? "Desfazer" : "Marcar como Paga"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => handleEdit(commission)}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                    onClick={() => handleDelete(commission.id)}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Excluir
                  </Button>
                </div>
              </div>
            ))}
            {filteredCommissions?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma comissão no período</p>
            )}
          </div>
        </ScrollArea>
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="glass-card border-border/50">
          <DialogHeader>
            <DialogTitle>Editar Comissão</DialogTitle>
          </DialogHeader>
          {editingCommission && (
            <div className="space-y-4">
              <div>
                <Label>Colaborador *</Label>
                <Select value={editingCommission.employee_id} onValueChange={(v) => setEditingCommission({ ...editingCommission, employee_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees?.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Valor *</Label>
                  <Input 
                    type="text" 
                    inputMode="decimal"
                    value={editingCommission.amount} 
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.,]/g, '');
                      setEditingCommission({ ...editingCommission, amount: val });
                    }} 
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <Label>Percentual (%)</Label>
                  <Input 
                    type="text" 
                    inputMode="decimal"
                    value={editingCommission.percentage} 
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.,]/g, '');
                      setEditingCommission({ ...editingCommission, percentage: val });
                    }} 
                    placeholder="0"
                  />
                </div>
              </div>
              {editCalculatedValue > 0 && (
                <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                  <p className="text-xs text-muted-foreground">Valor da Comissão (calculado)</p>
                  <p className="text-lg font-bold text-primary">{formatCurrency(editCalculatedValue)}</p>
                </div>
              )}
              <div>
                <Label>Data da Comissão</Label>
                <Input type="date" value={editingCommission.commission_date} onChange={(e) => setEditingCommission({ ...editingCommission, commission_date: e.target.value })} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editingCommission.status} onValueChange={(v) => setEditingCommission({ ...editingCommission, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="paid">Paga</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Descrição</Label>
                <Input value={editingCommission.description} onChange={(e) => setEditingCommission({ ...editingCommission, description: e.target.value })} placeholder="Observação" />
              </div>
              <Button onClick={handleUpdate} className="w-full">Salvar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};