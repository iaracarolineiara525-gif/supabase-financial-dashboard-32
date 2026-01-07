import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { useFixedBillsWithInstallments, useCreateFixedBill, useUpdateFixedBillInstallment, useDeleteFixedBill, FixedBillInstallment } from "@/hooks/useFixedBillsData";
import { formatCurrency } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { Plus, ChevronDown, ChevronUp, Trash2, Check, X, Calendar, Edit, CreditCard, Percent } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateFilters, DateFilterValues } from "./DateFilters";

const PAYMENT_METHODS = [
  { value: "pix", label: "PIX" },
  { value: "boleto", label: "Boleto" },
  { value: "cartao_credito", label: "Cartão de Crédito" },
  { value: "cartao_debito", label: "Cartão de Débito" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "transferencia", label: "Transferência" },
  { value: "debito_automatico", label: "Débito Automático" },
];

export const FixedBillsPanel = () => {
  const { data: bills, isLoading } = useFixedBillsWithInstallments();
  const createBill = useCreateFixedBill();
  const updateInstallment = useUpdateFixedBillInstallment();
  const deleteBill = useDeleteFixedBill();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<FixedBillInstallment | null>(null);
  const [expandedBills, setExpandedBills] = useState<string[]>([]);
  const [dateFilters, setDateFilters] = useState<DateFilterValues>({});

  // Form state for new bill
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [totalValue, setTotalValue] = useState("");
  const [totalInstallments, setTotalInstallments] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);

  // Form state for payment
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [discount, setDiscount] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split("T")[0]);

  const toggleExpanded = (billId: string) => {
    setExpandedBills((prev) =>
      prev.includes(billId) ? prev.filter((id) => id !== billId) : [...prev, billId]
    );
  };

  const handleCreate = async () => {
    if (!name || !totalValue || !totalInstallments || !startDate) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }

    const value = parseFloat(totalValue);
    const installments = parseInt(totalInstallments);
    const installmentValue = value / installments;

    try {
      await createBill.mutateAsync({
        name,
        description: description || undefined,
        total_value: value,
        total_installments: installments,
        start_date: startDate,
        installment_value: installmentValue,
      });

      toast({ title: "Sucesso", description: "Conta fixa criada com sucesso" });
      setDialogOpen(false);
      resetForm();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao criar conta fixa",
        variant: "destructive",
      });
    }
  };

  const openPaymentDialog = (installment: FixedBillInstallment) => {
    setSelectedInstallment(installment);
    setPaymentMethod(installment.payment_method || "pix");
    setDiscount(installment.discount?.toString() || "");
    setPaymentNotes(installment.notes || "");
    setPaidDate(installment.paid_date || new Date().toISOString().split("T")[0]);
    setPaymentDialogOpen(true);
  };

  const handlePayment = async () => {
    if (!selectedInstallment) return;

    const discountValue = parseFloat(discount) || 0;
    const originalValue = selectedInstallment.original_value || selectedInstallment.value;
    const finalValue = originalValue - discountValue;

    try {
      await updateInstallment.mutateAsync({
        id: selectedInstallment.id,
        status: "paid",
        paid_date: paidDate,
        payment_method: paymentMethod,
        discount: discountValue,
        value: finalValue,
        original_value: originalValue,
        notes: paymentNotes || null,
      });
      toast({ title: "Sucesso", description: "Pagamento registrado com sucesso" });
      setPaymentDialogOpen(false);
      resetPaymentForm();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao registrar pagamento",
        variant: "destructive",
      });
    }
  };

  const handleReopen = async (installment: FixedBillInstallment) => {
    try {
      const originalValue = installment.original_value || installment.value + (installment.discount || 0);
      await updateInstallment.mutateAsync({
        id: installment.id,
        status: "open",
        paid_date: null,
        value: originalValue,
        discount: 0,
      });
      toast({ title: "Sucesso", description: "Parcela reaberta" });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao reabrir parcela",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (billId: string) => {
    try {
      await deleteBill.mutateAsync(billId);
      toast({ title: "Sucesso", description: "Conta fixa excluída" });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao excluir conta fixa",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setTotalValue("");
    setTotalInstallments("");
    setStartDate(new Date().toISOString().split("T")[0]);
  };

  const resetPaymentForm = () => {
    setSelectedInstallment(null);
    setPaymentMethod("pix");
    setDiscount("");
    setPaymentNotes("");
    setPaidDate(new Date().toISOString().split("T")[0]);
  };

  // Filter bills by date
  const filteredBills = bills?.map((bill) => {
    const filteredInstallments = bill.installments.filter((installment) => {
      const dueDate = new Date(installment.due_date);
      if (dateFilters.year && dueDate.getFullYear() !== dateFilters.year) return false;
      if (dateFilters.month && dueDate.getMonth() + 1 !== dateFilters.month) return false;
      if (dateFilters.day && dueDate.getDate() !== dateFilters.day) return false;
      return true;
    });

    return {
      ...bill,
      installments: filteredInstallments,
      totalPaid: filteredInstallments.filter((i) => i.status === "paid").reduce((sum, i) => sum + i.value, 0),
      totalPending: filteredInstallments.filter((i) => i.status !== "paid").reduce((sum, i) => sum + i.value, 0),
      totalDiscount: filteredInstallments.reduce((sum, i) => sum + (i.discount || 0), 0),
    };
  }).filter((bill) => bill.installments.length > 0 || Object.keys(dateFilters).length === 0);

  // Calculate totals
  const totalStats = {
    totalDiscount: filteredBills?.reduce((sum, b) => sum + b.totalDiscount, 0) || 0,
    totalPaid: filteredBills?.reduce((sum, b) => sum + b.totalPaid, 0) || 0,
    totalPending: filteredBills?.reduce((sum, b) => sum + b.totalPending, 0) || 0,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "overdue":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      default:
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    }
  };

  const getPaymentMethodLabel = (value: string | null) => {
    return PAYMENT_METHODS.find((m) => m.value === value)?.label || value || "-";
  };

  const isOverdue = (dueDate: string, status: string) => {
    if (status === "paid") return false;
    return new Date(dueDate) < new Date();
  };

  if (isLoading) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardContent className="p-6">
          <p className="text-muted-foreground">Carregando...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Contas Fixas
              </CardTitle>
              {totalStats.totalDiscount > 0 && (
                <p className="text-sm text-green-400 flex items-center gap-1 mt-1">
                  <Percent className="h-3 w-3" />
                  Economia em descontos: {formatCurrency(totalStats.totalDiscount)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <DateFilters filters={dateFilters} onFiltersChange={setDateFilters} />
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Nova Conta
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nova Conta Fixa</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome da Conta *</Label>
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ex: Aluguel, Energia, Internet..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Descrição</Label>
                      <Input
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Descrição opcional"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="totalValue">Valor Total *</Label>
                        <Input
                          id="totalValue"
                          type="number"
                          step="0.01"
                          value={totalValue}
                          onChange={(e) => setTotalValue(e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="totalInstallments">Nº de Parcelas *</Label>
                        <Input
                          id="totalInstallments"
                          type="number"
                          value={totalInstallments}
                          onChange={(e) => setTotalInstallments(e.target.value)}
                          placeholder="12"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="startDate">Data de Início *</Label>
                      <Input
                        id="startDate"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                      />
                    </div>
                    {totalValue && totalInstallments && (
                      <p className="text-sm text-muted-foreground">
                        Valor por parcela: {formatCurrency(parseFloat(totalValue) / parseInt(totalInstallments))}
                      </p>
                    )}
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Cancelar</Button>
                    </DialogClose>
                    <Button onClick={handleCreate} disabled={createBill.isPending}>
                      {createBill.isPending ? "Criando..." : "Criar Conta"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {filteredBills?.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Nenhuma conta fixa encontrada
            </p>
          ) : (
            filteredBills?.map((bill) => (
              <Collapsible
                key={bill.id}
                open={expandedBills.includes(bill.id)}
                onOpenChange={() => toggleExpanded(bill.id)}
              >
                <div className="border border-border/50 rounded-lg overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-secondary/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div>
                          <h3 className="font-medium text-foreground">{bill.name}</h3>
                          {bill.description && (
                            <p className="text-sm text-muted-foreground">{bill.description}</p>
                          )}
                          {bill.totalDiscount > 0 && (
                            <p className="text-xs text-green-400">
                              Descontos: {formatCurrency(bill.totalDiscount)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">
                            {bill.installments.filter((i) => i.status === "paid").length}/{bill.installments.length} pagas
                          </p>
                          <p className="font-medium text-foreground">
                            {formatCurrency(bill.totalPending)} pendente
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(bill.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        {expandedBills.includes(bill.id) ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t border-border/50 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-20">Parcela</TableHead>
                            <TableHead>Vencimento</TableHead>
                            <TableHead>Valor</TableHead>
                            <TableHead>Desconto</TableHead>
                            <TableHead>Forma Pgto</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-24">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bill.installments.map((installment) => {
                            const overdue = isOverdue(installment.due_date, installment.status);
                            const displayStatus = overdue ? "overdue" : installment.status;

                            return (
                              <TableRow key={installment.id}>
                                <TableCell className="font-medium">
                                  {installment.installment_number}/{bill.total_installments}
                                </TableCell>
                                <TableCell>
                                  {format(new Date(installment.due_date), "dd/MM/yyyy", { locale: ptBR })}
                                </TableCell>
                                <TableCell>
                                  {installment.discount && installment.discount > 0 ? (
                                    <div>
                                      <span className="line-through text-muted-foreground text-xs">
                                        {formatCurrency(installment.original_value || installment.value + installment.discount)}
                                      </span>
                                      <br />
                                      <span className="text-green-400">{formatCurrency(installment.value)}</span>
                                    </div>
                                  ) : (
                                    formatCurrency(installment.value)
                                  )}
                                </TableCell>
                                <TableCell>
                                  {installment.discount && installment.discount > 0 ? (
                                    <span className="text-green-400">-{formatCurrency(installment.discount)}</span>
                                  ) : (
                                    "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  {installment.status === "paid" ? (
                                    <span className="text-xs">{getPaymentMethodLabel(installment.payment_method)}</span>
                                  ) : (
                                    "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    className={getStatusColor(displayStatus)}
                                  >
                                    {displayStatus === "paid" ? "Paga" : overdue ? "Atrasada" : "Em Aberto"}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    {installment.status === "paid" ? (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleReopen(installment)}
                                        className="text-red-400 h-8 w-8"
                                        title="Reabrir parcela"
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    ) : (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => openPaymentDialog(installment)}
                                        className="text-green-400 h-8 w-8"
                                        title="Registrar pagamento"
                                      >
                                        <CreditCard className="h-4 w-4" />
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => openPaymentDialog(installment)}
                                      className="text-primary h-8 w-8"
                                      title="Editar"
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))
          )}
        </CardContent>
      </Card>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
          </DialogHeader>
          {selectedInstallment && (
            <div className="space-y-4 py-4">
              <div className="p-3 bg-secondary/50 rounded-lg">
                <p className="text-sm text-muted-foreground">Valor original</p>
                <p className="text-lg font-medium">
                  {formatCurrency(selectedInstallment.original_value || selectedInstallment.value)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="paidDate">Data do Pagamento</Label>
                  <Input
                    id="paidDate"
                    type="date"
                    value={paidDate}
                    onChange={(e) => setPaidDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="discount">Desconto (R$)</Label>
                  <Input
                    id="discount"
                    type="number"
                    step="0.01"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="paymentMethod">Forma de Pagamento</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((method) => (
                      <SelectItem key={method.value} value={method.value}>
                        {method.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="paymentNotes">Observações</Label>
                <Textarea
                  id="paymentNotes"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Observações sobre o pagamento..."
                  rows={2}
                />
              </div>

              {discount && parseFloat(discount) > 0 && (
                <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <p className="text-sm text-muted-foreground">Valor final com desconto</p>
                  <p className="text-lg font-medium text-green-400">
                    {formatCurrency(
                      (selectedInstallment.original_value || selectedInstallment.value) - parseFloat(discount)
                    )}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" onClick={resetPaymentForm}>Cancelar</Button>
            </DialogClose>
            <Button onClick={handlePayment} disabled={updateInstallment.isPending}>
              {updateInstallment.isPending ? "Salvando..." : "Confirmar Pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
