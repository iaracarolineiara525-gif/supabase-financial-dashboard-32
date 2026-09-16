import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { pinSessionHeaders } from "@/lib/v4PinSession";

export type DispatchRow = {
  id: string;
  createdAt: string | null;
  sentAt: string | null;
  to: string;
  messageType: string;
  templateName: string | null;
  preview: string;
  status: string;
  dryRun: boolean;
  externalId: string | null;
  lastError: string | null;
  operatorKey: string | null;
};

export type DispatchTotals = {
  total: number;
  real: number;
  simulated: number;
  failed: number;
  accepted: number;
  lastSendAt: string | null;
};

export type DispatchState = {
  rows: DispatchRow[];
  totals: DispatchTotals | null;
  isLoading: boolean;
  loadError: string | null;
  fetchedAt: string | null;
  reload: () => Promise<void>;
};

export function useDispatches(refreshMs = 30_000, limit = 200): DispatchState {
  const [rows, setRows] = useState<DispatchRow[]>([]);
  const [totals, setTotals] = useState<DispatchTotals | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase.functions.invoke("message-outbox-list", { body: { limit }, headers: pinSessionHeaders() });
    setIsLoading(false);
    if (error || !data?.ok) {
      setLoadError("Não foi possível carregar o histórico de disparos agora.");
      return;
    }
    setLoadError(null);
    setRows(Array.isArray(data.rows) ? (data.rows as DispatchRow[]) : []);
    setTotals((data.totals as DispatchTotals) || null);
    setFetchedAt(typeof data.fetchedAt === "string" ? data.fetchedAt : null);
  }, [limit]);

  useEffect(() => {
    void reload();
    if (!refreshMs) return;
    const timer = window.setInterval(() => void reload(), refreshMs);
    return () => window.clearInterval(timer);
  }, [reload, refreshMs]);

  return { rows, totals, isLoading, loadError, fetchedAt, reload };
}

export const ACCEPTED_STATUSES = ["processando", "enviada", "entregue", "lida"];

export function countByStatus(rows: DispatchRow[], status: string) {
  return rows.filter((row) => String(row.status).toLowerCase() === status).length;
}

export function dispatchesToCsv(rows: DispatchRow[]): string {
  const header = ["data_hora", "destino", "tipo", "template", "mensagem", "modo", "status", "message_id", "erro"];
  const lines = rows.map((row) => [
    row.sentAt || row.createdAt || "",
    row.to,
    row.messageType,
    row.templateName || "",
    (row.preview || "").replace(/\s+/g, " "),
    row.dryRun ? "simulado" : "real",
    row.status,
    row.externalId || "",
    row.lastError || "",
  ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","));
  return [header.join(","), ...lines].join("\n");
}

export function downloadCsv(fileName: string, content: string) {
  const blob = new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
