import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEmployees, useEmployeePayments, useCreateEmployee, useCreateEmployeePayment, useDeleteEmployee, useUpdateEmployee, useUpdateEmployeePayment, useDeleteEmployeePayment } from "@/hooks/useEmployeeData";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { Users, Plus, DollarSign, Calendar, Trash2, Pencil, CheckCircle2, Clock, TrendingUp, Upload, FileText } from "lucide-react";
import { toast } from "sonner";
import { DateFilters } from "./DateFilters";
import { EmployeePaymentHistoryDialog } from "./EmployeePaymentHistoryDialog";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";

export const EmployeePaymentsPanel = () => {
  const [filters, setFilters] = useState<{ year?: number; month?: number; day?: number }>({});
  const { data: employees, isLoading: loadingEmployees } = useEmployees();
  const { data: payments, isLoading: loadingPayments } = useEmployeePayments(filters);
  const createEmployee = useCreateEmployee();
  const createPayment = useCreateEmployeePayment();
  const deleteEmployee = useDeleteEmployee();
  const updateEmployee = useUpdateEmployee();
  const updatePayment = useUpdateEmployeePayment();
  const deletePayment = useDeleteEmployeePayment();

  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [editEmployeeDialogOpen, setEditEmployeeDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<{ id: string; name: string; role: string; salary: number } | null>(null);
  const [newEmployee, setNewEmployee] = useState({ name: "", role: "", email: null as string | null, phone: null as string | null, salary: 0, hire_date: new Date().toISOString().split('T')[0], active: true });
  const [newPayment, setNewPayment] = useState({ employee_id: "", amount: 0, payment_date: new Date().toISOString().split('T')[0], payment_type: "salary", description: "", installments: 1, receiptFile: null as File | null });
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const handleCreateEmployee = async () => {
    if (!newEmployee.name) {
      toast.error("Nome do funcionário é obrigatório");
      return;
    }
    try {
      await createEmployee.mutateAsync(newEmployee);
      toast.success("Funcionário cadastrado!");
      setEmployeeDialogOpen(false);
      setNewEmployee({ name: "", role: "", email: null, phone: null, salary: 0, hire_date: new Date().toISOString().split('T')[0], active: true });
    } catch {
      toast.error("Erro ao cadastrar funcionário");
    }
  };

  const handleCreatePayment = async () => {
    if (!newPayment.employee_id || !newPayment.amount) {
      toast.error("Selecione um colaborador e informe o valor");
      return;
    }
    try {
      setUploadingReceipt(true);
      const baseDate = new Date(newPayment.payment_date);
      const numInstallments = newPayment.installments || 1;
      
      // Upload receipt if provided
      let receiptUrl: string | null = null;
      if (newPayment.receiptFile) {
        const fileExt = newPayment.receiptFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('payment-receipts')
          .upload(fileName, newPayment.receiptFile);
        
        if (uploadError) {
          console.error("Error uploading receipt:", uploadError);
          toast.error("Erro ao fazer upload do extrato");
        } else {
          const { data: urlData } = supabase.storage
            .from('payment-receipts')
            .getPublicUrl(fileName);
          receiptUrl = urlData.publicUrl;
        }
      }
      
      for (let i = 0; i < numInstallments; i++) {
        const paymentDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, baseDate.getDate());
        await createPayment.mutateAsync({
          employee_id: newPayment.employee_id,
          amount: newPayment.amount,
          payment_date: paymentDate.toISOString().split('T')[0],
          payment_type: newPayment.payment_type,
          description: numInstallments > 1 ? `${newPayment.description || ''} (${i + 1}/${numInstallments})`.trim() : (newPayment.description || null),
          receipt_url: i === 0 ? receiptUrl : null // Only first payment gets the receipt
        });
      }
      toast.success(numInstallments > 1 ? `${numInstallments} pagamentos registrados!` : "Pagamento registrado!");
      setPaymentDialogOpen(false);
      setNewPayment({ employee_id: "", amount: 0, payment_date: new Date().toISOString().split('T')[0], payment_type: "salary", description: "", installments: 1, receiptFile: null });
    } catch {
      toast.error("Erro ao registrar pagamento");
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    try {
      await deleteEmployee.mutateAsync(id);
      toast.success("Colaborador excluído!");
    } catch {
      toast.error("Erro ao excluir colaborador");
    }
  };

  const handleEditEmployee = (emp: { id: string; name: string; role: string | null; salary: number }) => {
    setEditingEmployee({ id: emp.id, name: emp.name, role: emp.role || "", salary: emp.salary });
    setEditEmployeeDialogOpen(true);
  };

  const handleUpdateEmployee = async () => {
    if (!editingEmployee) return;
    try {
      await updateEmployee.mutateAsync(editingEmployee);
      toast.success("Colaborador atualizado!");
      setEditEmployeeDialogOpen(false);
      setEditingEmployee(null);
    } catch {
      toast.error("Erro ao atualizar colaborador");
    }
  };

  const totalPaid = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

  // Group payments by month
  const paymentsByMonth = useMemo(() => {
    if (!payments) return [];
    const grouped: Record<string, typeof payments> = {};
    
    payments.forEach(payment => {
      const monthKey = format(parseISO(payment.payment_date), "MMMM 'de' yyyy", { locale: ptBR });
      if (!grouped[monthKey]) {
        grouped[monthKey] = [];
      }
      grouped[monthKey].push(payment);
    });

    return Object.entries(grouped).sort(([, a], [, b]) => {
      const dateA = a[0]?.payment_date || "";
      const dateB = b[0]?.payment_date || "";
      return dateB.localeCompare(dateA);
    });
  }, [payments]);

  const getDayOfWeek = (dateStr: string) => {
    return format(parseISO(dateStr), "EEEE", { locale: ptBR });
  };

  const isLoading = loadingEmployees || loadingPayments;

  if (isLoading) {
    return (
      <Card className="h-full glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Users className="h-5 w-5 text-primary" />
            Pagamentos de Funcionários
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
              <Users className="h-5 w-5 text-primary" />
              Pagamentos de Funcionários
            </CardTitle>
            <CardDescription>Controle de pagamentos</CardDescription>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="border-border/50" onClick={() => setHistoryDialogOpen(true)}>
              <TrendingUp className="h-4 w-4 mr-1" />
              Histórico
            </Button>
            <Dialog open={employeeDialogOpen} onOpenChange={setEmployeeDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="border-border/50">
                  <Plus className="h-4 w-4 mr-1" />
                  Funcionário
                </Button>
              </DialogTrigger>
              <DialogContent className="glass-card border-border/50">
                <DialogHeader>
                  <DialogTitle>Cadastrar Funcionário</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Nome *</Label>
                    <Input value={newEmployee.name} onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })} placeholder="Nome completo" />
                  </div>
                  <div>
                    <Label>Cargo</Label>
                    <Input value={newEmployee.role} onChange={(e) => setNewEmployee({ ...newEmployee, role: e.target.value })} placeholder="Ex: Vendedor" />
                  </div>
                  <div>
                    <Label>Salário Base</Label>
                    <Input type="number" value={newEmployee.salary} onChange={(e) => setNewEmployee({ ...newEmployee, salary: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Data de Contratação</Label>
                    <Input type="date" value={newEmployee.hire_date} onChange={(e) => setNewEmployee({ ...newEmployee, hire_date: e.target.value })} />
                  </div>
                  <Button onClick={handleCreateEmployee} className="w-full">Cadastrar</Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <DollarSign className="h-4 w-4 mr-1" />
                  Pagamento
                </Button>
              </DialogTrigger>
              <DialogContent className="glass-card border-border/50">
                <DialogHeader>
                  <DialogTitle>Registrar Pagamento</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Funcionário *</Label>
                    <Select value={newPayment.employee_id} onValueChange={(v) => setNewPayment({ ...newPayment, employee_id: v })}>
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
                  <div>
                    <Label>Tipo</Label>
                    <Select value={newPayment.payment_type} onValueChange={(v) => setNewPayment({ ...newPayment, payment_type: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="salary">Salário</SelectItem>
                        <SelectItem value="bonus">Bônus</SelectItem>
                        <SelectItem value="advance">Adiantamento</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Valor *</Label>
                    <Input type="number" value={newPayment.amount} onChange={(e) => setNewPayment({ ...newPayment, amount: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Data do Pagamento</Label>
                    <Input type="date" value={newPayment.payment_date} onChange={(e) => setNewPayment({ ...newPayment, payment_date: e.target.value })} />
                  </div>
                  <div>
                    <Label>Descrição</Label>
                    <Input value={newPayment.description} onChange={(e) => setNewPayment({ ...newPayment, description: e.target.value })} placeholder="Observação" />
                  </div>
                  <div>
                    <Label>Extrato/Comprovante</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => setNewPayment({ ...newPayment, receiptFile: e.target.files?.[0] || null })}
                        className="text-sm"
                      />
                      {newPayment.receiptFile && (
                        <Badge variant="secondary" className="text-xs">
                          <FileText className="h-3 w-3 mr-1" />
                          {newPayment.receiptFile.name.slice(0, 15)}...
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button onClick={handleCreatePayment} className="w-full" disabled={uploadingReceipt}>
                    {uploadingReceipt ? "Enviando..." : "Registrar"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        <DateFilters filters={filters} onFiltersChange={setFilters} />

        <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
          <p className="text-sm text-muted-foreground">Total Pago no Período</p>
          <p className="text-xl font-bold text-primary">{formatCurrency(totalPaid)}</p>
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Funcionários ({employees?.length || 0})</h4>
          <ScrollArea className="h-[120px]">
            <div className="space-y-2">
              {employees?.map((emp) => (
                <div key={emp.id} className="flex items-center justify-between p-2 bg-secondary/30 rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{emp.name}</p>
                    <p className="text-xs text-muted-foreground">{emp.role || "Sem cargo"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{formatCurrency(emp.salary || 0)}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteEmployee(emp.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              {employees?.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum funcionário cadastrado</p>
              )}
            </div>
          </ScrollArea>
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Pagamentos por Mês</h4>
          <ScrollArea className="h-[250px]">
            <div className="space-y-3">
              {paymentsByMonth.map(([month, monthPayments]) => {
                const monthTotal = monthPayments.reduce((sum, p) => sum + Number(p.amount), 0);
                
                return (
                  <div key={month} className="space-y-2">
                    <div className="flex items-center justify-between bg-secondary/40 px-3 py-2 rounded-lg">
                      <h5 className="font-medium text-sm capitalize">{month}</h5>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-primary">{formatCurrency(monthTotal)}</span>
                        <span className="text-xs text-muted-foreground ml-2">({monthPayments.length})</span>
                      </div>
                    </div>
                    
                    <div className="space-y-1 pl-2">
                      {monthPayments.map((payment) => (
                        <div key={payment.id} className="flex items-center justify-between p-2 bg-background/50 rounded border border-border/20">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{payment.employee?.name}</span>
                              <Badge variant="secondary" className="text-xs">
                                {payment.payment_type === "salary" ? "Salário" : payment.payment_type === "bonus" ? "Bônus" : "Adiantamento"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                              <Calendar className="h-3 w-3" />
                              <span>{formatDate(payment.payment_date)}</span>
                              <span className="capitalize">({getDayOfWeek(payment.payment_date)})</span>
                            </div>
                            {payment.description && (
                              <p className="text-xs text-muted-foreground mt-1">{payment.description}</p>
                            )}
                          </div>
                          <div className="text-right flex items-center gap-2">
                            <span className="font-semibold text-sm">{formatCurrency(payment.amount)}</span>
                            {payment.receipt_url && (
                              <a 
                                href={payment.receipt_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-primary hover:text-primary/80"
                                title="Ver extrato"
                              >
                                <FileText className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              
              {paymentsByMonth.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum pagamento no período</p>
              )}
            </div>
          </ScrollArea>
        </div>
      </CardContent>

      <EmployeePaymentHistoryDialog
        open={historyDialogOpen}
        onOpenChange={setHistoryDialogOpen}
        employees={employees || []}
        payments={payments || []}
      />
    </Card>
  );
};