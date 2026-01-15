import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  document: string | null;
  entry_date: string | null;
  exit_date: string | null;
}

export interface Contract {
  id: string;
  client_id: string;
  description: string | null;
  total_value: number;
  start_date: string;
}

export interface Installment {
  id: string;
  contract_id: string;
  installment_number: number;
  total_installments: number;
  value: number;
  due_date: string;
  paid_date: string | null;
  status: "open" | "paid" | "overdue";
  expected_end_date: string | null;
  payment_method: string | null;
  gross_value: number | null;
  net_value: number | null;
  boleto_fee: number | null;
}

export interface ClientWithDebt {
  client: Client;
  contract: Contract;
  installments: Installment[];
  totalDebt: number;
  overdueCount: number;
  oldestOverdue: string | null;
}

export interface StatusSummary {
  status: string;
  totalValue: number;
  count: number;
  avgDaysOverdue: number;
}

const calculateDaysOverdue = (dueDate: string): number => {
  const due = new Date(dueDate);
  const today = new Date();
  const diffTime = today.getTime() - due.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
};

export const useClients = (companyId?: string | null) => {
  return useQuery({
    queryKey: ["clients", companyId],
    queryFn: async () => {
      let query = supabase
        .from("clients")
        .select("*")
        .order("name");
      
      if (companyId) {
        query = query.eq("company_id", companyId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as Client[];
    },
  });
};

export const useContracts = () => {
  return useQuery({
    queryKey: ["contracts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*");
      
      if (error) throw error;
      return data as Contract[];
    },
  });
};

export const useInstallments = () => {
  return useQuery({
    queryKey: ["installments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("installments")
        .select("*")
        .order("due_date");
      
      if (error) throw error;
      return data as Installment[];
    },
  });
};

export const useClientsWithDebt = (companyId?: string | null) => {
  const { data: clients } = useClients(companyId);
  const { data: contracts } = useContracts();
  const { data: installments } = useInstallments();

  return useQuery({
    queryKey: ["clientsWithDebt", companyId, clients, contracts, installments],
    queryFn: async () => {
      if (!clients || !contracts || !installments) return [];

      const clientsWithDebt: ClientWithDebt[] = [];

      for (const client of clients) {
        const clientContracts = contracts.filter(c => c.client_id === client.id);
        
        for (const contract of clientContracts) {
          const contractInstallments = installments.filter(
            i => i.contract_id === contract.id
          );

          const openInstallments = contractInstallments.filter(
            i => i.status !== "paid"
          );
          const overdueInstallments = contractInstallments.filter(
            i => i.status === "overdue"
          );

          const totalDebt = openInstallments.reduce((sum, i) => sum + Number(i.value), 0);
          
          const sortedOverdue = overdueInstallments.sort(
            (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
          );

          clientsWithDebt.push({
            client,
            contract,
            installments: contractInstallments,
            totalDebt,
            overdueCount: overdueInstallments.length,
            oldestOverdue: sortedOverdue[0]?.due_date || null,
          });
        }
      }

      return clientsWithDebt.sort((a, b) => b.totalDebt - a.totalDebt);
    },
    enabled: !!clients && !!contracts && !!installments,
  });
};

export const useOverdueInstallments = (companyId?: string | null) => {
  const { data: clients } = useClients(companyId);
  const { data: contracts } = useContracts();
  const { data: installments } = useInstallments();

  return useQuery({
    queryKey: ["overdueInstallments", companyId, clients, contracts, installments],
    queryFn: async () => {
      if (!clients || !contracts || !installments) return [];

      // Filter installments based on clients in this company
      const clientIds = new Set(clients.map(c => c.id));
      const companyContractIds = new Set(
        contracts.filter(c => clientIds.has(c.client_id)).map(c => c.id)
      );

      const overdue = installments
        .filter(i => i.status === "overdue" && companyContractIds.has(i.contract_id))
        .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

      return overdue.map(installment => {
        const contract = contracts.find(c => c.id === installment.contract_id);
        const client = clients.find(cl => cl.id === contract?.client_id);
        return {
          ...installment,
          clientName: client?.name || "Desconhecido",
          daysOverdue: calculateDaysOverdue(installment.due_date),
        };
      });
    },
    enabled: !!clients && !!contracts && !!installments,
  });
};

export const useUpcomingInstallments = (companyId?: string | null) => {
  const { data: clients } = useClients(companyId);
  const { data: contracts } = useContracts();
  const { data: installments } = useInstallments();

  return useQuery({
    queryKey: ["upcomingInstallments", companyId, clients, contracts, installments],
    queryFn: async () => {
      if (!clients || !contracts || !installments) return [];

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Filter installments based on clients in this company
      const clientIds = new Set(clients.map(c => c.id));
      const companyContractIds = new Set(
        contracts.filter(c => clientIds.has(c.client_id)).map(c => c.id)
      );

      const upcoming = installments
        .filter(i => {
          if (i.status === "paid") return false;
          if (!companyContractIds.has(i.contract_id)) return false;
          const dueDate = new Date(i.due_date);
          return dueDate >= today;
        })
        .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

      return upcoming.map(installment => {
        const contract = contracts.find(c => c.id === installment.contract_id);
        const client = clients.find(cl => cl.id === contract?.client_id);
        return {
          ...installment,
          clientName: client?.name || "Desconhecido",
        };
      });
    },
    enabled: !!clients && !!contracts && !!installments,
  });
};

export const useStatusSummary = (companyId?: string | null) => {
  const { data: clients } = useClients(companyId);
  const { data: contracts } = useContracts();
  const { data: installments } = useInstallments();

  return useQuery({
    queryKey: ["statusSummary", companyId, clients, contracts, installments],
    queryFn: async () => {
      if (!clients || !contracts || !installments) return [];

      // Filter installments based on clients in this company
      const clientIds = new Set(clients.map(c => c.id));
      const companyContractIds = new Set(
        contracts.filter(c => clientIds.has(c.client_id)).map(c => c.id)
      );

      const companyInstallments = installments.filter(i => companyContractIds.has(i.contract_id));

      const statusMap: Record<string, StatusSummary> = {
        overdue: { status: "Atrasado", totalValue: 0, count: 0, avgDaysOverdue: 0 },
        open: { status: "Em Aberto", totalValue: 0, count: 0, avgDaysOverdue: 0 },
        paid: { status: "Pago", totalValue: 0, count: 0, avgDaysOverdue: 0 },
      };

      let totalOverdueDays = 0;
      let overdueCount = 0;

      for (const installment of companyInstallments) {
        const status = installment.status;
        statusMap[status].totalValue += Number(installment.value);
        statusMap[status].count += 1;

        if (status === "overdue") {
          totalOverdueDays += calculateDaysOverdue(installment.due_date);
          overdueCount += 1;
        }
      }

      if (overdueCount > 0) {
        statusMap.overdue.avgDaysOverdue = Math.round(totalOverdueDays / overdueCount);
      }

      return Object.values(statusMap);
    },
    enabled: !!clients && !!contracts && !!installments,
  });
};

export const useDashboardKPIs = (companyId?: string | null) => {
  const { data: clients } = useClients(companyId);
  const { data: contracts } = useContracts();
  const { data: installments } = useInstallments();
  const { data: overdueInstallments } = useOverdueInstallments(companyId);

  return useQuery({
    queryKey: ["dashboardKPIs", companyId, clients, contracts, installments, overdueInstallments],
    queryFn: async () => {
      if (!clients || !contracts || !installments) {
        return {
          totalClients: 0,
          totalOverdueValue: 0,
          clientsWithOverdue: 0,
          totalOpenValue: 0,
        };
      }

      // Filter installments based on clients in this company
      const clientIds = new Set(clients.map(c => c.id));
      const companyContractIds = new Set(
        contracts.filter(c => clientIds.has(c.client_id)).map(c => c.id)
      );

      const companyInstallments = installments.filter(i => companyContractIds.has(i.contract_id));

      const overdueValue = companyInstallments
        .filter(i => i.status === "overdue")
        .reduce((sum, i) => sum + Number(i.value), 0);

      const openValue = companyInstallments
        .filter(i => i.status !== "paid")
        .reduce((sum, i) => sum + Number(i.value), 0);

      const clientsWithOverdue = new Set(
        overdueInstallments?.map(i => {
          const contract = contracts.find(c => c.id === i.contract_id);
          return contract?.client_id;
        }).filter(Boolean)
      ).size;

      return {
        totalClients: clients.length,
        totalOverdueValue: overdueValue,
        clientsWithOverdue,
        totalOpenValue: openValue,
      };
    },
    enabled: !!clients && !!contracts && !!installments,
  });
};
