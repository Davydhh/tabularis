import { useState, useRef, useCallback } from "react";
import { computeResizeHeight, type ResizeBounds } from "../utils/editorResize";

const DEFAULT_HEIGHT = 300;
const RESIZE_BOUNDS: ResizeBounds = {
  offsetTop: 50,
  minHeight: 100,
  bottomMargin: 150,
};
const PANEL_SELECTOR = "[data-editor-panel]";

export const useEditorResize = (initialHeight = DEFAULT_HEIGHT) => {
  const [editorHeight, setEditorHeight] = useState(initialHeight);
  const editorHeightRef = useRef(initialHeight);
  const isDragging = useRef(false);
  const rafRef = useRef<number | null>(null);

  const startResize = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = "row-resize";

    // Overlay prevents the code editor from capturing mouse events during drag.
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:9999;cursor:row-resize";
    document.body.appendChild(overlay);

    const panels = document.querySelectorAll<HTMLElement>(PANEL_SELECTOR);

    const handleResize = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newHeight = computeResizeHeight(
        e.clientY,
        window.innerHeight,
        RESIZE_BOUNDS,
      );
      if (newHeight === null) return;
      editorHeightRef.current = newHeight;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        panels.forEach((el) => {
          el.style.height = `${newHeight}px`;
        });
      });
    };

    const stopResize = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      overlay.remove();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setEditorHeight(editorHeightRef.current);
      document.removeEventListener("mousemove", handleResize);
      document.removeEventListener("mouseup", stopResize);
    };

    document.addEventListener("mousemove", handleResize);
    document.addEventListener("mouseup", stopResize);
  }, []);

  return { editorHeight, startResize };
};
