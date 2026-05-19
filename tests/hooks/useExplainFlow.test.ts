import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RefObject } from "react";
import type { OnMount } from "@monaco-editor/react";
import { useExplainFlow } from "../../src/hooks/useExplainFlow";
import type { Tab } from "../../src/types/editor";

type MonacoEditor = Parameters<OnMount>[0];

function makeTab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: "tab-1",
    title: "Tab 1",
    type: "console",
    query: "",
    result: null,
    error: "",
    executionTime: null,
    page: 1,
    activeTable: null,
    pkColumn: null,
    connectionId: "conn-1",
    ...overrides,
  };
}

function makeEditorsRef(
  map: Record<string, MonacoEditor> = {},
): RefObject<Record<string, MonacoEditor>> {
  return { current: map };
}

function makeFakeMonacoEditor(value: string): MonacoEditor {
  return {
    getValue: () => value,
    getSelection: () => null,
    getModel: () => null,
  } as unknown as MonacoEditor;
}

describe("useExplainFlow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with both modals closed and no queries", () => {
    const { result } = renderHook(() =>
      useExplainFlow({
        activeTab: null,
        activeConnectionId: null,
        editorsRef: makeEditorsRef(),
      }),
    );

    expect(result.current.isVisualExplainOpen).toBe(false);
    expect(result.current.visualExplainQuery).toBeNull();
    expect(result.current.isExplainSelectionOpen).toBe(false);
    expect(result.current.explainSelectableQueries).toEqual([]);
  });

  it("openExplainForQuery opens visual explain with the given query", () => {
    const { result } = renderHook(() =>
      useExplainFlow({
        activeTab: null,
        activeConnectionId: null,
        editorsRef: makeEditorsRef(),
      }),
    );

    act(() => {
      result.current.openExplainForQuery("SELECT 1");
    });

    expect(result.current.isVisualExplainOpen).toBe(true);
    expect(result.current.visualExplainQuery).toBe("SELECT 1");
  });

  it("closeVisualExplain resets the visual explain state", () => {
    const { result } = renderHook(() =>
      useExplainFlow({
        activeTab: null,
        activeConnectionId: null,
        editorsRef: makeEditorsRef(),
      }),
    );

    act(() => {
      result.current.openExplainForQuery("SELECT 1");
    });

    act(() => {
      result.current.closeVisualExplain();
    });

    expect(result.current.isVisualExplainOpen).toBe(false);
    expect(result.current.visualExplainQuery).toBeNull();
  });

  it("handleExplainButton is a no-op without activeTab", () => {
    const { result } = renderHook(() =>
      useExplainFlow({
        activeTab: null,
        activeConnectionId: "conn-1",
        editorsRef: makeEditorsRef(),
      }),
    );

    act(() => {
      result.current.handleExplainButton();
    });

    expect(result.current.isVisualExplainOpen).toBe(false);
    expect(result.current.isExplainSelectionOpen).toBe(false);
  });

  it("handleExplainButton is a no-op without activeConnectionId", () => {
    const { result } = renderHook(() =>
      useExplainFlow({
        activeTab: makeTab({ query: "SELECT 1" }),
        activeConnectionId: null,
        editorsRef: makeEditorsRef(),
      }),
    );

    act(() => {
      result.current.handleExplainButton();
    });

    expect(result.current.isVisualExplainOpen).toBe(false);
  });

  it("handleExplainButton with no editor uses activeTab.query (single)", () => {
    const { result } = renderHook(() =>
      useExplainFlow({
        activeTab: makeTab({ query: "SELECT * FROM users" }),
        activeConnectionId: "conn-1",
        editorsRef: makeEditorsRef(),
      }),
    );

    act(() => {
      result.current.handleExplainButton();
    });

    expect(result.current.isVisualExplainOpen).toBe(true);
    expect(result.current.visualExplainQuery).toBe("SELECT * FROM users");
  });

  it("handleExplainButton uses editor text when an editor is mounted", () => {
    const editorsRef = makeEditorsRef({
      "tab-1": makeFakeMonacoEditor("SELECT name FROM accounts"),
    });

    const { result } = renderHook(() =>
      useExplainFlow({
        activeTab: makeTab({ id: "tab-1", query: "stale text" }),
        activeConnectionId: "conn-1",
        editorsRef,
      }),
    );

    act(() => {
      result.current.handleExplainButton();
    });

    expect(result.current.visualExplainQuery).toBe(
      "SELECT name FROM accounts",
    );
  });

  it("handleExplainButton with empty text is a no-op (kind: none)", () => {
    const { result } = renderHook(() =>
      useExplainFlow({
        activeTab: makeTab({ query: "   " }),
        activeConnectionId: "conn-1",
        editorsRef: makeEditorsRef(),
      }),
    );

    act(() => {
      result.current.handleExplainButton();
    });

    expect(result.current.isVisualExplainOpen).toBe(false);
    expect(result.current.isExplainSelectionOpen).toBe(false);
  });

  it("handleExplainButton opens the selection modal for multiple statements (kind: choose)", () => {
    const editorsRef = makeEditorsRef({
      "tab-1": makeFakeMonacoEditor(
        "SELECT 1 FROM a; SELECT 2 FROM b; SELECT 3 FROM c;",
      ),
    });

    const { result } = renderHook(() =>
      useExplainFlow({
        activeTab: makeTab({ id: "tab-1" }),
        activeConnectionId: "conn-1",
        editorsRef,
      }),
    );

    act(() => {
      result.current.handleExplainButton();
    });

    expect(result.current.isExplainSelectionOpen).toBe(true);
    expect(result.current.explainSelectableQueries.length).toBeGreaterThan(1);
    expect(result.current.isVisualExplainOpen).toBe(false);
  });

  it("closeExplainSelection closes the selection modal", () => {
    const editorsRef = makeEditorsRef({
      "tab-1": makeFakeMonacoEditor("SELECT 1 FROM a; SELECT 2 FROM b;"),
    });

    const { result } = renderHook(() =>
      useExplainFlow({
        activeTab: makeTab({ id: "tab-1" }),
        activeConnectionId: "conn-1",
        editorsRef,
      }),
    );

    act(() => {
      result.current.handleExplainButton();
    });
    expect(result.current.isExplainSelectionOpen).toBe(true);

    act(() => {
      result.current.closeExplainSelection();
    });
    expect(result.current.isExplainSelectionOpen).toBe(false);
  });
});
