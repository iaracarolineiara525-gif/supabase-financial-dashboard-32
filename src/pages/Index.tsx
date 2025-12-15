import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ClientDebtPanel } from "@/components/dashboard/ClientDebtPanel";
import { CollectionActivitiesPanel } from "@/components/dashboard/CollectionActivitiesPanel";
import { StatusValueCrossView } from "@/components/dashboard/StatusValueCrossView";
import { RevenuePanel } from "@/components/dashboard/RevenuePanel";
import { EmployeePaymentsPanel } from "@/components/dashboard/EmployeePaymentsPanel";
import { CommissionsPanel } from "@/components/dashboard/CommissionsPanel";
import { KPICard } from "@/components/dashboard/KPICard";
import { ClientRegistrationDialog } from "@/components/dashboard/ClientRegistrationDialog";
import { ExportDialog } from "@/components/dashboard/ExportDialog";
import { GPNLogo } from "@/components/GPNLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useDashboardKPIs, useInstallments } from "@/hooks/useFinancialData";
import { useEmployees, useEmployeePayments, useCommissions } from "@/hooks/useEmployeeData";
import { formatCurrency } from "@/lib/formatters";
import { Users, AlertCircle, BarChart3, DollarSign, TrendingUp, Calendar, RefreshCw, Wallet, Percent, Menu, CheckCircle, Clock, LogOut } from "lucide-react";
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
];


const Index = () => {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activePanel, setActivePanel] = useState("clientes");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { data: kpis } = useDashboardKPIs();
  const { data: installments } = useInstallments();
  const { data: employees } = useEmployees();
  const { data: employeePayments } = useEmployeePayments();
  const { data: commissions } = useCommissions();
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
