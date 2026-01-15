import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FixedBill {
  id: string;
  name: string;
  description: string | null;
  total_value: number;
  total_installments: number;
  start_date: string;
  created_at: string;
  updated_at: string;
}

export interface FixedBillInstallment {
  id: string;
  fixed_bill_id: string;
  installment_number: number;
  value: number;
  original_value: number | null;
  due_date: string;
  paid_date: string | null;
  status: string;
  payment_method: string | null;
  discount: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FixedBillWithInstallments extends FixedBill {
  installments: FixedBillInstallment[];
  totalPaid: number;
  totalPending: number;
  totalDiscount: number;
  nextDueDate: string | null;
}

export const useFixedBills = (companyId?: string | null) => {
  return useQuery({
    queryKey: ["fixed_bills", companyId],
    queryFn: async () => {
      let query = supabase
        .from("fixed_bills" as any)
        .select("*")
        .order("name");
      
      if (companyId) {
        query = query.eq("company_id", companyId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as FixedBill[];
    },
  });
};

export const useFixedBillInstallments = () => {
  return useQuery({
    queryKey: ["fixed_bill_installments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fixed_bill_installments" as any)
        .select("*")
        .order("due_date");
      if (error) throw error;
      return data as unknown as FixedBillInstallment[];
    },
  });
};

export const useFixedBillsWithInstallments = (companyId?: string | null) => {
  const { data: bills, isLoading: billsLoading } = useFixedBills(companyId);
  const { data: installments, isLoading: installmentsLoading } = useFixedBillInstallments();

  const billsWithInstallments: FixedBillWithInstallments[] = bills?.map((bill) => {
    const billInstallments = installments?.filter((i) => i.fixed_bill_id === bill.id) || [];
    const paidInstallments = billInstallments.filter((i) => i.status === "paid");
    const pendingInstallments = billInstallments.filter((i) => i.status !== "paid");
    const nextDue = pendingInstallments.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0];

    return {
      ...bill,
      installments: billInstallments,
      totalPaid: paidInstallments.reduce((sum, i) => sum + i.value, 0),
      totalPending: pendingInstallments.reduce((sum, i) => sum + i.value, 0),
      totalDiscount: billInstallments.reduce((sum, i) => sum + (i.discount || 0), 0),
      nextDueDate: nextDue?.due_date || null,
    };
  }) || [];

  return {
    data: billsWithInstallments,
    isLoading: billsLoading || installmentsLoading,
  };
};

export const useCreateFixedBill = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { 
      name: string; 
      description?: string; 
      total_value: number; 
      total_installments: number; 
      start_date: string;
      installment_value: number;
    }) => {
      // Create the fixed bill
      const { data: bill, error: billError } = await supabase
        .from("fixed_bills" as any)
        .insert({
          name: data.name,
          description: data.description,
          total_value: data.total_value,
          total_installments: data.total_installments,
          start_date: data.start_date,
        })
        .select()
        .single();

      if (billError) throw billError;

      // Create installments
      const installments = [];
      const startDate = new Date(data.start_date);
      
      for (let i = 0; i < data.total_installments; i++) {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        
        installments.push({
          fixed_bill_id: (bill as any).id,
          installment_number: i + 1,
          value: data.installment_value,
          original_value: data.installment_value,
          due_date: dueDate.toISOString().split("T")[0],
          status: "open",
          payment_method: "pix",
          discount: 0,
        });
      }

      const { error: installmentsError } = await supabase
        .from("fixed_bill_installments" as any)
        .insert(installments);

      if (installmentsError) throw installmentsError;

      return bill;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fixed_bills"] });
      queryClient.invalidateQueries({ queryKey: ["fixed_bill_installments"] });
    },
  });
};

export const useUpdateFixedBillInstallment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<FixedBillInstallment>) => {
      const { error } = await supabase
        .from("fixed_bill_installments" as any)
        .update(data)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fixed_bill_installments"] });
    },
  });
};

export const useDeleteFixedBill = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("fixed_bills" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fixed_bills"] });
      queryClient.invalidateQueries({ queryKey: ["fixed_bill_installments"] });
    },
  });
};
