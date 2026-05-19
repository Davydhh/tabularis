import { useState, useCallback, type RefObject, type MouseEvent } from "react";
import type { Tab } from "../types/editor";
import { reconstructTableQuery } from "../utils/editor";
import { extractSqlFromCells } from "../utils/notebook";

export interface TabContextMenuState {
  x: number;
  y: number;
  tabId: string;
}

interface UseTabContextMenuParams {
  tabsRef: RefObject<Tab[]>;
  addTab: (partial?: Partial<Tab>) => string;
  activeDriver: string | null;
  schemasEnabled: boolean;
}

export function useTabContextMenu({
  tabsRef,
  addTab,
  activeDriver,
  schemasEnabled,
}: UseTabContextMenuParams) {
  const [tabContextMenu, setTabContextMenu] =
    useState<TabContextMenuState | null>(null);

  const openTabContextMenu = useCallback(
    (e: MouseEvent, tabId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setTabContextMenu({ x: e.clientX, y: e.clientY, tabId });
    },
    [],
  );

  const closeTabContextMenu = useCallback(() => {
    setTabContextMenu(null);
  }, []);

  const convertToConsole = useCallback(
    (tabId: string) => {
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (!tab) return;

      if (tab.type === "notebook" && tab.notebookState) {
        const allSql = extractSqlFromCells(tab.notebookState.cells);
        addTab({
          type: "console",
          title: `Console - ${tab.title}`,
          query: allSql,
          connectionId: tab.connectionId,
        });
        return;
      }

      const effectiveSchema = schemasEnabled ? tab.schema : undefined;
      const tabForQuery = { ...tab, schema: effectiveSchema };
      const query =
        tab.type === "table" && tab.activeTable
          ? reconstructTableQuery(tabForQuery, activeDriver ?? undefined)
          : tab.query;

      addTab({
        type: "console",
        title: `Console - ${tab.title}`,
        query,
        connectionId: tab.connectionId,
      });
    },
    [tabsRef, addTab, activeDriver, schemasEnabled],
  );

  return {
    tabContextMenu,
    openTabContextMenu,
    closeTabContextMenu,
    convertToConsole,
  };
}
