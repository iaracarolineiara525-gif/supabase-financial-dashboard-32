import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useClientsWithDebt } from "@/hooks/useFinancialData";
import { useCompanyContext } from "@/contexts/CompanyContext";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { User, Calendar, AlertTriangle, DollarSign, CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { EditClientDialog } from "./EditClientDialog";
import { DeleteClientDialog } from "./DeleteClientDialog";
import { SearchInput } from "./SearchInput";

const statusBadgeVariant = (status: string) => {
  switch (status) {
    case "paid":
      return "default";
    case "overdue":
      return "destructive";
    default:
      return "secondary";
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case "paid":
      return "Pago";
    case "overdue":
      return "Atrasado";
    default:
      return "Em Aberto";
  }
};

export const ClientDebtPanel = () => {
  const { selectedCompanyId } = useCompanyContext();
  const { data: clientsWithDebt, isLoading } = useClientsWithDebt(selectedCompanyId);
  const queryClient = useQueryClient();
  const [editingClient, setEditingClient] = useState<any>(null);
  const [deletingClient, setDeletingClient] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredClients = useMemo(() => {
    if (!clientsWithDebt || !searchTerm.trim()) return clientsWithDebt;
    const term = searchTerm.toLowerCase();
    return clientsWithDebt.filter((item) =>
      item.client.name.toLowerCase().includes(term) ||
      item.client.document?.toLowerCase().includes(term) ||
      item.client.email?.toLowerCase().includes(term) ||
      item.client.phone?.toLowerCase().includes(term)
    );
  }, [clientsWithDebt, searchTerm]);

  const handleMarkAsPaid = async (installmentId: string) => {
    try {
      const { error } = await supabase
        .from("installments")
        .update({ 
          status: "paid", 
          paid_date: new Date().toISOString().split("T")[0] 
        })
        .eq("id", installmentId);

      if (error) throw error;
      toast.success("Parcela marcada como paga!");
      queryClient.invalidateQueries();
    } catch (error) {
      toast.error("Erro ao atualizar parcela");
    }
  };

  const handleMarkAsUnpaid = async (installmentId: string, dueDate: string) => {
    try {
      const today = new Date();
      const due = new Date(dueDate);
      const newStatus = due < today ? "overdue" : "open";

      const { error } = await supabase
        .from("installments")
        .update({ status: newStatus, paid_date: null })
        .eq("id", installmentId);

      if (error) throw error;
      toast.success("Parcela desmarcada como paga!");
      queryClient.invalidateQueries();
    } catch (error) {
      toast.error("Erro ao atualizar parcela");
    }
  };

  if (isLoading) {
    return (
      <Card className="h-full glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <User className="h-5 w-5 text-primary" />
            Parcelas por Cliente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-secondary/50 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!clientsWithDebt || clientsWithDebt.length === 0) {
    return (
      <Card className="h-full glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <User className="h-5 w-5 text-primary" />
            Parcelas por Cliente
          </CardTitle>
          <CardDescription>Foco em Dívida Ativa</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Nenhum cliente cadastrado ainda.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="h-full flex flex-col glass-card">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <User className="h-5 w-5 text-primary" />
                Parcelas por Cliente
              </CardTitle>
              <CardDescription>Foco em Dívida Ativa</CardDescription>
            </div>
            <div className="w-full sm:w-64">
              <SearchInput
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="Pesquisar cliente..."
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1">
          <ScrollArea className="h-[500px] pr-4">
            <Accordion type="single" collapsible className="space-y-2">
              {filteredClients?.map((item, index) => (
                <AccordionItem
                  key={`${item.client.id}-${item.contract.id}`}
                  value={`${item.client.id}-${item.contract.id}`}
                  className="border border-border/50 rounded-lg px-4 bg-secondary/30"
                >
                  <div className="flex items-center justify-between w-full pr-2">
                    <AccordionTrigger className="hover:no-underline flex-1 py-4">
                      <div className="flex flex-col items-start gap-2 text-left flex-1 mr-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground">{item.client.name}</span>
                          {item.overdueCount > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              {item.overdueCount} em atraso
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3.5 w-3.5" />
                            Contrato: {formatCurrency(item.contract.total_value)}
                          </span>
                          <span className="font-medium text-foreground">
                            Saldo: {formatCurrency(item.totalDebt)}
                          </span>
                          {item.client.entry_date && (
                            <span className="flex items-center gap-1 text-primary">
                              <Calendar className="h-3.5 w-3.5" />
                              Entrada: {formatDate(item.client.entry_date)}
                            </span>
                          )}
                          {item.client.exit_date && (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              Saída: {formatDate(item.client.exit_date)}
                            </span>
                          )}
                          {item.oldestOverdue && (
                            <span className="flex items-center gap-1 text-destructive">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Atraso desde: {formatDate(item.oldestOverdue)}
                            </span>
                          )}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <div className="flex gap-1 ml-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingClient(item.client);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingClient(item.client);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <AccordionContent>
                    <div className="pt-2 space-y-4">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Detalhamento das Parcelas
                      </h4>
                      <div className="space-y-2">
                        {item.installments.map(installment => (
                          <div
                            key={installment.id}
                            className="flex items-center justify-between p-3 bg-background/50 rounded-lg border border-border/30"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium">
                                Parcela {installment.installment_number}/{installment.total_installments}
                              </span>
                              <Badge variant={statusBadgeVariant(installment.status)}>
                                {statusLabel(installment.status)}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 flex-wrap text-sm">
                              <span className="text-muted-foreground">
                                Venc: {formatDate(installment.due_date)}
                              </span>
                              {installment.expected_end_date && (
                                <span className="text-muted-foreground">
                                  Término: {formatDate(installment.expected_end_date)}
                                </span>
                              )}
                              <span className="font-medium">
                                {formatCurrency(installment.value)}
                              </span>
                              {installment.status !== "paid" ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => handleMarkAsPaid(installment.id)}
                                >
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Pago
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => handleMarkAsUnpaid(installment.id, installment.due_date)}
                                >
                                  Desfazer
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </ScrollArea>
        </CardContent>
      </Card>

      <EditClientDialog
        client={editingClient}
        open={!!editingClient}
        onOpenChange={(open) => !open && setEditingClient(null)}
        onClientUpdated={() => {
          queryClient.invalidateQueries();
          setEditingClient(null);
        }}
      />

      <DeleteClientDialog
        client={deletingClient}
        open={!!deletingClient}
        onOpenChange={(open) => !open && setDeletingClient(null)}
        onClientDeleted={() => {
          queryClient.invalidateQueries();
          setDeletingClient(null);
        }}
      />
    </>
  );
};
