import { useCallback, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  Tab,
  QueryResult,
  BatchStatementResult,
} from "../types/editor";
import type { ViewInfo } from "../contexts/DatabaseContext";
import { extractTableName } from "../utils/sql";
import { reconstructTableQuery } from "../utils/editor";
import {
  extractQueryParams,
  interpolateQueryParams,
} from "../utils/queryParameters";
import {
  createResultEntries,
  updateResultEntry,
} from "../utils/multiResult";
import type { PreservePendingChanges } from "./usePendingRowOps";

export interface QueryParamsModalState {
  isOpen: boolean;
  sql: string;
  parameters: string[];
  pendingPageNum: number;
  pendingTabId?: string;
  mode: "run" | "save";
  pendingMultiQueries?: string[];
}

export type AddHistoryEntryFn = (
  sql: string,
  executionTimeMs: number | null,
  status: "success" | "error",
  rowsAffected: number | null,
  error: string | null,
  database?: string | null,
) => unknown;

interface UseQueryExecutionParams {
  activeTab: Tab | null;
  activeTabIdRef: RefObject<string | null>;
  tabsRef: RefObject<Tab[]>;
  activeConnectionId: string | null;
  activeDriver: string | null;
  activeSchema: string | null;
  activeDatabaseName: string | null;
  schemasEnabled: boolean;
  isMultiDb: boolean;
  views: ViewInfo[];
  updateTab: (id: string, partial: Partial<Tab>) => void;
  updateActiveTab: (partial: Partial<Tab>) => void;
  addHistoryEntry: AddHistoryEntryFn;
  fetchPkColumn: (
    table: string,
    tabId?: string,
    tabSchema?: string,
  ) => Promise<void> | void;
  t: (key: string) => string;
  resultPageSize: number;
  setIsResultsCollapsed: (value: boolean) => void;
  setIsCountLoading: (value: boolean) => void;
  setQueryParamsModal: (next: QueryParamsModalState) => void;
}

