import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useEditorResize } from "../../src/hooks/useEditorResize";

describe("useEditorResize", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
    document.body.style.cursor = "";
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      },
    );
    vi.stubGlobal("cancelAnimationFrame", () => {});
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initializes with the default height (300)", () => {
    const { result } = renderHook(() => useEditorResize());
    expect(result.current.editorHeight).toBe(300);
  });

  it("accepts a custom initial height", () => {
    const { result } = renderHook(() => useEditorResize(420));
    expect(result.current.editorHeight).toBe(420);
  });

  it("sets the body cursor and creates an overlay on startResize", () => {
    const { result } = renderHook(() => useEditorResize());
    const childrenBefore = document.body.children.length;

    act(() => {
      result.current.startResize();
    });

    expect(document.body.style.cursor).toBe("row-resize");
    expect(document.body.children.length).toBe(childrenBefore + 1);
    const overlay = document.body.lastElementChild as HTMLElement;
    expect(overlay.tagName).toBe("DIV");
    expect(overlay.style.cssText).toContain("row-resize");
  });

  it("commits the new height on mouseup when the pointer is within bounds", () => {
    const { result } = renderHook(() => useEditorResize());
    const childrenBefore = document.body.children.length;

    act(() => {
      result.current.startResize();
    });

    // clientY 400 - offsetTop 50 = 350px (>100 min, <800-150 bottom)
    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientY: 400 }));
    });

    // Height is only committed to state on mouseup
    expect(result.current.editorHeight).toBe(300);

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });

    expect(result.current.editorHeight).toBe(350);
    expect(document.body.style.cursor).toBe("");
    expect(document.body.children.length).toBe(childrenBefore);
  });

  it("ignores moves outside the allowed bounds", () => {
    const { result } = renderHook(() => useEditorResize());

    act(() => {
      result.current.startResize();
    });

    // clientY 120 - offsetTop 50 = 70px, below minHeight (100) -> ignored
    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientY: 120 }));
    });
    // clientY 700 - offsetTop 50 = 650px, >= 800 - 150 = 650 -> ignored
    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientY: 700 }));
    });

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });

    expect(result.current.editorHeight).toBe(300);
  });

  it("applies the new height to elements matching [data-editor-panel]", () => {
    const panel = document.createElement("div");
    panel.setAttribute("data-editor-panel", "");
    document.body.appendChild(panel);

    const { result } = renderHook(() => useEditorResize());

    act(() => {
      result.current.startResize();
    });

    // clientY 300 - offsetTop 50 = 250px
    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientY: 300 }));
    });

    expect(panel.style.height).toBe("250px");
  });

  it("does not commit further height changes after mouseup", () => {
    const { result } = renderHook(() => useEditorResize());

    act(() => {
      result.current.startResize();
    });

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientY: 400 }));
      document.dispatchEvent(new MouseEvent("mouseup"));
    });

    expect(result.current.editorHeight).toBe(350);

    // After stop, listeners are detached so subsequent moves are no-ops.
    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientY: 500 }));
    });

    expect(result.current.editorHeight).toBe(350);
  });
});
