import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useStatusSummary } from "@/hooks/useFinancialData";
import { formatCurrency } from "@/lib/formatters";
import { BarChart3, TrendingUp, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

const statusConfig = {
  Atrasado: {
    color: "hsl(var(--destructive))",
    icon: AlertTriangle,
    bgClass: "bg-destructive/10 text-destructive",
  },
  "Em Aberto": {
    color: "hsl(var(--warning))",
    icon: Clock,
    bgClass: "bg-warning/10 text-warning",
  },
  Pago: {
    color: "hsl(var(--success))",
    icon: CheckCircle,
    bgClass: "bg-success/10 text-success",
  },
};

export const StatusValueCrossView = () => {
  const { data: statusSummary, isLoading } = useStatusSummary();

  if (isLoading) {
    return (
      <Card className="h-full glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <BarChart3 className="h-5 w-5 text-primary" />
            Visão Cruzada - Status x Valor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-[200px] bg-secondary/50 rounded-lg" />
            <div className="h-[150px] bg-secondary/50 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalValue = statusSummary?.reduce((sum, s) => sum + s.totalValue, 0) || 0;
  const totalCount = statusSummary?.reduce((sum, s) => sum + s.count, 0) || 0;

  const chartData = statusSummary?.map(s => ({
    name: s.status,
    value: s.totalValue,
    count: s.count,
    fill: statusConfig[s.status as keyof typeof statusConfig]?.color || "hsl(var(--muted))",
  })) || [];

  return (
    <Card className="h-full flex flex-col glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <BarChart3 className="h-5 w-5 text-primary" />
          Visão Cruzada - Status x Valor
        </CardTitle>
        <CardDescription>Foco em Risco Financeiro</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-6">
        {/* Gráfico de Pizza */}
        <div className="h-[220px]">
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
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
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

        {/* Tabela de Status */}
        <div className="rounded-lg border border-border/50 bg-secondary/20">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Valor Total</TableHead>
                <TableHead className="text-right">% do Total</TableHead>
                <TableHead className="text-right">Dias Atraso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statusSummary?.map(item => {
                const config = statusConfig[item.status as keyof typeof statusConfig];
                const Icon = config?.icon || TrendingUp;
                const percentage = totalValue > 0 ? ((item.totalValue / totalValue) * 100).toFixed(1) : "0.0";

                return (
                  <TableRow key={item.status} className="animate-fade-in">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge className={config?.bgClass} variant="secondary">
                          <Icon className="h-3 w-3 mr-1" />
                          {item.status}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {item.count}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(item.totalValue)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {percentage}%
                    </TableCell>
                    <TableCell className="text-right">
                      {item.status === "Atrasado" ? (
                        <span className="text-destructive font-medium">
                          {item.avgDaysOverdue} dias
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {statusSummary && statusSummary.length > 0 && (
                <TableRow className="bg-secondary/30 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{totalCount}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalValue)}</TableCell>
                  <TableCell className="text-right">100%</TableCell>
                  <TableCell className="text-right">-</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
