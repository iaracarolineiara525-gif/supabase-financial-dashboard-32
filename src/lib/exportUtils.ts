import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatDate } from './formatters';

interface ExportData {
  headers: string[];
  rows: (string | number)[][];
  title: string;
}

export const exportToExcel = (data: ExportData, filename: string) => {
  const ws = XLSX.utils.aoa_to_sheet([data.headers, ...data.rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, data.title);
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

export const exportToPDF = (data: ExportData, filename: string) => {
  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(16);
  doc.text(data.title, 14, 20);
  doc.setFontSize(10);
  doc.text(`Gerado em: ${formatDate(new Date().toISOString())}`, 14, 28);

  // Table
  autoTable(doc, {
    head: [data.headers],
    body: data.rows,
    startY: 35,
    theme: 'grid',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [59, 130, 246] },
  });

  doc.save(`${filename}.pdf`);
};

export const prepareClientExportData = (clientsData: any[]): ExportData => {
  const headers = [
    'Nome',
    'Documento',
    'E-mail',
    'Telefone',
    'Data de Entrada',
    'Data de Saída',
    'Valor Total',
    'Saldo Devedor',
    'Parcelas Atrasadas',
  ];

  const rows = clientsData.map((item) => [
    item.client.name,
    item.client.document || '-',
    item.client.email || '-',
    item.client.phone || '-',
    item.client.entry_date ? formatDate(item.client.entry_date) : '-',
    item.client.exit_date ? formatDate(item.client.exit_date) : '-',
    formatCurrency(item.contract.total_value),
    formatCurrency(item.totalDebt),
    item.overdueCount,
  ]);

  return {
    headers,
    rows,
    title: 'Relatório de Clientes',
  };
};

export const prepareInstallmentsExportData = (clientsData: any[]): ExportData => {
  const headers = [
    'Cliente',
    'Parcela',
    'Valor',
    'Vencimento',
    'Previsão de Término',
    'Status',
    'Data Pagamento',
  ];

  const rows: (string | number)[][] = [];
  
  clientsData.forEach((item) => {
    item.installments.forEach((inst: any) => {
      rows.push([
        item.client.name,
        `${inst.installment_number}/${inst.total_installments}`,
        formatCurrency(inst.value),
        formatDate(inst.due_date),
        inst.expected_end_date ? formatDate(inst.expected_end_date) : '-',
        inst.status === 'paid' ? 'Pago' : inst.status === 'overdue' ? 'Atrasado' : 'Em Aberto',
        inst.paid_date ? formatDate(inst.paid_date) : '-',
      ]);
    });
  });

  return {
    headers,
    rows,
    title: 'Relatório de Parcelas',
  };
};
