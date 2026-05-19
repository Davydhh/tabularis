import { useCallback, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Tab, TableColumn, PendingInsertion } from "../types/editor";
import type { DriverCapabilities } from "../types/plugins";
import type { AlertOptions } from "../contexts/AlertContext";
import {
  addMultiplePendingDeletions,
  addPendingDeletion,
  buildDuplicateInsertion,
  cleanupSubmittedPending,
  computeDeletionsForSelection,
  computeSubmitOperations,
  removePendingDeletion,
  removePendingInsertion,
  rollbackPendingForSelection,
  togglePendingChange,
  updatePendingInsertionField,
} from "../utils/pendingChanges";
import { generateTempId, initializeNewRow } from "../utils/pendingInsertions";
import { fillMissingColumnMetadata } from "../utils/columnMetadata";
import { isMultiDatabaseCapable } from "../utils/database";

export interface PreservePendingChanges {
  pendingChanges?: Record<
    string,
    { pkOriginalValue: unknown; changes: Record<string, unknown> }
  >;
  pendingDeletions?: Record<string, unknown>;
  pendingInsertions?: Record<string, PendingInsertion>;
}

export type RunQueryFn = (
  sql?: string,
  pageNum?: number,
  tabId?: string,
  paramsOverride?: Record<string, string>,
  filterOverride?: string,
  sortOverride?: string,
  limitOverride?: number,
  preservePendingChanges?: PreservePendingChanges,
) => Promise<void> | void;

interface UsePendingRowOpsParams {
  activeTab: Tab | null;
  activeTabIdRef: RefObject<string | null>;
  tabsRef: RefObject<Tab[]>;
  activeConnectionId: string | null;
  activeSchema: string | null;
  activeCapabilities: DriverCapabilities | null;
  updateTab: (id: string, partial: Partial<Tab>) => void;
  updateActiveTab: (partial: Partial<Tab>) => void;
  applyToAll: boolean;
  runQuery: RunQueryFn;
  showAlert: (message: string, options?: AlertOptions) => void;
  t: (key: string) => string;
  resultPageSize: number;
}

