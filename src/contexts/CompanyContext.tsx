import React, { createContext, useContext, useState, useEffect } from "react";
import { useCompanies, Company } from "@/hooks/useCompanies";

interface CompanyContextType {
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string) => void;
  companies: Company[];
  selectedCompany: Company | null;
  isLoading: boolean;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export const CompanyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data: companies = [], isLoading } = useCompanies();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  // Set default company to SP when companies load
  useEffect(() => {
    if (companies.length > 0 && !selectedCompanyId) {
      const spCompany = companies.find(c => c.state === "SP");
      if (spCompany) {
        setSelectedCompanyId(spCompany.id);
      } else {
        setSelectedCompanyId(companies[0].id);
      }
    }
  }, [companies, selectedCompanyId]);

  const selectedCompany = companies.find(c => c.id === selectedCompanyId) || null;

  return (
    <CompanyContext.Provider
      value={{
        selectedCompanyId,
        setSelectedCompanyId,
        companies,
        selectedCompany,
        isLoading,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompanyContext = () => {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error("useCompanyContext must be used within a CompanyProvider");
  }
  return context;
};
