import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ClientDebtPanel } from "@/components/dashboard/ClientDebtPanel";
import { CollectionActivitiesPanel } from "@/components/dashboard/CollectionActivitiesPanel";
import { StatusValueCrossView } from "@/components/dashboard/StatusValueCrossView";
import { RevenuePanel } from "@/components/dashboard/RevenuePanel";
import { EmployeePaymentsPanel } from "@/components/dashboard/EmployeePaymentsPanel";
import { CommissionsPanel } from "@/components/dashboard/CommissionsPanel";
import { FixedBillsPanel } from "@/components/dashboard/FixedBillsPanel";
import { KPICard } from "@/components/dashboard/KPICard";
import { ClientRegistrationDialog } from "@/components/dashboard/ClientRegistrationDialog";
import { ExportDialog } from "@/components/dashboard/ExportDialog";
import { GPNLogo } from "@/components/GPNLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CompanyTabs } from "@/components/dashboard/CompanyTabs";
import { useDashboardKPIs, useInstallments } from "@/hooks/useFinancialData";
import { useEmployees, useEmployeePayments, useCommissions } from "@/hooks/useEmployeeData";
import { useFixedBillsWithInstallments } from "@/hooks/useFixedBillsData";
import { useCompanyContext } from "@/contexts/CompanyContext";
import { formatCurrency } from "@/lib/formatters";
import { Users, AlertCircle, BarChart3, DollarSign, TrendingUp, Calendar, RefreshCw, Wallet, Percent, Menu, CheckCircle, Clock, LogOut, Receipt } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

const menuItems = [
  { id: "clientes", label: "Clientes", icon: Users },
  { id: "cobrancas", label: "Cobranças", icon: AlertCircle },
  { id: "analise", label: "Análise", icon: BarChart3 },
  { id: "receita", label: "Receita", icon: TrendingUp },
  { id: "funcionarios", label: "Funcionários", icon: Wallet },
  { id: "comissoes", label: "Comissões", icon: Percent },
  { id: "contasfixas", label: "Contas - Diversas", icon: Receipt },
];

