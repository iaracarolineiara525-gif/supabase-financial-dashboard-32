import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompanyContext } from "@/contexts/CompanyContext";
import { Building2 } from "lucide-react";

export const CompanyTabs = () => {
  const { companies, selectedCompanyId, setSelectedCompanyId, isLoading } = useCompanyContext();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Building2 className="h-4 w-4" />
        Carregando empresas...
      </div>
    );
  }

  if (companies.length === 0) {
    return null;
  }

  return (
    <Tabs value={selectedCompanyId || ""} onValueChange={setSelectedCompanyId}>
      <TabsList className="bg-secondary/50">
        {companies.map((company) => (
          <TabsTrigger
            key={company.id}
            value={company.id}
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <span className="font-bold mr-1">{company.state}</span>
            <span className="hidden sm:inline text-xs opacity-80">
              ({company.cnpj})
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
};
