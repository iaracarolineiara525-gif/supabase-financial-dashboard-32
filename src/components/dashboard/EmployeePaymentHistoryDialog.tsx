import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { EmployeePayment, Employee } from "@/hooks/useEmployeeData";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TrendingUp, Calendar, FileText } from "lucide-react";

interface EmployeePaymentHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  payments: EmployeePayment[];
}

export const EmployeePaymentHistoryDialog = ({
  open,
  onOpenChange,
  employees,
  payments
}: EmployeePaymentHistoryDialogProps) => {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("all");

  // Filter payments by selected employee
  const filteredPayments = useMemo(() => {
    if (selectedEmployeeId === "all") return payments;
    return payments.filter(p => p.employee_id === selectedEmployeeId);
  }, [payments, selectedEmployeeId]);

  // Group payments by month for chart
  const monthlyData = useMemo(() => {
    const grouped: Record<string, { month: string; total: number; count: number }> = {};
    
    filteredPayments.forEach(payment => {
      const monthKey = format(parseISO(payment.payment_date), "yyyy-MM");
      const monthLabel = format(parseISO(payment.payment_date), "MMM/yy", { locale: ptBR });
      
      if (!grouped[monthKey]) {
        grouped[monthKey] = { month: monthLabel, total: 0, count: 0 };
      }
      grouped[monthKey].total += Number(payment.amount);
      grouped[monthKey].count += 1;
    });

    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12) // Last 12 months
      .map(([_, data]) => data);
  }, [filteredPayments]);

  // Group payments by month for list view
  const paymentsByMonth = useMemo(() => {
    const grouped: Record<string, EmployeePayment[]> = {};
    
    filteredPayments.forEach(payment => {
      const monthKey = format(parseISO(payment.payment_date), "MMMM 'de' yyyy", { locale: ptBR });
      if (!grouped[monthKey]) {
        grouped[monthKey] = [];
      }
      grouped[monthKey].push(payment);
    });

    return Object.entries(grouped).sort(([a], [b]) => {
      const dateA = filteredPayments.find(p => 
        format(parseISO(p.payment_date), "MMMM 'de' yyyy", { locale: ptBR }) === a
      )?.payment_date || "";
      const dateB = filteredPayments.find(p => 
        format(parseISO(p.payment_date), "MMMM 'de' yyyy", { locale: ptBR }) === b
      )?.payment_date || "";
      return dateB.localeCompare(dateA);
    });
  }, [filteredPayments]);

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId);

  const getDayOfWeek = (dateStr: string) => {
    return format(parseISO(dateStr), "EEEE", { locale: ptBR });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] glass-card border-border/50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Histórico de Pagamentos
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Employee Filter */}
          <div className="flex items-center gap-4">
            <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="Selecione um funcionário" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os funcionários</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedEmployee && (
              <div className="text-sm text-muted-foreground">
                <span className="font-medium">{selectedEmployee.role || "Sem cargo"}</span>
                {" • "}
                <span>Salário Base: {formatCurrency(selectedEmployee.salary || 0)}</span>
              </div>
            )}
          </div>

          {/* Chart */}
          {monthlyData.length > 0 ? (
            <div className="h-[250px] bg-background/50 rounded-lg p-4 border border-border/30">
              <h4 className="text-sm font-semibold mb-3 text-muted-foreground">Evolução dos Pagamentos (últimos 12 meses)</h4>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis 
                    dataKey="month" 
                    tick={{ fontSize: 11 }} 
                    className="text-muted-foreground"
                  />
                  <YAxis 
                    tick={{ fontSize: 11 }} 
                    tickFormatter={(value) => `R$${(value / 1000).toFixed(0)}k`}
                    className="text-muted-foreground"
                  />
                  <Tooltip 
                    formatter={(value: number) => [formatCurrency(value), "Total"]}
                    labelFormatter={(label) => `Mês: ${label}`}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar 
                    dataKey="total" 
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[200px] bg-background/50 rounded-lg flex items-center justify-center border border-border/30">
              <p className="text-muted-foreground">Nenhum dado para exibir</p>
            </div>
          )}

          {/* Payments grouped by month */}
          <div>
            <h4 className="text-sm font-semibold mb-3 text-muted-foreground">Pagamentos por Mês</h4>
            <ScrollArea className="h-[300px]">
              <div className="space-y-4">
                {paymentsByMonth.map(([month, monthPayments]) => {
                  const monthTotal = monthPayments.reduce((sum, p) => sum + Number(p.amount), 0);
                  
                  return (
                    <div key={month} className="space-y-2">
                      <div className="flex items-center justify-between bg-secondary/30 px-3 py-2 rounded-lg">
                        <h5 className="font-medium text-sm capitalize">{month}</h5>
                        <div className="text-right">
                          <span className="text-sm font-semibold text-primary">{formatCurrency(monthTotal)}</span>
                          <span className="text-xs text-muted-foreground ml-2">({monthPayments.length} pagamentos)</span>
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
                              {(payment as any).receipt_url && (
                                <a 
                                  href={(payment as any).receipt_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-primary hover:text-primary/80"
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
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhum pagamento encontrado</p>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
