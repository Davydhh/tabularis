import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useTabScroll } from "../../src/hooks/useTabScroll";

interface FakeTab {
  id: string;
}

function attachScrollContainer(
  ref: React.RefObject<HTMLDivElement | null>,
  options: {
    childCount: number;
    scrollLeft: number;
    clientWidth: number;
    scrollWidth: number;
  },
) {
  const container = document.createElement("div");
  for (let i = 0; i < options.childCount; i += 1) {
    const child = document.createElement("div");
    child.scrollIntoView = vi.fn();
    container.appendChild(child);
  }
  Object.defineProperty(container, "scrollLeft", {
    configurable: true,
    value: options.scrollLeft,
  });
  Object.defineProperty(container, "clientWidth", {
    configurable: true,
    value: options.clientWidth,
  });
  Object.defineProperty(container, "scrollWidth", {
    configurable: true,
    value: options.scrollWidth,
  });
  (ref as { current: HTMLDivElement | null }).current = container;
  return container;
}

describe("useTabScroll", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes with both arrows disabled", () => {
    const { result } = renderHook(() =>
      useTabScroll<FakeTab>({
        tabs: [],
        activeTabId: null,
        setActiveTabId: () => {},
      }),
    );

    expect(result.current.canScrollLeft).toBe(false);
    expect(result.current.canScrollRight).toBe(false);
  });

  it("reflects scrollable state when updateScrollArrows runs", () => {
    const { result } = renderHook(() =>
      useTabScroll<FakeTab>({
        tabs: [{ id: "a" }],
        activeTabId: null,
        setActiveTabId: () => {},
      }),
    );

    attachScrollContainer(result.current.tabScrollRef, {
      childCount: 1,
      scrollLeft: 50,
      clientWidth: 100,
      scrollWidth: 500,
    });

    act(() => {
      result.current.updateScrollArrows();
    });

    expect(result.current.canScrollLeft).toBe(true);
    expect(result.current.canScrollRight).toBe(true);
  });

  it("disables both arrows when content fits the container", () => {
    const { result } = renderHook(() =>
      useTabScroll<FakeTab>({
        tabs: [{ id: "a" }],
        activeTabId: null,
        setActiveTabId: () => {},
      }),
    );

    attachScrollContainer(result.current.tabScrollRef, {
      childCount: 1,
      scrollLeft: 0,
      clientWidth: 200,
      scrollWidth: 200,
    });

    act(() => {
      result.current.updateScrollArrows();
    });

    expect(result.current.canScrollLeft).toBe(false);
    expect(result.current.canScrollRight).toBe(false);
  });

  it("scrollTabs activates the adjacent tab in the given direction", () => {
    const tabs: FakeTab[] = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const setActiveTabId = vi.fn();

    const { result } = renderHook(() =>
      useTabScroll<FakeTab>({ tabs, activeTabId: "b", setActiveTabId }),
    );

    attachScrollContainer(result.current.tabScrollRef, {
      childCount: 3,
      scrollLeft: 0,
      clientWidth: 100,
      scrollWidth: 300,
    });

    act(() => {
      result.current.scrollTabs("right");
    });

    expect(setActiveTabId).toHaveBeenCalledWith("c");

    act(() => {
      result.current.scrollTabs("left");
    });

    expect(setActiveTabId).toHaveBeenLastCalledWith("a");
  });

  it("scrollTabs is a no-op at the boundary", () => {
    const tabs: FakeTab[] = [{ id: "a" }, { id: "b" }];
    const setActiveTabId = vi.fn();

    const { result } = renderHook(() =>
      useTabScroll<FakeTab>({ tabs, activeTabId: "a", setActiveTabId }),
    );

    act(() => {
      result.current.scrollTabs("left");
    });

    expect(setActiveTabId).not.toHaveBeenCalled();
  });

  it("scrolls the activated tab into view", () => {
    const tabs: FakeTab[] = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const setActiveTabId = vi.fn();

    const { result } = renderHook(() =>
      useTabScroll<FakeTab>({ tabs, activeTabId: "a", setActiveTabId }),
    );

    const container = attachScrollContainer(result.current.tabScrollRef, {
      childCount: 3,
      scrollLeft: 0,
      clientWidth: 100,
      scrollWidth: 300,
    });

    act(() => {
      result.current.scrollTabs("right");
    });

    const targetChild = container.children[1] as HTMLElement;
    expect(targetChild.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  });

  it("scrolls the active tab into view when activeTabId changes", () => {
    const tabs: FakeTab[] = [{ id: "a" }, { id: "b" }];

    const { result, rerender } = renderHook(
      ({ activeTabId }: { activeTabId: string | null }) =>
        useTabScroll<FakeTab>({ tabs, activeTabId, setActiveTabId: () => {} }),
      { initialProps: { activeTabId: "a" as string | null } },
    );

    const container = attachScrollContainer(result.current.tabScrollRef, {
      childCount: 2,
      scrollLeft: 0,
      clientWidth: 100,
      scrollWidth: 200,
    });

    rerender({ activeTabId: "b" });

    const target = container.children[1] as HTMLElement;
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  });
});
