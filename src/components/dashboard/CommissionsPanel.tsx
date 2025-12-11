import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEmployees, useCommissions, useCreateCommission, useUpdateCommissionStatus } from "@/hooks/useEmployeeData";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { Percent, Plus, CheckCircle2, Clock, Calendar } from "lucide-react";
import { toast } from "sonner";
import { DateFilters } from "./DateFilters";

export const CommissionsPanel = () => {
  const [filters, setFilters] = useState<{ year?: number; month?: number; day?: number }>({});
  const { data: employees } = useEmployees();
  const { data: commissions, isLoading } = useCommissions(filters);
  const createCommission = useCreateCommission();
  const updateStatus = useUpdateCommissionStatus();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newCommission, setNewCommission] = useState({
    employee_id: "",
    amount: 0,
    percentage: 0,
    commission_date: new Date().toISOString().split('T')[0],
    status: "pending",
    description: ""
  });

  const handleCreate = async () => {
    if (!newCommission.employee_id || !newCommission.amount) {
      toast.error("Selecione um funcionário e informe o valor");
      return;
    }
    try {
      await createCommission.mutateAsync({
        employee_id: newCommission.employee_id,
        amount: newCommission.amount,
        percentage: newCommission.percentage || null,
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
        amount: 0,
        percentage: 0,
        commission_date: new Date().toISOString().split('T')[0],
        status: "pending",
        description: ""
      });
    } catch {
      toast.error("Erro ao registrar comissão");
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

  const totalPending = commissions?.filter(c => c.status === "pending").reduce((sum, c) => sum + Number(c.amount), 0) || 0;
  const totalPaid = commissions?.filter(c => c.status === "paid").reduce((sum, c) => sum + Number(c.amount), 0) || 0;

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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Percent className="h-5 w-5 text-primary" />
              Controle de Comissões
            </CardTitle>
            <CardDescription>Comissões dos funcionários</CardDescription>
          </div>
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
                  <Label>Funcionário *</Label>
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
                    <Input type="number" value={newCommission.amount} onChange={(e) => setNewCommission({ ...newCommission, amount: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Percentual (%)</Label>
                    <Input type="number" value={newCommission.percentage} onChange={(e) => setNewCommission({ ...newCommission, percentage: Number(e.target.value) })} />
                  </div>
                </div>
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
            {commissions?.map((commission) => (
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
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant={commission.status === "paid" ? "ghost" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => handleToggleStatus(commission.id, commission.status)}
                  >
                    {commission.status === "paid" ? "Desfazer" : "Marcar como Paga"}
                  </Button>
                </div>
              </div>
            ))}
            {commissions?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma comissão no período</p>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};