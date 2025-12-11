import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Employee {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  salary: number;
  hire_date: string;
  active: boolean;
  created_at: string;
}

export interface EmployeePayment {
  id: string;
  employee_id: string;
  amount: number;
  payment_date: string;
  payment_type: string;
  description: string | null;
  created_at: string;
  employee?: Employee;
}

export interface Commission {
  id: string;
  employee_id: string;
  installment_id: string | null;
  amount: number;
  percentage: number | null;
  commission_date: string;
  status: string;
  paid_date: string | null;
  description: string | null;
  created_at: string;
  employee?: Employee;
}

export const useEmployees = () => {
  return useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Employee[];
    },
  });
};

export const useEmployeePayments = (filters?: { year?: number; month?: number; day?: number }) => {
  return useQuery({
    queryKey: ["employee_payments", filters],
    queryFn: async () => {
      let query = supabase
        .from("employee_payments")
        .select(`*, employee:employees(*)`)
        .order("payment_date", { ascending: false });

      if (filters?.year) {
        const startDate = new Date(filters.year, filters.month ? filters.month - 1 : 0, filters.day || 1);
        const endDate = new Date(filters.year, filters.month ? filters.month - 1 : 11, filters.day || 31);
        
        if (filters.day) {
          query = query.eq("payment_date", startDate.toISOString().split('T')[0]);
        } else if (filters.month) {
          const lastDay = new Date(filters.year, filters.month, 0).getDate();
          query = query
            .gte("payment_date", `${filters.year}-${String(filters.month).padStart(2, '0')}-01`)
            .lte("payment_date", `${filters.year}-${String(filters.month).padStart(2, '0')}-${lastDay}`);
        } else {
          query = query
            .gte("payment_date", `${filters.year}-01-01`)
            .lte("payment_date", `${filters.year}-12-31`);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as EmployeePayment[];
    },
  });
};

export const useCommissions = (filters?: { year?: number; month?: number; day?: number }) => {
  return useQuery({
    queryKey: ["commissions", filters],
    queryFn: async () => {
      let query = supabase
        .from("commissions")
        .select(`*, employee:employees(*)`)
        .order("commission_date", { ascending: false });

      if (filters?.year) {
        if (filters.day && filters.month) {
          const dateStr = `${filters.year}-${String(filters.month).padStart(2, '0')}-${String(filters.day).padStart(2, '0')}`;
          query = query.eq("commission_date", dateStr);
        } else if (filters.month) {
          const lastDay = new Date(filters.year, filters.month, 0).getDate();
          query = query
            .gte("commission_date", `${filters.year}-${String(filters.month).padStart(2, '0')}-01`)
            .lte("commission_date", `${filters.year}-${String(filters.month).padStart(2, '0')}-${lastDay}`);
        } else {
          query = query
            .gte("commission_date", `${filters.year}-01-01`)
            .lte("commission_date", `${filters.year}-12-31`);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Commission[];
    },
  });
};

export const useCreateEmployee = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (employee: Omit<Employee, "id" | "created_at">) => {
      const { data, error } = await supabase.from("employees").insert(employee).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employees"] }),
  });
};

export const useCreateEmployeePayment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payment: Omit<EmployeePayment, "id" | "created_at" | "employee">) => {
      const { data, error } = await supabase.from("employee_payments").insert(payment).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employee_payments"] }),
  });
};

export const useCreateCommission = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (commission: Omit<Commission, "id" | "created_at" | "employee">) => {
      const { data, error } = await supabase.from("commissions").insert(commission).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["commissions"] }),
  });
};

export const useUpdateCommissionStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, paid_date }: { id: string; status: string; paid_date?: string }) => {
      const { error } = await supabase
        .from("commissions")
        .update({ status, paid_date: paid_date || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["commissions"] }),
  });
};

export const useDeleteEmployee = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employees"] }),
  });
};