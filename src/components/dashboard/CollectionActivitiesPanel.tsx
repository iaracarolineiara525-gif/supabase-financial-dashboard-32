import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useOverdueInstallments, useUpcomingInstallments, useDashboardKPIs } from "@/hooks/useFinancialData";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { Phone, Mail, AlertCircle, Clock, Users, DollarSign } from "lucide-react";
import { KPICard } from "./KPICard";
import { SearchInput } from "./SearchInput";

export const CollectionActivitiesPanel = () => {
  const { data: overdueInstallments, isLoading: loadingOverdue } = useOverdueInstallments();
  const { data: upcomingInstallments, isLoading: loadingUpcoming } = useUpcomingInstallments();
  const { data: kpis, isLoading: loadingKPIs } = useDashboardKPIs();
  const [searchTerm, setSearchTerm] = useState("");

  const filteredOverdue = useMemo(() => {
    if (!overdueInstallments || !searchTerm.trim()) return overdueInstallments?.slice(0, 3) || [];
    const term = searchTerm.toLowerCase();
    return overdueInstallments.filter((item) =>
      item.clientName?.toLowerCase().includes(term)
    ).slice(0, 5);
  }, [overdueInstallments, searchTerm]);

  const filteredUpcoming = useMemo(() => {
    if (!upcomingInstallments || !searchTerm.trim()) return upcomingInstallments?.slice(0, 2) || [];
    const term = searchTerm.toLowerCase();
    return upcomingInstallments.filter((item) =>
      item.clientName?.toLowerCase().includes(term)
    ).slice(0, 5);
  }, [upcomingInstallments, searchTerm]);

  const isLoading = loadingOverdue || loadingUpcoming || loadingKPIs;

  if (isLoading) {
    return (
      <Card className="h-full glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <AlertCircle className="h-5 w-5 text-primary" />
            Atividades de Cobrança
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-16 bg-secondary/50 rounded-lg" />
            ))}
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
              <AlertCircle className="h-5 w-5 text-primary" />
              Atividades de Cobrança
            </CardTitle>
            <CardDescription>Foco em Ação Imediata</CardDescription>
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
      <CardContent className="flex-1 space-y-6">
        {/* KPIs Resumidos */}
        <div className="grid grid-cols-2 gap-3">
          <KPICard
            title="Clientes com Atraso"
            value={kpis?.clientsWithOverdue || 0}
            icon={Users}
            variant="destructive"
          />
          <KPICard
            title="Valor em Atraso"
            value={formatCurrency(kpis?.totalOverdueValue || 0)}
            icon={DollarSign}
            variant="warning"
          />
        </div>

        <Separator />

        {/* Atividades em Atraso */}
        <div>
          <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <AlertCircle className="h-4 w-4 text-destructive" />
            {searchTerm ? `Atividades em Atraso (${filteredOverdue.length})` : "3 Atividades em Atraso"}
          </h4>
          <ScrollArea className="h-[180px]">
            {filteredOverdue.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {searchTerm ? "Nenhum resultado encontrado." : "Nenhuma parcela em atraso!"}
              </p>
            ) : (
              <div className="space-y-2">
                {filteredOverdue.map((item, index) => (
                  <div
                    key={item.id}
                    className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg animate-slide-in"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm">{item.clientName}</p>
                        <p className="text-xs text-muted-foreground">
                          Parcela {item.installment_number}/{item.total_installments} - 
                          Vencimento {formatDate(item.due_date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-sm">{formatCurrency(item.value)}</p>
                        <Badge variant="destructive" className="text-xs">
                          {item.daysOverdue} dias
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs">
                        <Phone className="h-3 w-3 mr-1" />
                        Ligar
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs">
                        <Mail className="h-3 w-3 mr-1" />
                        E-mail
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <Separator />

        {/* Vencimentos Próximos */}
        <div>
          <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-warning" />
            {searchTerm ? `Vencimentos Próximos (${filteredUpcoming.length})` : "2 Vencimentos Próximos"}
          </h4>
          <ScrollArea className="h-[140px]">
            {filteredUpcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {searchTerm ? "Nenhum resultado encontrado." : "Nenhum vencimento próximo."}
              </p>
            ) : (
              <div className="space-y-2">
                {filteredUpcoming.map((item, index) => (
                  <div
                    key={item.id}
                    className="p-3 bg-warning/5 border border-warning/20 rounded-lg animate-slide-in"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm">{item.clientName}</p>
                        <p className="text-xs text-muted-foreground">
                          Parcela {item.installment_number}/{item.total_installments} - 
                          Vencimento {formatDate(item.due_date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-sm">{formatCurrency(item.value)}</p>
                        <Badge variant="secondary" className="text-xs">
                          A vencer
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
};
