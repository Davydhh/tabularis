import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useExportFlow } from "../../src/hooks/useExportFlow";
import type { Tab } from "../../src/types/editor";

const listenMock = vi.hoisted(() => vi.fn());
const unlistenMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

const invokeMock = vi.mocked(invoke);
const saveMock = vi.mocked(save);

function makeTab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: "tab-1",
    title: "Tab 1",
    type: "console",
    query: "SELECT 1",
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

describe("useExportFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listenMock.mockResolvedValue(unlistenMock);
  });

  it("initializes with the export modal closed and menu closed", () => {
    const { result } = renderHook(() =>
      useExportFlow({
        activeTab: null,
        activeConnectionId: null,
        activeDriver: null,
        schemasEnabled: false,
        csvDelimiter: ",",
      }),
    );

    expect(result.current.exportState.isOpen).toBe(false);
    expect(result.current.exportState.rowsProcessed).toBe(0);
    expect(result.current.exportMenuOpen).toBe(false);
  });

  it("subscribes to export_progress events on mount and unsubscribes on unmount", async () => {
    const { unmount } = renderHook(() =>
      useExportFlow({
        activeTab: null,
        activeConnectionId: null,
        activeDriver: null,
        schemasEnabled: false,
        csvDelimiter: ",",
      }),
    );

    await waitFor(() => {
      expect(listenMock).toHaveBeenCalledWith(
        "export_progress",
        expect.any(Function),
      );
    });

    unmount();

    await waitFor(() => {
      expect(unlistenMock).toHaveBeenCalled();
    });
  });

  it("updates rowsProcessed when an export_progress event arrives", async () => {
    let progressHandler: ((event: {
      payload: { rows_processed: number };
    }) => void) | undefined;
    listenMock.mockImplementation((_event, handler) => {
      progressHandler = handler;
      return Promise.resolve(unlistenMock);
    });

    const { result } = renderHook(() =>
      useExportFlow({
        activeTab: null,
        activeConnectionId: null,
        activeDriver: null,
        schemasEnabled: false,
        csvDelimiter: ",",
      }),
    );

    await waitFor(() => {
      expect(progressHandler).toBeDefined();
    });

    act(() => {
      progressHandler!({ payload: { rows_processed: 1234 } });
    });

    expect(result.current.exportState.rowsProcessed).toBe(1234);
  });

  it("cancelExport invokes cancel_export and closes the modal", async () => {
    invokeMock.mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useExportFlow({
        activeTab: null,
        activeConnectionId: "conn-1",
        activeDriver: null,
        schemasEnabled: false,
        csvDelimiter: ",",
      }),
    );

    await act(async () => {
      await result.current.cancelExport();
    });

    expect(invokeMock).toHaveBeenCalledWith("cancel_export", {
      connectionId: "conn-1",
    });
    expect(result.current.exportState.isOpen).toBe(false);
  });

  it("cancelExport is a no-op without an activeConnectionId", async () => {
    const { result } = renderHook(() =>
      useExportFlow({
        activeTab: null,
        activeConnectionId: null,
        activeDriver: null,
        schemasEnabled: false,
        csvDelimiter: ",",
      }),
    );

    await act(async () => {
      await result.current.cancelExport();
    });

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("closeExportModal sets isOpen to false", () => {
    const { result } = renderHook(() =>
      useExportFlow({
        activeTab: null,
        activeConnectionId: null,
        activeDriver: null,
        schemasEnabled: false,
        csvDelimiter: ",",
      }),
    );

    act(() => {
      result.current.closeExportModal();
    });

    expect(result.current.exportState.isOpen).toBe(false);
  });

  it("handleExportCSV is a no-op without activeTab or activeConnectionId", async () => {
    const { result } = renderHook(() =>
      useExportFlow({
        activeTab: null,
        activeConnectionId: null,
        activeDriver: null,
        schemasEnabled: false,
        csvDelimiter: ",",
      }),
    );

    await act(async () => {
      await result.current.handleExportCSV();
    });

    expect(saveMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("handleExportCSV bails when the user cancels the save dialog", async () => {
    saveMock.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useExportFlow({
        activeTab: makeTab({ query: "SELECT 1" }),
        activeConnectionId: "conn-1",
        activeDriver: null,
        schemasEnabled: false,
        csvDelimiter: ",",
      }),
    );

    await act(async () => {
      await result.current.handleExportCSV();
    });

    expect(saveMock).toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(result.current.exportState.isOpen).toBe(false);
  });

  it("handleExportCSV opens the modal, invokes the backend, and reports completion", async () => {
    saveMock.mockResolvedValue("/tmp/export/result_1.csv");
    invokeMock.mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useExportFlow({
        activeTab: makeTab({ query: "SELECT 1" }),
        activeConnectionId: "conn-1",
        activeDriver: "postgres",
        schemasEnabled: false,
        csvDelimiter: ";",
      }),
    );

    await act(async () => {
      await result.current.handleExportCSV();
    });

    expect(invokeMock).toHaveBeenCalledWith("export_query_to_file", {
      connectionId: "conn-1",
      query: "SELECT 1",
      filePath: "/tmp/export/result_1.csv",
      format: "csv",
      csvDelimiter: ";",
    });
    expect(result.current.exportState.isOpen).toBe(true);
    expect(result.current.exportState.status).toBe("completed");
    expect(result.current.exportState.fileName).toBe("result_1.csv");
    expect(result.current.exportMenuOpen).toBe(false);
  });

  it("handleExportJSON omits csvDelimiter and uses the json format", async () => {
    saveMock.mockResolvedValue("/tmp/result.json");
    invokeMock.mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useExportFlow({
        activeTab: makeTab({ query: "SELECT 1" }),
        activeConnectionId: "conn-1",
        activeDriver: null,
        schemasEnabled: false,
        csvDelimiter: ",",
      }),
    );

    await act(async () => {
      await result.current.handleExportJSON();
    });

    expect(invokeMock).toHaveBeenCalledWith("export_query_to_file", {
      connectionId: "conn-1",
      query: "SELECT 1",
      filePath: "/tmp/result.json",
      format: "json",
      csvDelimiter: undefined,
    });
    expect(result.current.exportState.status).toBe("completed");
  });

  it("sets status to error when the backend rejects", async () => {
    saveMock.mockResolvedValue("/tmp/result.csv");
    invokeMock.mockRejectedValueOnce(new Error("disk full"));

    const { result } = renderHook(() =>
      useExportFlow({
        activeTab: makeTab({ query: "SELECT 1" }),
        activeConnectionId: "conn-1",
        activeDriver: null,
        schemasEnabled: false,
        csvDelimiter: ",",
      }),
    );

    await act(async () => {
      await result.current.handleExportCSV();
    });

    expect(result.current.exportState.status).toBe("error");
    expect(result.current.exportState.errorMessage).toContain("disk full");
  });

  it("does not invoke export when the resolved query is empty", async () => {
    const { result } = renderHook(() =>
      useExportFlow({
        activeTab: makeTab({ query: "   " }),
        activeConnectionId: "conn-1",
        activeDriver: null,
        schemasEnabled: false,
        csvDelimiter: ",",
      }),
    );

    await act(async () => {
      await result.current.handleExportCSV();
    });

    expect(saveMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