const Index = () => {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activePanel, setActivePanel] = useState("clientes");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { selectedCompanyId, selectedCompany } = useCompanyContext();
  const { data: kpis } = useDashboardKPIs(selectedCompanyId);
  const { data: installments } = useInstallments();
  const { data: employees } = useEmployees(selectedCompanyId);
  const { data: employeePayments } = useEmployeePayments();
  const { data: commissions } = useCommissions();
  const { data: fixedBills } = useFixedBillsWithInstallments(selectedCompanyId);
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleRefresh = () => {
    queryClient.invalidateQueries();
  };

  const handleLogout = async () => {
    const { error } = await signOut();
    if (error) {
      toast({
        title: 'Erro ao sair',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      navigate('/auth');
    }
  };

  // Calculate KPIs for each section
  const employeeKPIs = {
    totalEmployees: employees?.filter(e => e.active)?.length || 0,
    totalSalaries: employees?.reduce((sum, e) => sum + (e.salary || 0), 0) || 0,
    totalPayments: employeePayments?.reduce((sum, p) => sum + p.amount, 0) || 0,
    paymentsThisMonth: employeePayments?.filter(p => {
      const paymentDate = new Date(p.payment_date);
      const now = new Date();
      return paymentDate.getMonth() === now.getMonth() && paymentDate.getFullYear() === now.getFullYear();
    })?.reduce((sum, p) => sum + p.amount, 0) || 0,
  };

  const commissionKPIs = {
    totalCommissions: commissions?.length || 0,
    pendingCommissions: commissions?.filter(c => c.status === 'pending')?.length || 0,
    paidCommissions: commissions?.filter(c => c.status === 'paid')?.length || 0,
    totalValue: commissions?.reduce((sum, c) => sum + c.amount, 0) || 0,
    pendingValue: commissions?.filter(c => c.status === 'pending')?.reduce((sum, c) => sum + c.amount, 0) || 0,
  };

  const fixedBillKPIs = {
    totalBills: fixedBills?.length || 0,
    totalPending: fixedBills?.reduce((sum, b) => sum + b.totalPending, 0) || 0,
    totalPaid: fixedBills?.reduce((sum, b) => sum + b.totalPaid, 0) || 0,
    overdueCount: fixedBills?.reduce((sum, b) => {
      return sum + b.installments.filter(i => i.status !== 'paid' && new Date(i.due_date) < new Date()).length;
    }, 0) || 0,
  };

  const revenueKPIs = {
    totalPaid: installments?.filter(i => i.status === 'paid')?.reduce((sum, i) => sum + i.value, 0) || 0,
    totalReceivable: installments?.reduce((sum, i) => sum + i.value, 0) || 0,
  };

  const renderKPIs = () => {
    switch (activePanel) {
      case "clientes":
        return (
          <>
            <KPICard title="Total de Clientes" value={kpis?.totalClients || 0} subtitle="Clientes cadastrados" icon={Users} variant="info" />
            <KPICard title="Valor em Aberto" value={formatCurrency(kpis?.totalOpenValue || 0)} subtitle="Total a receber" icon={DollarSign} variant="default" />
            <KPICard title="Valor em Atraso" value={formatCurrency(kpis?.totalOverdueValue || 0)} subtitle="Requer ação imediata" icon={AlertCircle} variant="destructive" />
            <KPICard title="Clientes com Atraso" value={kpis?.clientsWithOverdue || 0} subtitle="Precisam de cobrança" icon={TrendingUp} variant="warning" />
          </>
        );
      case "cobrancas":
        return (
          <>
            <KPICard title="Total em Aberto" value={formatCurrency(kpis?.totalOpenValue || 0)} subtitle="Aguardando pagamento" icon={Clock} variant="info" />
            <KPICard title="Valor em Atraso" value={formatCurrency(kpis?.totalOverdueValue || 0)} subtitle="Requer ação imediata" icon={AlertCircle} variant="destructive" />
            <KPICard title="Clientes com Atraso" value={kpis?.clientsWithOverdue || 0} subtitle="Precisam de cobrança" icon={Users} variant="warning" />
            <KPICard title="Parcelas Pagas" value={formatCurrency(revenueKPIs.totalPaid)} subtitle="Recebido" icon={CheckCircle} variant="default" />
          </>
        );
      case "analise":
        return (
          <>
            <KPICard title="Total de Clientes" value={kpis?.totalClients || 0} subtitle="Clientes cadastrados" icon={Users} variant="info" />
            <KPICard title="Total Receita" value={formatCurrency(revenueKPIs.totalReceivable)} subtitle="Valor total" icon={DollarSign} variant="default" />
            <KPICard title="Recebido" value={formatCurrency(revenueKPIs.totalPaid)} subtitle="Já pago" icon={CheckCircle} variant="info" />
            <KPICard title="Em Aberto" value={formatCurrency(kpis?.totalOpenValue || 0)} subtitle="A receber" icon={Clock} variant="warning" />
          </>
        );
      case "receita":
        return (
          <>
            <KPICard title="Receita Total" value={formatCurrency(revenueKPIs.totalReceivable)} subtitle="Valor total de contratos" icon={DollarSign} variant="info" />
            <KPICard title="Recebido" value={formatCurrency(revenueKPIs.totalPaid)} subtitle="Parcelas pagas" icon={CheckCircle} variant="default" />
            <KPICard title="A Receber" value={formatCurrency(kpis?.totalOpenValue || 0)} subtitle="Parcelas em aberto" icon={Clock} variant="warning" />
            <KPICard title="Em Atraso" value={formatCurrency(kpis?.totalOverdueValue || 0)} subtitle="Parcelas atrasadas" icon={AlertCircle} variant="destructive" />
          </>
        );
      case "funcionarios":
        return (
          <>
            <KPICard title="Total Funcionários" value={employeeKPIs.totalEmployees} subtitle="Funcionários ativos" icon={Users} variant="info" />
            <KPICard title="Folha Salarial" value={formatCurrency(employeeKPIs.totalSalaries)} subtitle="Total de salários" icon={Wallet} variant="default" />
            <KPICard title="Total Pagamentos" value={formatCurrency(employeeKPIs.totalPayments)} subtitle="Pagamentos realizados" icon={DollarSign} variant="info" />
            <KPICard title="Pagamentos Mês" value={formatCurrency(employeeKPIs.paymentsThisMonth)} subtitle="Pagamentos este mês" icon={Calendar} variant="warning" />
          </>
        );
      case "comissoes":
        return (
          <>
            <KPICard title="Total Comissões" value={commissionKPIs.totalCommissions} subtitle="Comissões registradas" icon={Percent} variant="info" />
            <KPICard title="Valor Total" value={formatCurrency(commissionKPIs.totalValue)} subtitle="Soma das comissões" icon={DollarSign} variant="default" />
            <KPICard title="Pendentes" value={commissionKPIs.pendingCommissions} subtitle={formatCurrency(commissionKPIs.pendingValue)} icon={Clock} variant="warning" />
            <KPICard title="Pagas" value={commissionKPIs.paidCommissions} subtitle="Comissões pagas" icon={CheckCircle} variant="info" />
          </>
        );
      case "contasfixas":
        return (
          <>
            <KPICard title="Total de Contas" value={fixedBillKPIs.totalBills} subtitle="Contas fixas cadastradas" icon={Receipt} variant="info" />
            <KPICard title="Valor Pendente" value={formatCurrency(fixedBillKPIs.totalPending)} subtitle="A pagar" icon={Clock} variant="warning" />
            <KPICard title="Valor Pago" value={formatCurrency(fixedBillKPIs.totalPaid)} subtitle="Já pago" icon={CheckCircle} variant="default" />
            <KPICard title="Parcelas Atrasadas" value={fixedBillKPIs.overdueCount} subtitle="Requer atenção" icon={AlertCircle} variant="destructive" />
          </>
        );
      default:
        return null;
    }
  };

  const renderPanel = () => {
    switch (activePanel) {
      case "clientes":
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ClientDebtPanel />
            <CollectionActivitiesPanel />
          </div>
        );
      case "cobrancas":
        return <CollectionActivitiesPanel />;
      case "analise":
        return <StatusValueCrossView />;
      case "receita":
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RevenuePanel />
            <StatusValueCrossView />
          </div>
        );
      case "funcionarios":
        return <EmployeePaymentsPanel />;
      case "comissoes":
        return <CommissionsPanel />;
      case "contasfixas":
        return <FixedBillsPanel />;
      default:
        return null;
    }
  };

  return (
    <div className={`min-h-screen flex ${theme === "dark" ? "gpn-gradient-radial" : "gpn-gradient-radial-light"}`}>
      {/* Sidebar */}
      <aside className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-card/95 backdrop-blur-md border-r border-border/50 transition-all duration-300",
        sidebarOpen ? "w-64" : "w-16"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-4 border-b border-border/50">
            <div className="flex justify-center">
              <GPNLogo className="h-10 w-auto" />
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-1">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActivePanel(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  activePanel === item.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {sidebarOpen && <span>{item.label}</span>}
              </button>
            ))}
          </nav>

          {/* Toggle */}
          <div className="p-3 border-t border-border/50">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="w-full justify-center"
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className={cn(
        "flex-1 transition-all duration-300",
        sidebarOpen ? "ml-64" : "ml-16"
      )}>
        {/* Header */}
        <header className="sticky top-0 z-30 bg-card/90 backdrop-blur-md border-b border-border/50">
          <div className="px-6 py-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-lg font-semibold text-foreground">
                    {selectedCompany?.name || "GPN Digital"}
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    {selectedCompany ? `CNPJ: ${selectedCompany.cnpj}` : "Sistema de Gestão Financeira"}
                  </p>
                </div>
                
                <div className="flex items-center gap-3 flex-wrap">
                <ExportDialog />
                <ClientRegistrationDialog onClientCreated={handleRefresh} />
                
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[160px] bg-secondary/50 border-border/50 hover:bg-secondary transition-colors">
                    <Calendar className="h-4 w-4 mr-2 text-primary" />
                    <SelectValue placeholder="Filtrar status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Status</SelectItem>
                    <SelectItem value="overdue">Atrasados</SelectItem>
                    <SelectItem value="open">Em Aberto</SelectItem>
                    <SelectItem value="paid">Pagos</SelectItem>
                  </SelectContent>
                </Select>

                <Button variant="outline" size="icon" onClick={handleRefresh} className="border-border/50 hover:bg-secondary hover:border-primary/50 transition-all">
                  <RefreshCw className="h-4 w-4" />
                </Button>

                <ThemeToggle />

                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={handleLogout}
                  className="border-border/50 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-all"
                  title="Sair"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
              </div>
              
              {/* Company Tabs */}
              <div className="flex items-center">
                <CompanyTabs />
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="p-6 space-y-6">
          {/* KPI Cards - Dynamic based on active panel */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {renderKPIs()}
          </div>

          {/* Active Panel */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              {menuItems.find(m => m.id === activePanel)?.icon && (
                <span className="text-primary">
                  {(() => {
                    const Icon = menuItems.find(m => m.id === activePanel)?.icon;
                    return Icon ? <Icon className="h-5 w-5" /> : null;
                  })()}
                </span>
              )}
              {menuItems.find(m => m.id === activePanel)?.label}
            </h2>
            {renderPanel()}
          </section>
        </main>

        {/* Footer */}
        <footer className="border-t border-border/50 py-4 bg-card/30 backdrop-blur-sm">
          <div className="px-6 text-center text-sm text-muted-foreground">
            Dashboard de Gestão Financeira • Dados atualizados em tempo real
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Index;
