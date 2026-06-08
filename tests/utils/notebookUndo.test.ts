import { describe, it, expect } from "vitest";
import type { NotebookState } from "../../src/types/notebook";
import {
  createHistory,
  documentSignature,
  recordEdit,
  undo,
  redo,
  HISTORY_LIMIT,
  COALESCE_MS,
} from "../../src/utils/notebookUndo";

function state(content: string, extra: Partial<NotebookState> = {}): NotebookState {
  return { cells: [{ id: "c1", type: "sql", content }], ...extra };
}

describe("notebookUndo", () => {
  describe("documentSignature", () => {
    it("ignores runtime fields (results, loading, errors)", () => {
      const a = state("SELECT 1");
      const b: NotebookState = {
        cells: [
          {
            id: "c1",
            type: "sql",
            content: "SELECT 1",
            result: { columns: ["x"], rows: [[1]] } as never,
            isLoading: true,
            error: "boom",
            executionTime: 42,
          },
        ],
      };
      expect(documentSignature(a)).toBe(documentSignature(b));
    });

    it("changes when content changes", () => {
      expect(documentSignature(state("SELECT 1"))).not.toBe(
        documentSignature(state("SELECT 2")),
      );
    });

    it("changes when params or stopOnError change", () => {
      expect(documentSignature(state("X"))).not.toBe(
        documentSignature(state("X", { stopOnError: true })),
      );
      expect(documentSignature(state("X"))).not.toBe(
        documentSignature(state("X", { params: [{ name: "p", value: "1" }] })),
      );
    });
  });

  describe("recordEdit", () => {
    it("does not record runtime-only changes", () => {
      const h = createHistory();
      const prev = state("SELECT 1");
      const next: NotebookState = {
        cells: [{ id: "c1", type: "sql", content: "SELECT 1", isLoading: true }],
      };
      const result = recordEdit(h, prev, next, 1000);
      expect(result.past).toHaveLength(0);
    });

    it("records a document change outside the coalesce window", () => {
      let h = createHistory();
      h = recordEdit(h, state("a"), state("ab"), 1000);
      expect(h.past).toHaveLength(1);
      expect(h.past[0].cells[0].content).toBe("a");
    });

    it("coalesces edits within the window into one step", () => {
      let h = createHistory();
      h = recordEdit(h, state("a"), state("ab"), 1000);
      h = recordEdit(h, state("ab"), state("abc"), 1000 + COALESCE_MS - 1);
      expect(h.past).toHaveLength(1); // still just the pre-burst state
      expect(h.past[0].cells[0].content).toBe("a");
    });

    it("starts a new step after the coalesce window elapses", () => {
      let h = createHistory();
      h = recordEdit(h, state("a"), state("ab"), 1000);
      h = recordEdit(h, state("ab"), state("abc"), 1000 + COALESCE_MS + 1);
      expect(h.past).toHaveLength(2);
    });

    it("clears the redo stack on a fresh edit", () => {
      let h = createHistory();
      h = recordEdit(h, state("a"), state("ab"), 1000);
      const undone = undo(h, state("ab"))!;
      expect(undone.history.future).toHaveLength(1);
      const after = recordEdit(undone.history, state("a"), state("ax"), 5000);
      expect(after.future).toHaveLength(0);
    });

    it("caps the history at HISTORY_LIMIT", () => {
      let h = createHistory();
      let t = 0;
      for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
        t += COALESCE_MS + 1;
        h = recordEdit(h, state(`v${i}`), state(`v${i}x`), t);
      }
      expect(h.past).toHaveLength(HISTORY_LIMIT);
    });
  });

  describe("undo / redo", () => {
    it("undo returns null when there is nothing to undo", () => {
      expect(undo(createHistory(), state("a"))).toBeNull();
    });

    it("redo returns null when there is nothing to redo", () => {
      expect(redo(createHistory(), state("a"))).toBeNull();
    });

    it("round-trips through undo then redo", () => {
      let h = createHistory();
      h = recordEdit(h, state("a"), state("ab"), 1000);

      const undone = undo(h, state("ab"))!;
      expect(undone.state.cells[0].content).toBe("a");
      expect(undone.history.past).toHaveLength(0);
      expect(undone.history.future).toHaveLength(1);

      const redone = redo(undone.history, undone.state)!;
      expect(redone.state.cells[0].content).toBe("ab");
      expect(redone.history.past).toHaveLength(1);
      expect(redone.history.future).toHaveLength(0);
    });

    it("walks back through multiple steps", () => {
      let h = createHistory();
      h = recordEdit(h, state("a"), state("b"), 1000);
      h = recordEdit(h, state("b"), state("c"), 1000 + COALESCE_MS + 1);

      const u1 = undo(h, state("c"))!;
      expect(u1.state.cells[0].content).toBe("b");
      const u2 = undo(u1.history, u1.state)!;
      expect(u2.state.cells[0].content).toBe("a");
      expect(undo(u2.history, u2.state)).toBeNull();
    });
  });
});
