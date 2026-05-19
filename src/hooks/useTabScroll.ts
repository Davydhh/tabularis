import { useState, useRef, useEffect, useCallback } from "react";
import {
  getTabScrollState,
  getAdjacentTabIndex,
  type TabLike,
} from "../utils/tabScroll";

interface UseTabScrollParams<T extends TabLike> {
  tabs: T[];
  activeTabId: string | null;
  setActiveTabId: (id: string | null) => void;
}

export function useTabScroll<T extends TabLike>({
  tabs,
  activeTabId,
  setActiveTabId,
}: UseTabScrollParams<T>) {
  const tabScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollArrows = useCallback(() => {
    const el = tabScrollRef.current;
    if (!el) return;
    const state = getTabScrollState(el);
    setCanScrollLeft(state.canScrollLeft);
    setCanScrollRight(state.canScrollRight);
  }, []);

  useEffect(() => {
    const el = tabScrollRef.current;
    if (!el || !activeTabId) return;
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    if (idx === -1) return;
    const tabEl = el.children[idx] as HTMLElement | undefined;
    tabEl?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeTabId, tabs]);

  useEffect(() => {
    updateScrollArrows();
  }, [tabs, updateScrollArrows]);

  const scrollTabs = useCallback(
    (direction: "left" | "right") => {
      const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
      const targetIndex = getAdjacentTabIndex(
        currentIndex,
        tabs.length,
        direction,
      );
      if (targetIndex === null) return;
      const targetTab = tabs[targetIndex];
      setActiveTabId(targetTab.id);
      const el = tabScrollRef.current;
      if (!el) return;
      const tabEl = el.children[targetIndex] as HTMLElement | undefined;
      tabEl?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    },
    [tabs, activeTabId, setActiveTabId],
  );

  return {
    tabScrollRef,
    canScrollLeft,
    canScrollRight,
    updateScrollArrows,
    scrollTabs,
  };
}
