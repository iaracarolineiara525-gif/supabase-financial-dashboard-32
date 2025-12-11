import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useInstallments } from "@/hooks/useFinancialData";
import { formatCurrency } from "@/lib/formatters";
import { TrendingUp, DollarSign, Clock, CheckCircle } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

export const RevenuePanel = () => {
  const { data: installments, isLoading } = useInstallments();

  if (isLoading) {
    return (
      <Card className="h-full glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <TrendingUp className="h-5 w-5 text-primary" />
            Receita Total
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-[200px] bg-secondary/50 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const paidInstallments = installments?.filter(i => i.status === "paid") || [];
  const openInstallments = installments?.filter(i => i.status === "open") || [];
  const overdueInstallments = installments?.filter(i => i.status === "overdue") || [];

  const totalReceived = paidInstallments.reduce((sum, i) => sum + Number(i.value), 0);
  const totalOpen = openInstallments.reduce((sum, i) => sum + Number(i.value), 0);
  const totalOverdue = overdueInstallments.reduce((sum, i) => sum + Number(i.value), 0);
  const totalReceivable = totalOpen + totalOverdue;
  const grandTotal = totalReceived + totalReceivable;

  const chartData = [
    { name: "Recebido", value: totalReceived, fill: "hsl(var(--success))" },
    { name: "A Receber", value: totalOpen, fill: "hsl(var(--primary))" },
    { name: "Em Atraso", value: totalOverdue, fill: "hsl(var(--destructive))" },
  ].filter(item => item.value > 0);

  return (
    <Card className="h-full flex flex-col glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <TrendingUp className="h-5 w-5 text-primary" />
          Receita Total
        </CardTitle>
        <CardDescription>Visão geral das entradas</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 bg-success/10 rounded-xl border border-success/20">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-success" />
              <span className="text-xs text-muted-foreground">Recebido</span>
            </div>
            <p className="text-xl font-bold text-success">{formatCurrency(totalReceived)}</p>
            <p className="text-xs text-muted-foreground">{paidInstallments.length} parcelas</p>
          </div>
          
          <div className="p-4 bg-primary/10 rounded-xl border border-primary/20">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">A Receber</span>
            </div>
            <p className="text-xl font-bold text-primary">{formatCurrency(totalReceivable)}</p>
            <p className="text-xs text-muted-foreground">{openInstallments.length + overdueInstallments.length} parcelas</p>
          </div>
        </div>

        {/* Total Geral */}
        <div className="p-4 bg-gradient-to-r from-primary/20 to-accent/20 rounded-xl border border-primary/30">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-foreground">Total Geral</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(grandTotal)}</p>
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
            <span>{paidInstallments.length + openInstallments.length + overdueInstallments.length} parcelas totais</span>
          </div>
        </div>

        {/* Gráfico */}
        <div className="h-[200px]">
          {chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              Sem dados para exibir
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Detalhamento */}
        <div className="space-y-2">
          <div className="flex justify-between items-center p-2 bg-secondary/30 rounded-lg">
            <span className="text-sm">Parcelas Pagas</span>
            <span className="text-sm font-medium text-success">{paidInstallments.length}</span>
          </div>
          <div className="flex justify-between items-center p-2 bg-secondary/30 rounded-lg">
            <span className="text-sm">Parcelas em Aberto</span>
            <span className="text-sm font-medium text-primary">{openInstallments.length}</span>
          </div>
          <div className="flex justify-between items-center p-2 bg-secondary/30 rounded-lg">
            <span className="text-sm">Parcelas em Atraso</span>
            <span className="text-sm font-medium text-destructive">{overdueInstallments.length}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};