export function usePendingRowOps({
  activeTab,
  activeTabIdRef,
  tabsRef,
  activeConnectionId,
  activeSchema,
  activeCapabilities,
  updateTab,
  updateActiveTab,
  applyToAll,
  runQuery,
  showAlert,
  t,
  resultPageSize,
}: UsePendingRowOpsParams) {
  const handlePendingChange = useCallback(
    (pkVal: unknown, colName: string, value: unknown) => {
      if (!activeTabIdRef.current) return;
      const tabId = activeTabIdRef.current;
      const currentTab = tabsRef.current.find((tab) => tab.id === tabId);
      if (!currentTab) return;

      updateTab(tabId, {
        pendingChanges: togglePendingChange(
          currentTab.pendingChanges,
          pkVal,
          colName,
          value,
        ),
      });
    },
    [activeTabIdRef, tabsRef, updateTab],
  );

  const handleSelectionChange = useCallback(
    (indices: Set<number>) => {
      if (!activeTabIdRef.current) return;
      updateTab(activeTabIdRef.current, { selectedRows: Array.from(indices) });
    },
    [activeTabIdRef, updateTab],
  );

  const handleDeleteRows = useCallback(() => {
    if (
      !activeTab ||
      !activeTab.selectedRows ||
      activeTab.selectedRows.length === 0
    )
      return;

    const { pendingDeletions, pendingInsertions } =
      computeDeletionsForSelection(activeTab);

    updateActiveTab({
      pendingDeletions,
      pendingInsertions,
      selectedRows: [],
    });
  }, [activeTab, updateActiveTab]);

  const handlePendingInsertionChange = useCallback(
    (tempId: string, colName: string, value: unknown) => {
      if (!activeTabIdRef.current) return;
      const tabId = activeTabIdRef.current;
      const currentTab = tabsRef.current.find((tab) => tab.id === tabId);
      if (!currentTab) return;

      updateTab(tabId, {
        pendingInsertions: updatePendingInsertionField(
          currentTab.pendingInsertions,
          tempId,
          colName,
          value,
        ),
      });
    },
    [activeTabIdRef, tabsRef, updateTab],
  );

  const handleDiscardInsertion = useCallback(
    (tempId: string) => {
      if (!activeTabIdRef.current) return;
      const tabId = activeTabIdRef.current;
      const currentTab = tabsRef.current.find((tab) => tab.id === tabId);
      if (!currentTab?.pendingInsertions) return;

      updateTab(tabId, {
        pendingInsertions: removePendingInsertion(
          currentTab.pendingInsertions,
          tempId,
        ),
      });
    },
    [activeTabIdRef, tabsRef, updateTab],
  );

  const handleRevertDeletion = useCallback(
    (pkVal: unknown) => {
      if (!activeTabIdRef.current) return;
      const tabId = activeTabIdRef.current;
      const currentTab = tabsRef.current.find((tab) => tab.id === tabId);
      if (!currentTab?.pendingDeletions) return;

      updateTab(tabId, {
        pendingDeletions: removePendingDeletion(
          currentTab.pendingDeletions,
          pkVal,
        ),
      });
    },
    [activeTabIdRef, tabsRef, updateTab],
  );

  const handleMarkForDeletion = useCallback(
    (pkVal: unknown) => {
      if (!activeTabIdRef.current) return;
      const tabId = activeTabIdRef.current;
      const currentTab = tabsRef.current.find((tab) => tab.id === tabId);
      if (!currentTab) return;

      updateTab(tabId, {
        pendingDeletions: addPendingDeletion(currentTab.pendingDeletions, pkVal),
      });
    },
    [activeTabIdRef, tabsRef, updateTab],
  );

  const handleMarkMultipleForDeletion = useCallback(
    (pkVals: unknown[]) => {
      if (!activeTabIdRef.current) return;
      const tabId = activeTabIdRef.current;
      const currentTab = tabsRef.current.find((tab) => tab.id === tabId);
      if (!currentTab) return;

      updateTab(tabId, {
        pendingDeletions: addMultiplePendingDeletions(
          currentTab.pendingDeletions,
          pkVals,
        ),
      });
    },
    [activeTabIdRef, tabsRef, updateTab],
  );

  const handleDuplicateRow = useCallback(
    (rowData: Record<string, unknown>) => {
      if (!activeTabIdRef.current) return;
      const tabId = activeTabIdRef.current;
      const currentTab = tabsRef.current.find((tab) => tab.id === tabId);
      if (!currentTab) return;

      const { pendingInsertions } = buildDuplicateInsertion(
        rowData,
        currentTab.autoIncrementColumns ?? [],
        currentTab.pendingInsertions,
        currentTab.result?.rows.length ?? 0,
      );

      updateTab(tabId, { pendingInsertions });
    },
    [activeTabIdRef, tabsRef, updateTab],
  );

  const handleNewRow = useCallback(async () => {
    if (
      !activeTabIdRef.current ||
      !activeConnectionId ||
      !activeTab?.activeTable
    ) {
      console.warn("Cannot create new row: missing required context", {
        tabId: activeTabIdRef.current,
        connectionId: activeConnectionId,
        table: activeTab?.activeTable,
      });
      return;
    }

    try {
      const columns = await invoke<TableColumn[]>("get_columns", {
        connectionId: activeConnectionId,
        tableName: activeTab.activeTable,
        ...(activeSchema ? { schema: activeSchema } : {}),
      });

      if (!columns || columns.length === 0) {
        throw new Error("No columns found for table");
      }

      const tempId = generateTempId();
      const data = initializeNewRow(columns);

      const currentPendingInsertions = activeTab.pendingInsertions || {};
      const existingRowCount = activeTab.result?.rows.length || 0;
      const insertionCount = Object.keys(currentPendingInsertions).length;

      const displayIndex = existingRowCount + insertionCount;

      const newPendingInsertions = {
        ...currentPendingInsertions,
        [tempId]: {
          tempId,
          data,
          displayIndex,
        },
      };

      const updates: Partial<Tab> = {
        pendingInsertions: newPendingInsertions,
      };

      if (!activeTab.result) {
        updates.result = {
          columns: columns.map((c) => c.name),
          rows: [],
          affected_rows: 0,
          pagination: {
            page: 1,
            page_size: resultPageSize || 100,
            total_rows: null,
            has_more: false,
          },
        };
      } else if (
        !activeTab.result.columns ||
        activeTab.result.columns.length === 0
      ) {
        updates.result = {
          ...activeTab.result,
          columns: columns.map((c) => c.name),
        };
      }

      Object.assign(updates, fillMissingColumnMetadata(activeTab, columns));

      updateTab(activeTabIdRef.current, updates);
    } catch (err) {
      console.error("Failed to create new row:", err);
      showAlert(t("editor.failedCreateRow") + String(err), {
        title: t("general.error"),
        kind: "error",
      });
    }
  }, [
    activeConnectionId,
    activeTab,
    activeTabIdRef,
    activeSchema,
    resultPageSize,
    showAlert,
    t,
    updateTab,
  ]);

  const handleSubmitChanges = useCallback(async () => {
    if (!activeTab || !activeTab.activeTable || !activeConnectionId) return;

    const { activeTable, pkColumn, pendingInsertions } = activeTab;

    let columns: TableColumn[] = [];
    if (pendingInsertions && Object.keys(pendingInsertions).length > 0) {
      try {
        columns = await invoke<TableColumn[]>("get_columns", {
          connectionId: activeConnectionId,
          tableName: activeTable,
          ...(activeSchema ? { schema: activeSchema } : {}),
        });
      } catch (err) {
        console.error("Failed to process insertions:", err);
        showAlert(t("editor.failedProcessInsertions") + String(err), {
          title: t("common.error"),
          kind: "error",
        });
        return;
      }
    }

    const ops = computeSubmitOperations(activeTab, applyToAll, columns);
    ops.invalidInsertions.forEach(({ tempId, errors }) =>
      console.warn(`Skipping invalid insertion ${tempId}:`, errors),
    );

    if (
      ops.updates.length === 0 &&
      ops.deletions.length === 0 &&
      ops.insertions.length === 0
    )
      return;

    updateActiveTab({ isLoading: true });

    try {
      const promises = [];

      const databaseParam =
        isMultiDatabaseCapable(activeCapabilities) && activeTab?.schema
          ? { database: activeTab.schema }
          : {};

      if (ops.deletions.length > 0) {
        promises.push(
          ...ops.deletions.map((pkVal) =>
            invoke("delete_record", {
              connectionId: activeConnectionId,
              table: activeTable,
              pkCol: pkColumn,
              pkVal,
              ...(activeSchema ? { schema: activeSchema } : {}),
              ...databaseParam,
            }),
          ),
        );
      }

      if (ops.updates.length > 0) {
        promises.push(
          ...ops.updates.map((u) =>
            invoke("update_record", {
              connectionId: activeConnectionId,
              table: activeTable,
              pkCol: pkColumn,
              pkVal: u.pkVal,
              colName: u.colName,
              newVal: u.newVal,
              ...(activeSchema ? { schema: activeSchema } : {}),
              ...databaseParam,
            }),
          ),
        );
      }

      if (ops.insertions.length > 0) {
        promises.push(
          ...ops.insertions.map((insertion) =>
            invoke("insert_record", {
              connectionId: activeConnectionId,
              table: activeTable,
              data: insertion.data,
              ...(activeSchema ? { schema: activeSchema } : {}),
              ...databaseParam,
            }),
          ),
        );
      }

      await Promise.all(promises);

      const remaining = cleanupSubmittedPending(
        activeTab.pendingChanges,
        activeTab.pendingDeletions,
        activeTab.pendingInsertions,
        ops,
      );

      runQuery(
        activeTab.query,
        activeTab.page,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        remaining,
      );
    } catch (e) {
      console.error("Batch update failed", e);
      updateActiveTab({ isLoading: false });
      showAlert(t("dataGrid.updateFailed") + String(e), {
        title: t("common.error"),
        kind: "error",
      });
    }
  }, [
    activeTab,
    activeConnectionId,
    updateActiveTab,
    runQuery,
    t,
    applyToAll,
    activeSchema,
    activeCapabilities,
    showAlert,
  ]);

  const handleRollbackChanges = useCallback(() => {
    if (!activeTab) return;
    updateActiveTab(rollbackPendingForSelection(activeTab, applyToAll));
  }, [activeTab, updateActiveTab, applyToAll]);

  return {
    handlePendingChange,
    handleSelectionChange,
    handleDeleteRows,
    handlePendingInsertionChange,
    handleDiscardInsertion,
    handleRevertDeletion,
    handleMarkForDeletion,
    handleMarkMultipleForDeletion,
    handleDuplicateRow,
    handleNewRow,
    handleSubmitChanges,
    handleRollbackChanges,
  };
}