export function useQueryExecution({
  activeTab,
  activeTabIdRef,
  tabsRef,
  activeConnectionId,
  activeDriver,
  activeSchema,
  activeDatabaseName,
  schemasEnabled,
  isMultiDb,
  views,
  updateTab,
  updateActiveTab,
  addHistoryEntry,
  fetchPkColumn,
  t,
  resultPageSize,
  setIsResultsCollapsed,
  setIsCountLoading,
  setQueryParamsModal,
}: UseQueryExecutionParams) {
  const resolvePageSize = useCallback(
    () => (resultPageSize && resultPageSize > 0 ? resultPageSize : 100),
    [resultPageSize],
  );

  const stopQuery = useCallback(async () => {
    if (!activeConnectionId) return;
    try {
      await invoke("cancel_query", { connectionId: activeConnectionId });
      updateActiveTab({ isLoading: false });
    } catch (e) {
      console.error("Failed to stop:", e);
    }
  }, [activeConnectionId, updateActiveTab]);

  const runQuery = useCallback(
    async (
      sql?: string,
      pageNum: number = 1,
      tabId?: string,
      paramsOverride?: Record<string, string>,
      filterOverride?: string,
      sortOverride?: string,
      limitOverride?: number,
      preservePendingChanges?: PreservePendingChanges,
    ) => {
      const targetTabId = tabId || activeTabIdRef.current;
      if (!activeConnectionId || !targetTabId) return;

      const targetTab = tabsRef.current.find((tab) => tab.id === targetTabId);
      if (!targetTab) return;

      let textToRun = sql?.trim() || targetTab?.query;
      if (targetTab?.type === "table" && targetTab.activeTable) {
        const effectiveSchema = schemasEnabled ? targetTab.schema : undefined;
        const tabForQuery = { ...targetTab, schema: effectiveSchema };
        textToRun = reconstructTableQuery(
          tabForQuery,
          activeDriver ?? undefined,
          {
            filterOverride:
              filterOverride !== undefined ? filterOverride : undefined,
            sortOverride: sortOverride !== undefined ? sortOverride : undefined,
            limitOverride:
              limitOverride !== undefined ? limitOverride : undefined,
            wrapLimitSubquery: true,
          },
        );
      }

      if (!textToRun || !textToRun.trim()) return;

      const params = extractQueryParams(textToRun);
      if (params.length > 0) {
        const storedParams = paramsOverride || targetTab.queryParams || {};
        const missingParams = params.filter(
          (p) => storedParams[p] === undefined || storedParams[p].trim() === "",
        );

        if (missingParams.length > 0) {
          setQueryParamsModal({
            isOpen: true,
            sql: textToRun,
            parameters: params,
            pendingPageNum: pageNum,
            pendingTabId: targetTabId,
            mode: "run",
          });
          return;
        }

        textToRun = interpolateQueryParams(textToRun, storedParams);
      }

      setIsResultsCollapsed(false);

      const previousTotalRows =
        targetTab?.result?.pagination?.total_rows ?? null;

      updateTab(targetTabId, {
        isLoading: true,
        error: "",
        result: null,
        executionTime: null,
        page: pageNum,
        results: undefined,
        activeResultId: undefined,
        pendingChanges: preservePendingChanges?.pendingChanges,
        pendingDeletions: preservePendingChanges?.pendingDeletions,
        pendingInsertions: preservePendingChanges?.pendingInsertions,
        selectedRows: [],
      });

      const shouldRecordHistory =
        targetTab?.type === "console" || targetTab?.type === "query_builder";

      const schema = targetTab?.schema ?? activeSchema;
      const historyDb =
        schema || (isMultiDb ? activeDatabaseName : undefined) || undefined;

      try {
        const start = performance.now();
        const pageSize = resolvePageSize();
        const res = await invoke<QueryResult>("execute_query", {
          connectionId: activeConnectionId,
          query: textToRun,
          limit: pageSize,
          page: pageNum,
          ...(schema ? { schema } : {}),
        });
        const end = performance.now();

        const currentTab = tabsRef.current.find((tab) => tab.id === targetTabId);
        let tableName = currentTab?.activeTable;

        if (!tableName && textToRun) {
          const extracted = extractTableName(textToRun);
          if (extracted && !views.some((v) => v.name === extracted)) {
            tableName = extracted;
          }
        }

        const resultWithCount =
          res.pagination &&
          res.pagination.total_rows === null &&
          previousTotalRows !== null
            ? {
                ...res,
                pagination: {
                  ...res.pagination,
                  total_rows: previousTotalRows,
                },
              }
            : res;

        updateTab(targetTabId, {
          result: resultWithCount,
          executionTime: end - start,
          isLoading: false,
          activeTable: tableName || null,
        });

        if (tableName) {
          fetchPkColumn(tableName, targetTabId, targetTab?.schema ?? undefined);
        } else {
          updateTab(targetTabId, { pkColumn: null });
        }

        if (shouldRecordHistory) {
          addHistoryEntry(
            textToRun,
            end - start,
            "success",
            res.pagination?.total_rows ?? null,
            null,
            historyDb,
          );
        }
      } catch (err) {
        updateTab(targetTabId, {
          error: typeof err === "string" ? err : t("editor.queryFailed"),
          isLoading: false,
        });

        if (shouldRecordHistory) {
          addHistoryEntry(
            textToRun,
            null,
            "error",
            null,
            typeof err === "string" ? err : t("editor.queryFailed"),
            historyDb,
          );
        }
      }
    },
    [
      activeTabIdRef,
      tabsRef,
      activeConnectionId,
      updateTab,
      resolvePageSize,
      fetchPkColumn,
      t,
      activeDriver,
      activeSchema,
      schemasEnabled,
      views,
      isMultiDb,
      activeDatabaseName,
      addHistoryEntry,
      setIsResultsCollapsed,
      setQueryParamsModal,
    ],
  );

  const runMultipleQueries = useCallback(
    async (queries: string[], paramsOverride?: Record<string, string>) => {
      const targetTabId = activeTabIdRef.current;
      if (!activeConnectionId || !targetTabId) return;

      const targetTab = tabsRef.current.find((tab) => tab.id === targetTabId);
      if (!targetTab) return;

      const allParams = [
        ...new Set(queries.flatMap((q) => extractQueryParams(q))),
      ];
      let effectiveQueries = queries;
      if (allParams.length > 0) {
        const storedParams = paramsOverride || targetTab.queryParams || {};
        const missingParams = allParams.filter(
          (p) => storedParams[p] === undefined || storedParams[p].trim() === "",
        );
        if (missingParams.length > 0) {
          setQueryParamsModal({
            isOpen: true,
            sql: effectiveQueries.join(";\n"),
            parameters: allParams,
            pendingPageNum: 1,
            pendingTabId: targetTabId,
            mode: "run",
            pendingMultiQueries: effectiveQueries,
          });
          return;
        }
        effectiveQueries = effectiveQueries.map((q) =>
          interpolateQueryParams(q, storedParams),
        );
      }

      const pageSize = resolvePageSize();
      const schema = targetTab?.schema ?? activeSchema;
      const historyDb =
        schema || (isMultiDb ? activeDatabaseName : undefined) || undefined;

      const entries = createResultEntries(targetTabId, effectiveQueries);

      setIsResultsCollapsed(false);
      updateTab(targetTabId, {
        results: entries,
        activeResultId: entries[0].id,
        result: null,
        error: "",
        isLoading: true,
        executionTime: null,
      });

      const shouldRecordHistory =
        targetTab?.type === "console" || targetTab?.type === "query_builder";

      // Run the whole script on a single pooled connection so statements
      // can share session state (SET @var, LAST_INSERT_ID(), transactions,
      // TEMP TABLE).
      const batchStart = performance.now();
      let batchResults: BatchStatementResult[];
      try {
        batchResults = await invoke<BatchStatementResult[]>(
          "execute_query_batch",
          {
            connectionId: activeConnectionId,
            queries: entries.map((e) => e.query),
            limit: pageSize,
            page: 1,
            ...(schema ? { schema } : {}),
          },
        );
      } catch (err) {
        const fallbackElapsed = performance.now() - batchStart;
        const message =
          typeof err === "string" ? err : t("editor.queryFailed");
        const failed = entries.map((entry) => ({
          ...entry,
          error: message,
          executionTime: fallbackElapsed,
          isLoading: false,
        }));
        updateTab(targetTabId, { results: failed, isLoading: false });
        if (shouldRecordHistory) {
          for (const entry of entries) {
            addHistoryEntry(
              entry.query,
              fallbackElapsed,
              "error",
              null,
              message,
              historyDb,
            );
          }
        }
        return;
      }

      const liveResults = entries.map((entry, idx) => {
        const item = batchResults[idx];
        const execTime = item?.execution_time_ms ?? null;
        if (item?.error) {
          if (shouldRecordHistory) {
            addHistoryEntry(
              entry.query,
              execTime,
              "error",
              null,
              item.error,
              historyDb,
            );
          }
          return {
            ...entry,
            error: item.error,
            executionTime: execTime,
            isLoading: false,
          };
        }
        const res = item?.result ?? null;
        const tableName = extractTableName(entry.query) ?? null;
        if (shouldRecordHistory) {
          addHistoryEntry(
            entry.query,
            execTime,
            "success",
            res?.pagination?.total_rows ?? null,
            null,
            historyDb,
          );
        }
        return {
          ...entry,
          result: res,
          executionTime: execTime,
          isLoading: false,
          activeTable: tableName,
        };
      });

      updateTab(targetTabId, { results: liveResults, isLoading: false });
    },
    [
      activeTabIdRef,
      tabsRef,
      activeConnectionId,
      updateTab,
      resolvePageSize,
      activeSchema,
      t,
      isMultiDb,
      activeDatabaseName,
      addHistoryEntry,
      setIsResultsCollapsed,
      setQueryParamsModal,
    ],
  );

  const runResultEntryPage = useCallback(
    async (entryId: string, pageNum: number) => {
      const targetTabId = activeTabIdRef.current;
      if (!activeConnectionId || !targetTabId) return;

      const currentTab = tabsRef.current.find((tab) => tab.id === targetTabId);
      const entry = currentTab?.results?.find((r) => r.id === entryId);
      if (!entry) return;

      const pageSize = resolvePageSize();
      const schema = currentTab?.schema ?? activeSchema;

      if (currentTab?.results) {
        updateTab(targetTabId, {
          results: updateResultEntry(currentTab.results, entryId, {
            isLoading: true,
          }),
        });
      }

      try {
        const start = performance.now();
        const res = await invoke<QueryResult>("execute_query", {
          connectionId: activeConnectionId,
          query: entry.query,
          limit: pageSize,
          page: pageNum,
          ...(schema ? { schema } : {}),
        });
        const end = performance.now();

        const latestTab = tabsRef.current.find((tab) => tab.id === targetTabId);
        if (latestTab?.results) {
          const previousTotalRows =
            entry.result?.pagination?.total_rows ?? null;
          const resultWithCount =
            res.pagination &&
            res.pagination.total_rows === null &&
            previousTotalRows !== null
              ? {
                  ...res,
                  pagination: {
                    ...res.pagination,
                    total_rows: previousTotalRows,
                  },
                }
              : res;

          updateTab(targetTabId, {
            results: updateResultEntry(latestTab.results, entryId, {
              result: resultWithCount,
              executionTime: end - start,
              isLoading: false,
              page: pageNum,
            }),
          });
        }
      } catch (err) {
        const latestTab = tabsRef.current.find((tab) => tab.id === targetTabId);
        if (latestTab?.results) {
          updateTab(targetTabId, {
            results: updateResultEntry(latestTab.results, entryId, {
              error: typeof err === "string" ? err : t("editor.queryFailed"),
              isLoading: false,
            }),
          });
        }
      }
    },
    [
      activeTabIdRef,
      tabsRef,
      activeConnectionId,
      updateTab,
      resolvePageSize,
      activeSchema,
      t,
    ],
  );

  const loadCount = useCallback(async () => {
    if (!activeTab?.result?.pagination || !activeConnectionId) return;
    setIsCountLoading(true);
    try {
      const total = await invoke<number>("count_query", {
        connectionId: activeConnectionId,
        query: activeTab.query,
        schema: activeTab.schema ?? activeSchema,
      });
      updateTab(activeTab.id, {
        result: {
          ...activeTab.result,
          pagination: { ...activeTab.result.pagination, total_rows: total },
        },
      });
    } finally {
      setIsCountLoading(false);
    }
  }, [
    activeTab,
    activeConnectionId,
    activeSchema,
    updateTab,
    setIsCountLoading,
  ]);

  return {
    runQuery,
    runMultipleQueries,
    runResultEntryPage,
    loadCount,
    stopQuery,
  };
}
