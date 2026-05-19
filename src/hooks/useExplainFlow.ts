import { useState, useCallback, type RefObject } from "react";
import type { OnMount } from "@monaco-editor/react";
import type { Tab } from "../types/editor";
import { getEditorTextOrSelection } from "../utils/monacoEditor";
import { resolveExplainTarget } from "../utils/explainRouting";

type MonacoEditor = Parameters<OnMount>[0];

interface ExplainSelectionChoice {
  query: string;
  index: number;
}

interface UseExplainFlowParams {
  activeTab: Tab | null;
  activeConnectionId: string | null;
  editorsRef: RefObject<Record<string, MonacoEditor>>;
}

export function useExplainFlow({
  activeTab,
  activeConnectionId,
  editorsRef,
}: UseExplainFlowParams) {
  const [isVisualExplainOpen, setIsVisualExplainOpen] = useState(false);
  const [visualExplainQuery, setVisualExplainQuery] = useState<string | null>(
    null,
  );
  const [isExplainSelectionOpen, setIsExplainSelectionOpen] = useState(false);
  const [explainSelectableQueries, setExplainSelectableQueries] = useState<
    ExplainSelectionChoice[]
  >([]);

  const openExplainForQuery = useCallback((query: string) => {
    setVisualExplainQuery(query);
    setIsVisualExplainOpen(true);
  }, []);

  const closeVisualExplain = useCallback(() => {
    setIsVisualExplainOpen(false);
    setVisualExplainQuery(null);
  }, []);

  const closeExplainSelection = useCallback(() => {
    setIsExplainSelectionOpen(false);
  }, []);

  const handleExplainButton = useCallback(() => {
    if (!activeTab || !activeConnectionId) return;

    const editor = editorsRef.current[activeTab.id];
    const text = editor
      ? getEditorTextOrSelection(editor)
      : (activeTab.query ?? "").trim();

    const target = resolveExplainTarget(text);
    switch (target.kind) {
      case "none":
        return;
      case "fallback":
      case "single":
        openExplainForQuery(target.query);
        return;
      case "choose":
        setExplainSelectableQueries(target.choices);
        setIsExplainSelectionOpen(true);
        return;
    }
  }, [activeTab, activeConnectionId, editorsRef, openExplainForQuery]);

  return {
    isVisualExplainOpen,
    visualExplainQuery,
    isExplainSelectionOpen,
    explainSelectableQueries,
    openExplainForQuery,
    closeVisualExplain,
    closeExplainSelection,
    handleExplainButton,
  };
}
