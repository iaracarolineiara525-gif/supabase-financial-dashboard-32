import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar, X } from "lucide-react";

interface DateFiltersProps {
  filters: { year?: number; month?: number; day?: number };
  onFiltersChange: (filters: { year?: number; month?: number; day?: number }) => void;
}

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
const months = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" },
];

export const DateFilters = ({ filters, onFiltersChange }: DateFiltersProps) => {
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month, 0).getDate();
  };

  const days = filters.year && filters.month
    ? Array.from({ length: getDaysInMonth(filters.year, filters.month) }, (_, i) => i + 1)
    : [];

  const clearFilters = () => {
    onFiltersChange({});
  };

  const hasFilters = filters.year || filters.month || filters.day;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <Calendar className="h-4 w-4 text-muted-foreground" />
      
      <Select
        value={filters.year?.toString() || ""}
        onValueChange={(v) => onFiltersChange({ ...filters, year: v ? Number(v) : undefined, month: undefined, day: undefined })}
      >
        <SelectTrigger className="w-[100px] h-8 text-xs bg-background border-border">
          <SelectValue placeholder="Ano" />
        </SelectTrigger>
        <SelectContent className="bg-background border border-border z-[100]">
          {years.map((year) => (
            <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.month?.toString() || ""}
        onValueChange={(v) => onFiltersChange({ ...filters, month: v ? Number(v) : undefined, day: undefined })}
        disabled={!filters.year}
      >
        <SelectTrigger className="w-[120px] h-8 text-xs bg-background border-border disabled:opacity-50">
          <SelectValue placeholder="Mês" />
        </SelectTrigger>
        <SelectContent className="bg-background border border-border z-[100]">
          {months.map((month) => (
            <SelectItem key={month.value} value={month.value.toString()}>{month.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.day?.toString() || ""}
        onValueChange={(v) => onFiltersChange({ ...filters, day: v ? Number(v) : undefined })}
        disabled={!filters.month}
      >
        <SelectTrigger className="w-[80px] h-8 text-xs bg-background border-border disabled:opacity-50">
          <SelectValue placeholder="Dia" />
        </SelectTrigger>
        <SelectContent className="bg-background border border-border z-[100]">
          {days.map((day) => (
            <SelectItem key={day} value={day.toString()}>{day}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={clearFilters}>
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
};