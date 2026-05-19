import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import type { Tab } from "../types/editor";
import type { ExportStatus } from "../components/modals/ExportProgressModal";
import { reconstructTableQuery } from "../utils/editor";

interface ExportProgressPayload {
  rows_processed: number;
}

interface ExportState {
  isOpen: boolean;
  status: ExportStatus;
  rowsProcessed: number;
  fileName: string;
  errorMessage?: string;
}

const INITIAL_EXPORT_STATE: ExportState = {
  isOpen: false,
  status: "exporting",
  rowsProcessed: 0,
  fileName: "",
};

interface UseExportFlowParams {
  activeTab: Tab | null;
  activeConnectionId: string | null;
  activeDriver: string | null;
  schemasEnabled: boolean;
  csvDelimiter: string;
}

export function useExportFlow({
  activeTab,
  activeConnectionId,
  activeDriver,
  schemasEnabled,
  csvDelimiter,
}: UseExportFlowParams) {
  const [exportState, setExportState] = useState<ExportState>(
    INITIAL_EXPORT_STATE,
  );
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  useEffect(() => {
    const unlisten = listen<ExportProgressPayload>(
      "export_progress",
      (event) => {
        setExportState((prev) => ({
          ...prev,
          rowsProcessed: event.payload.rows_processed,
        }));
      },
    );
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const cancelExport = useCallback(async () => {
    if (!activeConnectionId) return;
    try {
      await invoke("cancel_export", { connectionId: activeConnectionId });
      setExportState((prev) => ({ ...prev, isOpen: false }));
    } catch (e) {
      console.error("Failed to cancel export", e);
    }
  }, [activeConnectionId]);

  const closeExportModal = useCallback(() => {
    setExportState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const exportToFile = useCallback(
    async (format: "csv" | "json") => {
      if (!activeTab || !activeConnectionId) return;

      const effectiveSchema = schemasEnabled ? activeTab.schema : undefined;
      const tabForQuery = { ...activeTab, schema: effectiveSchema };
      const query =
        activeTab.type === "table" && activeTab.activeTable
          ? reconstructTableQuery(tabForQuery, activeDriver ?? undefined)
          : activeTab.query;

      if (!query || !query.trim()) return;

      try {
        const filePath = await save({
          filters: [{ name: format.toUpperCase(), extensions: [format] }],
          defaultPath: `result_${Date.now()}.${format}`,
        });

        if (!filePath) return;

        setExportState({
          isOpen: true,
          status: "exporting",
          rowsProcessed: 0,
          fileName: filePath.split(/[/\\]/).pop() || filePath,
        });
        setExportMenuOpen(false);

        await invoke("export_query_to_file", {
          connectionId: activeConnectionId,
          query,
          filePath,
          format,
          csvDelimiter: format === "csv" ? csvDelimiter : undefined,
        });

        setExportState((prev) => ({ ...prev, status: "completed" }));
      } catch (e) {
        setExportState((prev) => ({
          ...prev,
          status: "error",
          errorMessage: String(e),
        }));
      }
    },
    [
      activeTab,
      activeConnectionId,
      activeDriver,
      schemasEnabled,
      csvDelimiter,
    ],
  );

  const handleExportCSV = useCallback(() => exportToFile("csv"), [exportToFile]);
  const handleExportJSON = useCallback(
    () => exportToFile("json"),
    [exportToFile],
  );

  return {
    exportState,
    exportMenuOpen,
    setExportMenuOpen,
    cancelExport,
    closeExportModal,
    handleExportCSV,
    handleExportJSON,
  };
}
