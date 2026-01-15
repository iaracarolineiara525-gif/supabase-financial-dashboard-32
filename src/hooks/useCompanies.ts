import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Company {
  id: string;
  name: string;
  cnpj: string;
  state: string;
  created_at: string;
  updated_at: string;
}

export const useCompanies = () => {
  return useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("state");
      
      if (error) throw error;
      return data as Company[];
    },
  });
};
