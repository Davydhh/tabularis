import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import type { RefObject } from "react";
import { usePendingRowOps } from "../../src/hooks/usePendingRowOps";
import type { Tab, TableColumn } from "../../src/types/editor";
import type { DriverCapabilities } from "../../src/types/plugins";

const invokeMock = vi.mocked(invoke);

function makeTab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: "tab-1",
    title: "Tab 1",
    type: "table",
    query: "SELECT * FROM users",
    result: { columns: ["id", "name"], rows: [[1, "a"]], affected_rows: 0 },
    error: "",
    executionTime: null,
    page: 1,
    activeTable: "users",
    pkColumn: "id",
    connectionId: "conn-1",
    ...overrides,
  };
}

interface HookParams {
  activeTab: Tab | null;
  applyToAll?: boolean;
  activeCapabilities?: DriverCapabilities | null;
}

function setup({
  activeTab,
  applyToAll = false,
  activeCapabilities = null,
}: HookParams) {
  const updateTab = vi.fn();
  const updateActiveTab = vi.fn();
  const showAlert = vi.fn();
  const runQuery = vi.fn();
  const t = (key: string) => key;

  const activeTabIdRef: RefObject<string | null> = {
    current: activeTab?.id ?? null,
  };
  const tabsRef: RefObject<Tab[]> = {
    current: activeTab ? [activeTab] : [],
  };

  const { result } = renderHook(() =>
    usePendingRowOps({
      activeTab,
      activeTabIdRef,
      tabsRef,
      activeConnectionId: "conn-1",
      activeSchema: null,
      activeCapabilities,
      updateTab,
      updateActiveTab,
      applyToAll,
      runQuery,
      showAlert,
      t,
      resultPageSize: 100,
    }),
  );

  return { result, updateTab, updateActiveTab, showAlert, runQuery };
}

