import type { NotebookState } from "../types/notebook";

/** Maximum number of undo steps kept in memory. */
export const HISTORY_LIMIT = 50;
/** Consecutive edits within this window collapse into a single undo step. */
export const COALESCE_MS = 500;

export interface NotebookHistory {
  past: NotebookState[];
  future: NotebookState[];
  /** Timestamp of the last recorded edit, used to coalesce rapid typing. */
  lastEditTime: number;
}

export function createHistory(): NotebookHistory {
  return { past: [], future: [], lastEditTime: 0 };
}

/**
 * Signature of the *editable document* — excludes runtime fields (results,
 * errors, loading, execution timings) so running a cell never creates an undo
 * step, only genuine content/structure changes do.
 */
export function documentSignature(state: NotebookState): string {
  return JSON.stringify({
    cells: state.cells.map((c) => ({
      type: c.type,
      content: c.content,
      name: c.name ?? null,
      schema: c.schema ?? null,
      isParallel: !!c.isParallel,
      isCollapsed: !!c.isCollapsed,
      chartConfig: c.chartConfig ?? null,
    })),
    params: state.params ?? [],
    stopOnError: !!state.stopOnError,
  });
}

/**
 * Record a `prev -> next` transition. Returns a new history (or the same one
 * when nothing should be recorded):
 * - runtime-only changes (identical document signature) are ignored;
 * - edits within {@link COALESCE_MS} of the previous one merge into the current
 *   step so a burst of typing is undone in one go.
 */
export function recordEdit(
  history: NotebookHistory,
  prev: NotebookState,
  next: NotebookState,
  now: number,
): NotebookHistory {
  if (documentSignature(prev) === documentSignature(next)) {
    return history;
  }
  const withinBurst = now - history.lastEditTime < COALESCE_MS;
  if (withinBurst) {
    return { ...history, lastEditTime: now };
  }
  const past = [...history.past, prev];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, future: [], lastEditTime: now };
}

export interface HistoryStep {
  history: NotebookHistory;
  state: NotebookState;
}

/** Step back one edit. Returns null when there's nothing to undo. */
export function undo(
  history: NotebookHistory,
  current: NotebookState,
): HistoryStep | null {
  if (history.past.length === 0) return null;
  const past = [...history.past];
  const state = past.pop() as NotebookState;
  return {
    history: { past, future: [current, ...history.future], lastEditTime: 0 },
    state,
  };
}

/** Step forward one edit. Returns null when there's nothing to redo. */
export function redo(
  history: NotebookHistory,
  current: NotebookState,
): HistoryStep | null {
  if (history.future.length === 0) return null;
  const [state, ...future] = history.future;
  return {
    history: { past: [...history.past, current], future, lastEditTime: 0 },
    state,
  };
}
