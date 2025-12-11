import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { exportToExcel, exportToPDF, prepareClientExportData, prepareInstallmentsExportData } from "@/lib/exportUtils";
import { useClientsWithDebt } from "@/hooks/useFinancialData";
import { toast } from "sonner";

type ExportFormat = "excel" | "pdf";
type ExportType = "clients" | "installments";

export function ExportDialog() {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("excel");
  const [type, setType] = useState<ExportType>("clients");
  const { data: clientsData } = useClientsWithDebt();

  const handleExport = () => {
    if (!clientsData || clientsData.length === 0) {
      toast.error("Nenhum dado disponível para exportar");
      return;
    }

    try {
      const data = type === "clients" 
        ? prepareClientExportData(clientsData)
        : prepareInstallmentsExportData(clientsData);

      const filename = type === "clients" ? "relatorio-clientes" : "relatorio-parcelas";

      if (format === "excel") {
        exportToExcel(data, filename);
      } else {
        exportToPDF(data, filename);
      }

      toast.success("Relatório exportado com sucesso!");
      setOpen(false);
    } catch (error) {
      console.error("Erro ao exportar:", error);
      toast.error("Erro ao exportar relatório");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Exportar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar Dados</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label className="text-sm font-medium">Tipo de Relatório</Label>
            <RadioGroup value={type} onValueChange={(v) => setType(v as ExportType)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="clients" id="clients" />
                <Label htmlFor="clients" className="cursor-pointer">Clientes</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="installments" id="installments" />
                <Label htmlFor="installments" className="cursor-pointer">Parcelas</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">Formato</Label>
            <RadioGroup value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="excel" id="excel" />
                <Label htmlFor="excel" className="cursor-pointer flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-green-600" />
                  Excel (.xlsx)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pdf" id="pdf" />
                <Label htmlFor="pdf" className="cursor-pointer flex items-center gap-2">
                  <FileText className="h-4 w-4 text-red-600" />
                  PDF (.pdf)
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