describe("usePendingRowOps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handlePendingChange is a no-op when no active tab", () => {
    const { result, updateTab } = setup({ activeTab: null });
    act(() => {
      result.current.handlePendingChange(1, "name", "x");
    });
    expect(updateTab).not.toHaveBeenCalled();
  });

  it("handlePendingChange updates pendingChanges via the toggle util", () => {
    const tab = makeTab({ pendingChanges: {} });
    const { result, updateTab } = setup({ activeTab: tab });

    act(() => {
      result.current.handlePendingChange(1, "name", "new-name");
    });

    expect(updateTab).toHaveBeenCalledTimes(1);
    const [tabId, partial] = updateTab.mock.calls[0];
    expect(tabId).toBe("tab-1");
    expect(partial.pendingChanges).toBeDefined();
  });

  it("handleSelectionChange writes selectedRows as an array", () => {
    const { result, updateTab } = setup({ activeTab: makeTab() });

    act(() => {
      result.current.handleSelectionChange(new Set([0, 2, 5]));
    });

    expect(updateTab).toHaveBeenCalledWith("tab-1", {
      selectedRows: [0, 2, 5],
    });
  });

  it("handleDeleteRows is a no-op when no selected rows", () => {
    const { result, updateActiveTab } = setup({
      activeTab: makeTab({ selectedRows: [] }),
    });

    act(() => {
      result.current.handleDeleteRows();
    });

    expect(updateActiveTab).not.toHaveBeenCalled();
  });

  it("handleDeleteRows marks selected rows for deletion and clears selection", () => {
    const tab = makeTab({
      result: {
        columns: ["id", "name"],
        rows: [
          [1, "a"],
          [2, "b"],
        ],
        affected_rows: 0,
      },
      pkColumn: "id",
      selectedRows: [0, 1],
    });
    const { result, updateActiveTab } = setup({ activeTab: tab });

    act(() => {
      result.current.handleDeleteRows();
    });

    expect(updateActiveTab).toHaveBeenCalledTimes(1);
    const partial = updateActiveTab.mock.calls[0][0];
    expect(partial.selectedRows).toEqual([]);
    expect(partial.pendingDeletions).toBeDefined();
  });

  it("handlePendingInsertionChange forwards to updatePendingInsertionField", () => {
    const tab = makeTab({
      pendingInsertions: {
        t1: { tempId: "t1", data: { name: "" }, displayIndex: 0 },
      },
    });
    const { result, updateTab } = setup({ activeTab: tab });

    act(() => {
      result.current.handlePendingInsertionChange("t1", "name", "bob");
    });

    expect(updateTab).toHaveBeenCalledTimes(1);
    const partial = updateTab.mock.calls[0][1];
    expect(partial.pendingInsertions?.t1.data.name).toBe("bob");
  });

  it("handleDiscardInsertion is a no-op when there are no pending insertions", () => {
    const { result, updateTab } = setup({ activeTab: makeTab() });
    act(() => {
      result.current.handleDiscardInsertion("missing");
    });
    expect(updateTab).not.toHaveBeenCalled();
  });

  it("handleDiscardInsertion removes the insertion by tempId", () => {
    const tab = makeTab({
      pendingInsertions: {
        t1: { tempId: "t1", data: {}, displayIndex: 0 },
        t2: { tempId: "t2", data: {}, displayIndex: 1 },
      },
    });
    const { result, updateTab } = setup({ activeTab: tab });

    act(() => {
      result.current.handleDiscardInsertion("t1");
    });

    const partial = updateTab.mock.calls[0][1];
    expect(partial.pendingInsertions).toHaveProperty("t2");
    expect(partial.pendingInsertions).not.toHaveProperty("t1");
  });

  it("handleRevertDeletion removes a row from pendingDeletions", () => {
    const tab = makeTab({
      pendingDeletions: { "1": 1, "2": 2 },
    });
    const { result, updateTab } = setup({ activeTab: tab });

    act(() => {
      result.current.handleRevertDeletion(1);
    });

    const partial = updateTab.mock.calls[0][1];
    expect(partial.pendingDeletions).not.toHaveProperty("1");
    expect(partial.pendingDeletions).toHaveProperty("2");
  });

  it("handleMarkForDeletion adds a single pkVal to pendingDeletions", () => {
    const { result, updateTab } = setup({ activeTab: makeTab() });

    act(() => {
      result.current.handleMarkForDeletion(42);
    });

    const partial = updateTab.mock.calls[0][1];
    expect(partial.pendingDeletions).toHaveProperty("42", 42);
  });

  it("handleMarkMultipleForDeletion adds many pkVals to pendingDeletions", () => {
    const { result, updateTab } = setup({ activeTab: makeTab() });

    act(() => {
      result.current.handleMarkMultipleForDeletion([1, 2, 3]);
    });

    const partial = updateTab.mock.calls[0][1];
    expect(Object.keys(partial.pendingDeletions!)).toHaveLength(3);
  });

  it("handleDuplicateRow adds a duplicated insertion", () => {
    const tab = makeTab({
      autoIncrementColumns: ["id"],
      pendingInsertions: {},
    });
    const { result, updateTab } = setup({ activeTab: tab });

    act(() => {
      result.current.handleDuplicateRow({ id: 1, name: "alice" });
    });

    const partial = updateTab.mock.calls[0][1];
    const insertions = Object.values(partial.pendingInsertions ?? {});
    expect(insertions).toHaveLength(1);
    expect((insertions[0] as { data: Record<string, unknown> }).data.name).toBe(
      "alice",
    );
  });

  it("handleRollbackChanges delegates to rollbackPendingForSelection", () => {
    const tab = makeTab({
      pendingChanges: { "1": { pkOriginalValue: 1, changes: { name: "x" } } },
    });
    const { result, updateActiveTab } = setup({
      activeTab: tab,
      applyToAll: true,
    });

    act(() => {
      result.current.handleRollbackChanges();
    });

    expect(updateActiveTab).toHaveBeenCalledTimes(1);
  });

  it("handleNewRow is a no-op without activeTable", async () => {
    const { result, updateTab } = setup({
      activeTab: makeTab({ activeTable: null }),
    });

    await act(async () => {
      await result.current.handleNewRow();
    });

    expect(invokeMock).not.toHaveBeenCalled();
    expect(updateTab).not.toHaveBeenCalled();
  });

  it("handleNewRow fetches columns and appends a new pending insertion", async () => {
    const fakeColumns: TableColumn[] = [
      { name: "id", data_type: "int", is_nullable: false, is_primary: true },
      { name: "name", data_type: "text", is_nullable: true, is_primary: false },
    ];
    invokeMock.mockResolvedValueOnce(fakeColumns);

    const tab = makeTab({
      result: {
        columns: ["id", "name"],
        rows: [[1, "a"]],
        affected_rows: 0,
      },
      pendingInsertions: {},
    });
    const { result, updateTab } = setup({ activeTab: tab });

    await act(async () => {
      await result.current.handleNewRow();
    });

    expect(invokeMock).toHaveBeenCalledWith(
      "get_columns",
      expect.objectContaining({
        connectionId: "conn-1",
        tableName: "users",
      }),
    );
    expect(updateTab).toHaveBeenCalledTimes(1);
    const partial = updateTab.mock.calls[0][1];
    expect(Object.keys(partial.pendingInsertions ?? {})).toHaveLength(1);
  });

  it("handleNewRow shows an alert when get_columns fails", async () => {
    invokeMock.mockRejectedValueOnce(new Error("boom"));

    const { result, showAlert, updateTab } = setup({ activeTab: makeTab() });

    await act(async () => {
      await result.current.handleNewRow();
    });

    expect(updateTab).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalled();
    const [message, options] = showAlert.mock.calls[0];
    expect(message).toContain("editor.failedCreateRow");
    expect(options.kind).toBe("error");
  });

  it("handleSubmitChanges is a no-op without activeTable or connection", async () => {
    const { result, updateActiveTab, runQuery } = setup({
      activeTab: makeTab({ activeTable: null }),
    });

    await act(async () => {
      await result.current.handleSubmitChanges();
    });

    expect(updateActiveTab).not.toHaveBeenCalled();
    expect(runQuery).not.toHaveBeenCalled();
  });

  it("handleSubmitChanges runs deletions, updates and re-runs the query", async () => {
    const tab = makeTab({
      pendingChanges: {
        "1": { pkOriginalValue: 1, changes: { name: "alice2" } },
      },
      pendingDeletions: { "2": 2 },
      selectedRows: [0, 1],
    });

    invokeMock.mockResolvedValue(undefined);

    const { result, runQuery, updateActiveTab } = setup({
      activeTab: tab,
      applyToAll: true,
    });

    await act(async () => {
      await result.current.handleSubmitChanges();
    });

    expect(updateActiveTab).toHaveBeenCalledWith({ isLoading: true });
    const deletedCount = invokeMock.mock.calls.filter(
      ([cmd]) => cmd === "delete_record",
    ).length;
    const updatedCount = invokeMock.mock.calls.filter(
      ([cmd]) => cmd === "update_record",
    ).length;
    expect(deletedCount).toBe(1);
    expect(updatedCount).toBe(1);
    expect(runQuery).toHaveBeenCalledTimes(1);
  });

  it("handleSubmitChanges reports an error and clears loading on failure", async () => {
    const tab = makeTab({
      pendingDeletions: { "2": 2 },
      selectedRows: [0],
    });

    invokeMock.mockRejectedValueOnce(new Error("db down"));

    const { result, runQuery, updateActiveTab, showAlert } = setup({
      activeTab: tab,
      applyToAll: true,
    });

    await act(async () => {
      await result.current.handleSubmitChanges();
    });

    expect(runQuery).not.toHaveBeenCalled();
    expect(updateActiveTab).toHaveBeenLastCalledWith({ isLoading: false });
    expect(showAlert).toHaveBeenCalled();
    expect(showAlert.mock.calls[0][0]).toContain("dataGrid.updateFailed");
  });
});
