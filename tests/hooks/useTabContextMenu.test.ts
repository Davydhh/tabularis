import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RefObject } from "react";
import { useTabContextMenu } from "../../src/hooks/useTabContextMenu";
import type { Tab } from "../../src/types/editor";

function makeTab(overrides: Partial<Tab>): Tab {
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

function makeTabsRef(tabs: Tab[]): RefObject<Tab[]> {
  return { current: tabs };
}

describe("useTabContextMenu", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with no menu open", () => {
    const { result } = renderHook(() =>
      useTabContextMenu({
        tabsRef: makeTabsRef([]),
        addTab: vi.fn(),
        activeDriver: null,
        schemasEnabled: false,
      }),
    );

    expect(result.current.tabContextMenu).toBeNull();
  });

  it("opens the menu at the event coordinates", () => {
    const { result } = renderHook(() =>
      useTabContextMenu({
        tabsRef: makeTabsRef([]),
        addTab: vi.fn(),
        activeDriver: null,
        schemasEnabled: false,
      }),
    );

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const event = {
      preventDefault,
      stopPropagation,
      clientX: 120,
      clientY: 240,
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.openTabContextMenu(event, "tab-42");
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(result.current.tabContextMenu).toEqual({
      x: 120,
      y: 240,
      tabId: "tab-42",
    });
  });

  it("closes the menu", () => {
    const { result } = renderHook(() =>
      useTabContextMenu({
        tabsRef: makeTabsRef([]),
        addTab: vi.fn(),
        activeDriver: null,
        schemasEnabled: false,
      }),
    );

    act(() => {
      result.current.openTabContextMenu(
        {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 1,
          clientY: 2,
        } as unknown as React.MouseEvent,
        "tab-1",
      );
    });
    expect(result.current.tabContextMenu).not.toBeNull();

    act(() => {
      result.current.closeTabContextMenu();
    });
    expect(result.current.tabContextMenu).toBeNull();
  });

  it("convertToConsole is a no-op when the tab is not found", () => {
    const addTab = vi.fn();
    const { result } = renderHook(() =>
      useTabContextMenu({
        tabsRef: makeTabsRef([]),
        addTab,
        activeDriver: null,
        schemasEnabled: false,
      }),
    );

    act(() => {
      result.current.convertToConsole("missing");
    });

    expect(addTab).not.toHaveBeenCalled();
  });

  it("convertToConsole creates a console tab from a console source (raw query)", () => {
    const addTab = vi.fn();
    const tabs = [
      makeTab({
        id: "src",
        title: "My Console",
        type: "console",
        query: "SELECT 1",
        connectionId: "conn-x",
      }),
    ];

    const { result } = renderHook(() =>
      useTabContextMenu({
        tabsRef: makeTabsRef(tabs),
        addTab,
        activeDriver: "postgres",
        schemasEnabled: true,
      }),
    );

    act(() => {
      result.current.convertToConsole("src");
    });

    expect(addTab).toHaveBeenCalledWith({
      type: "console",
      title: "Console - My Console",
      query: "SELECT 1",
      connectionId: "conn-x",
    });
  });

  it("convertToConsole reconstructs the query for table tabs", () => {
    const addTab = vi.fn();
    const tabs = [
      makeTab({
        id: "t",
        title: "users",
        type: "table",
        activeTable: "users",
        connectionId: "conn-x",
        sortClause: "id ASC",
        limitClause: 50,
      }),
    ];

    const { result } = renderHook(() =>
      useTabContextMenu({
        tabsRef: makeTabsRef(tabs),
        addTab,
        activeDriver: "postgres",
        schemasEnabled: false,
      }),
    );

    act(() => {
      result.current.convertToConsole("t");
    });

    expect(addTab).toHaveBeenCalledTimes(1);
    const payload = addTab.mock.calls[0][0];
    expect(payload.type).toBe("console");
    expect(payload.title).toBe("Console - users");
    expect(payload.connectionId).toBe("conn-x");
    expect(payload.query).toContain("users");
    expect(payload.query.toUpperCase()).toContain("SELECT");
  });

  it("convertToConsole extracts SQL cells from notebook tabs", () => {
    const addTab = vi.fn();
    const tabs = [
      makeTab({
        id: "nb",
        title: "Notes",
        type: "notebook",
        connectionId: "conn-x",
        notebookState: {
          cells: [
            {
              id: "c1",
              type: "sql",
              content: "SELECT 1",
            },
            {
              id: "c2",
              type: "markdown",
              content: "# Heading",
            },
            {
              id: "c3",
              type: "sql",
              content: "SELECT 2",
            },
          ],
        },
      }),
    ];

    const { result } = renderHook(() =>
      useTabContextMenu({
        tabsRef: makeTabsRef(tabs),
        addTab,
        activeDriver: null,
        schemasEnabled: false,
      }),
    );

    act(() => {
      result.current.convertToConsole("nb");
    });

    expect(addTab).toHaveBeenCalledTimes(1);
    const payload = addTab.mock.calls[0][0];
    expect(payload.type).toBe("console");
    expect(payload.title).toBe("Console - Notes");
    expect(payload.connectionId).toBe("conn-x");
    expect(payload.query).toContain("SELECT 1");
    expect(payload.query).toContain("SELECT 2");
    expect(payload.query).not.toContain("Heading");
  });
});
