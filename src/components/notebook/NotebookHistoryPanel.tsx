import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { History, X, Check } from "lucide-react";
import type { NotebookState } from "../../types/notebook";

interface NotebookHistoryPanelProps {
  /** Full timeline, oldest first. */
  states: NotebookState[];
  currentIndex: number;
  onJump: (index: number) => void;
  onClose: () => void;
}

/** Short preview of a notebook version for the history list. */
function previewOf(state: NotebookState): string {
  const firstWithContent = state.cells.find((c) => c.content.trim().length > 0);
  const snippet = firstWithContent?.content.trim().split("\n")[0]?.slice(0, 60);
  return snippet || "—";
}

export function NotebookHistoryPanel({
  states,
  currentIndex,
  onJump,
  onClose,
}: NotebookHistoryPanelProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className="absolute right-2 top-12 z-40 w-72 max-h-[60vh] flex flex-col bg-elevated border border-strong rounded-lg shadow-2xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-default bg-base">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <History size={14} className="text-secondary" />
          {t("editor.notebook.history.title")}
        </div>
        <button
          onClick={onClose}
          className="text-secondary hover:text-primary transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="overflow-y-auto py-1">
        {/* Newest first */}
        {states
          .map((state, index) => ({ state, index }))
          .reverse()
          .map(({ state, index }) => {
            const isCurrent = index === currentIndex;
            return (
              <button
                key={index}
                onClick={() => {
                  if (!isCurrent) onJump(index);
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                  isCurrent
                    ? "bg-blue-500/10 text-primary cursor-default"
                    : "text-secondary hover:bg-surface-secondary hover:text-primary"
                }`}
              >
                <span className="w-4 shrink-0 text-center">
                  {isCurrent ? (
                    <Check size={12} className="text-blue-400" />
                  ) : (
                    <span className="text-[10px] text-muted">{index + 1}</span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-mono">
                    {previewOf(state)}
                  </span>
                  <span className="block text-[10px] text-muted">
                    {t("editor.notebook.history.cellCount", {
                      n: state.cells.length,
                    })}
                  </span>
                </span>
              </button>
            );
          })}
      </div>
    </div>
  );
}
