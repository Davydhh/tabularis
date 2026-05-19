import { describe, it, expect } from "vitest";
import type {
  PendingInsertion,
  QueryResult,
  TableColumn,
} from "../../src/types/editor";
import {
  addMultiplePendingDeletions,
  addPendingDeletion,
  buildDuplicateInsertion,
  cleanupSubmittedPending,
  computeDeletionsForSelection,
  computeSubmitOperations,
  hasAnyPendingChanges,
  removePendingDeletion,
  removePendingInsertion,
  rollbackPendingForSelection,
  selectionHasPendingChanges,
  togglePendingChange,
  updatePendingInsertionField,
  type PendingChangesMap,
  type PendingDeletionsMap,
  type PendingInsertionsMap,
  type PendingTabSlice,
} from "../../src/utils/pendingChanges";

const makeColumn = (overrides: Partial<TableColumn> = {}): TableColumn => ({
  name: "col",
  data_type: "text",
  is_pk: false,
  is_nullable: false,
  is_auto_increment: false,
  ...overrides,
});

const makeResult = (
  columns: string[],
  rows: unknown[][],
): QueryResult => ({
  columns,
  rows,
  affected_rows: rows.length,
});

const makeInsertion = (
  tempId: string,
  data: Record<string, unknown> = {},
  displayIndex = 0,
): PendingInsertion => ({ tempId, data, displayIndex });

describe("pendingChanges", () => {
  describe("togglePendingChange", () => {
    it("creates a new row entry on first edit", () => {
      const next = togglePendingChange(undefined, 1, "name", "Alice");
      expect(next).toEqual({
        "1": { pkOriginalValue: 1, changes: { name: "Alice" } },
      });
    });

    it("merges a new cell into an existing row entry", () => {
      const base: PendingChangesMap = {
        "1": { pkOriginalValue: 1, changes: { name: "Alice" } },
      };
      const next = togglePendingChange(base, 1, "age", 30);
      expect(next["1"].changes).toEqual({ name: "Alice", age: 30 });
    });

    it("overwrites an existing cell value", () => {
      const base: PendingChangesMap = {
        "1": { pkOriginalValue: 1, changes: { name: "Alice" } },
      };
      const next = togglePendingChange(base, 1, "name", "Bob");
      expect(next["1"].changes).toEqual({ name: "Bob" });
    });

    it("clears a cell when value is undefined", () => {
      const base: PendingChangesMap = {
        "1": { pkOriginalValue: 1, changes: { name: "Alice", age: 30 } },
      };
      const next = togglePendingChange(base, 1, "name", undefined);
      expect(next["1"].changes).toEqual({ age: 30 });
    });

    it("drops the row entry when the last cell is cleared", () => {
      const base: PendingChangesMap = {
        "1": { pkOriginalValue: 1, changes: { name: "Alice" } },
      };
      const next = togglePendingChange(base, 1, "name", undefined);
      expect(next).toEqual({});
    });

    it("uses String(pkVal) as the map key", () => {
      const next = togglePendingChange(undefined, 42, "x", "y");
      expect(Object.keys(next)).toEqual(["42"]);
      expect(next["42"].pkOriginalValue).toBe(42);
    });

    it("does not mutate the input", () => {
      const base: PendingChangesMap = {
        "1": { pkOriginalValue: 1, changes: { name: "A" } },
      };
      const snapshot = JSON.parse(JSON.stringify(base));
      togglePendingChange(base, 1, "name", "B");
      expect(base).toEqual(snapshot);
    });
  });

  describe("updatePendingInsertionField", () => {
    it("updates a cell on an existing insertion", () => {
      const base: PendingInsertionsMap = {
        t1: makeInsertion("t1", { name: "Alice" }),
      };
      const next = updatePendingInsertionField(base, "t1", "name", "Bob");
      expect(next.t1.data).toEqual({ name: "Bob" });
    });

    it("clears a cell when value is undefined", () => {
      const base: PendingInsertionsMap = {
        t1: makeInsertion("t1", { name: "Alice", age: 30 }),
      };
      const next = updatePendingInsertionField(base, "t1", "age", undefined);
      expect(next.t1.data).toEqual({ name: "Alice" });
    });

    it("returns the input unchanged when tempId is missing", () => {
      const base: PendingInsertionsMap = {
        t1: makeInsertion("t1", { name: "A" }),
      };
      const next = updatePendingInsertionField(base, "missing", "x", "y");
      expect(next).toBe(base);
    });
  });

  describe("removePendingInsertion", () => {
    it("removes an existing tempId", () => {
      const base: PendingInsertionsMap = {
        t1: makeInsertion("t1"),
        t2: makeInsertion("t2"),
      };
      const next = removePendingInsertion(base, "t1");
      expect(Object.keys(next)).toEqual(["t2"]);
    });

    it("returns input unchanged when tempId is absent", () => {
      const base: PendingInsertionsMap = { t1: makeInsertion("t1") };
      const next = removePendingInsertion(base, "missing");
      expect(next).toBe(base);
    });
  });

  describe("addPendingDeletion / addMultiplePendingDeletions", () => {
    it("adds a single deletion", () => {
      const next = addPendingDeletion(undefined, 5);
      expect(next).toEqual({ "5": 5 });
    });

    it("overwrites an existing pk value", () => {
      const base = { "5": "old" };
      const next = addPendingDeletion(base, 5);
      expect(next).toEqual({ "5": 5 });
    });

    it("adds multiple deletions in one pass", () => {
      const next = addMultiplePendingDeletions({ "1": 1 }, [2, 3]);
      expect(next).toEqual({ "1": 1, "2": 2, "3": 3 });
    });
  });

  describe("removePendingDeletion", () => {
    it("returns undefined when the last entry is removed", () => {
      const next = removePendingDeletion({ "5": 5 }, 5);
      expect(next).toBeUndefined();
    });

    it("returns the remaining map when other entries persist", () => {
      const next = removePendingDeletion({ "5": 5, "6": 6 }, 5);
      expect(next).toEqual({ "6": 6 });
    });

    it("returns undefined for an empty input", () => {
      expect(removePendingDeletion(undefined, 1)).toBeUndefined();
      expect(removePendingDeletion({}, 1)).toBeUndefined();
    });

    it("preserves the map when the pk is not present", () => {
      const base: PendingDeletionsMap = { "5": 5 };
      const next = removePendingDeletion(base, 99);
      expect(next).toBe(base);
    });
  });

  describe("hasAnyPendingChanges", () => {
    it("is false for an empty tab", () => {
      expect(hasAnyPendingChanges({})).toBe(false);
    });

    it("is true for any single non-empty pending field", () => {
      expect(
        hasAnyPendingChanges({
          pendingChanges: { "1": { pkOriginalValue: 1, changes: { a: 1 } } },
        }),
      ).toBe(true);
      expect(hasAnyPendingChanges({ pendingDeletions: { "1": 1 } })).toBe(true);
      expect(
        hasAnyPendingChanges({
          pendingInsertions: { t1: makeInsertion("t1") },
        }),
      ).toBe(true);
    });
  });

  describe("selectionHasPendingChanges", () => {
    it("falls back to hasAnyPendingChanges when no selection", () => {
      expect(
        selectionHasPendingChanges({
          pendingDeletions: { "1": 1 },
          selectedRows: [],
        }),
      ).toBe(true);
      expect(selectionHasPendingChanges({ selectedRows: [] })).toBe(false);
    });

    it("returns true when a selected existing row has a pending change", () => {
      const result = makeResult(["id", "name"], [[1, "Alice"], [2, "Bob"]]);
      expect(
        selectionHasPendingChanges({
          selectedRows: [0],
          result,
          pkColumn: "id",
          pendingChanges: {
            "1": { pkOriginalValue: 1, changes: { name: "X" } },
          },
        }),
      ).toBe(true);
    });

    it("returns true when a selected existing row is pending deletion", () => {
      const result = makeResult(["id", "name"], [[1, "Alice"], [2, "Bob"]]);
      expect(
        selectionHasPendingChanges({
          selectedRows: [1],
          result,
          pkColumn: "id",
          pendingDeletions: { "2": 2 },
        }),
      ).toBe(true);
    });

    it("returns true when a selected insertion row exists", () => {
      const result = makeResult(["id", "name"], [[1, "Alice"]]);
      expect(
        selectionHasPendingChanges({
          selectedRows: [1],
          result,
          pkColumn: "id",
          pendingInsertions: { t1: makeInsertion("t1", { name: "X" }, 1) },
        }),
      ).toBe(true);
    });

    it("returns false when selected rows are clean", () => {
      const result = makeResult(["id", "name"], [[1, "Alice"], [2, "Bob"]]);
      expect(
        selectionHasPendingChanges({
          selectedRows: [0],
          result,
          pkColumn: "id",
          pendingChanges: {
            "2": { pkOriginalValue: 2, changes: { name: "X" } },
          },
        }),
      ).toBe(false);
    });

    it("returns false when there is no pkColumn for existing-row selection", () => {
      const result = makeResult(["id", "name"], [[1, "Alice"]]);
      expect(
        selectionHasPendingChanges({
          selectedRows: [0],
          result,
          pendingChanges: {
            "1": { pkOriginalValue: 1, changes: { name: "X" } },
          },
        }),
      ).toBe(false);
    });
  });

  describe("computeDeletionsForSelection", () => {
    it("marks selected existing rows for deletion", () => {
      const result = makeResult(["id", "name"], [[1, "A"], [2, "B"]]);
      const out = computeDeletionsForSelection({
        result,
        pkColumn: "id",
        selectedRows: [0, 1],
      });
      expect(out.pendingDeletions).toEqual({ "1": 1, "2": 2 });
      expect(out.pendingInsertions).toEqual({});
    });

    it("removes selected insertion rows", () => {
      const result = makeResult(["id"], [[1]]);
      const insertions: PendingInsertionsMap = {
        t1: makeInsertion("t1", {}, 1),
        t2: makeInsertion("t2", {}, 2),
      };
      const out = computeDeletionsForSelection({
        result,
        pkColumn: "id",
        pendingInsertions: insertions,
        selectedRows: [1],
      });
      expect(out.pendingInsertions).toEqual({ t2: insertions.t2 });
      expect(out.pendingDeletions).toEqual({});
    });

    it("handles a mixed selection of existing and insertion rows", () => {
      const result = makeResult(["id"], [[1]]);
      const insertions: PendingInsertionsMap = {
        t1: makeInsertion("t1", {}, 1),
      };
      const out = computeDeletionsForSelection({
        result,
        pkColumn: "id",
        pendingInsertions: insertions,
        selectedRows: [0, 1],
      });
      expect(out.pendingDeletions).toEqual({ "1": 1 });
      expect(out.pendingInsertions).toEqual({});
    });
  });

  describe("buildDuplicateInsertion", () => {
    it("clones the row and nulls auto-increment columns", () => {
      const out = buildDuplicateInsertion(
        { id: 1, name: "Alice" },
        ["id"],
        undefined,
        3,
        () => "fake-id",
      );
      expect(out.tempId).toBe("fake-id");
      expect(out.pendingInsertions["fake-id"].data).toEqual({
        id: null,
        name: "Alice",
      });
      expect(out.pendingInsertions["fake-id"].displayIndex).toBe(3);
    });

    it("computes displayIndex from existing rows + insertion count", () => {
      const existing: PendingInsertionsMap = {
        a: makeInsertion("a", {}, 5),
        b: makeInsertion("b", {}, 6),
      };
      const out = buildDuplicateInsertion(
        { x: 1 },
        [],
        existing,
        5,
        () => "c",
      );
      expect(out.pendingInsertions.c.displayIndex).toBe(7);
    });

    it("uses a real tempId factory by default", () => {
      const out = buildDuplicateInsertion({ x: 1 }, [], undefined, 0);
      expect(out.tempId).toMatch(/^temp_/);
    });
  });

  describe("computeSubmitOperations", () => {
    const columns: TableColumn[] = [
      makeColumn({ name: "id", is_pk: true, is_auto_increment: true }),
      makeColumn({ name: "name" }),
    ];

    it("emits all updates / deletions / insertions when applyToAll is true", () => {
      const tab: PendingTabSlice = {
        result: makeResult(["id", "name"], [[1, "A"], [2, "B"]]),
        pkColumn: "id",
        pendingChanges: {
          "1": { pkOriginalValue: 1, changes: { name: "AA" } },
          "2": { pkOriginalValue: 2, changes: { name: "BB" } },
        },
        pendingDeletions: { "2": 2 },
        pendingInsertions: {
          t1: makeInsertion("t1", { name: "C" }, 2),
        },
        selectedRows: [0],
      };
      const ops = computeSubmitOperations(tab, true, columns);
      expect(ops.updates).toHaveLength(2);
      expect(ops.deletions).toEqual([2]);
      expect(ops.insertions).toHaveLength(1);
    });

    it("filters by selection when applyToAll is false", () => {
      const tab: PendingTabSlice = {
        result: makeResult(["id", "name"], [[1, "A"], [2, "B"]]),
        pkColumn: "id",
        pendingChanges: {
          "1": { pkOriginalValue: 1, changes: { name: "AA" } },
          "2": { pkOriginalValue: 2, changes: { name: "BB" } },
        },
        selectedRows: [0],
      };
      const ops = computeSubmitOperations(tab, false, columns);
      expect(ops.updates).toEqual([
        { pkVal: 1, colName: "name", newVal: "AA" },
      ]);
    });

    it("filters insertions by displayIndex when there is a selection", () => {
      const tab: PendingTabSlice = {
        result: makeResult(["id", "name"], [[1, "A"]]),
        pkColumn: "id",
        pendingInsertions: {
          t1: makeInsertion("t1", { name: "X" }, 1),
          t2: makeInsertion("t2", { name: "Y" }, 2),
        },
        selectedRows: [2],
      };
      const ops = computeSubmitOperations(tab, false, columns);
      expect(ops.insertions.map((i) => i.tempId)).toEqual(["t2"]);
    });

    it("flags invalid insertions instead of emitting them", () => {
      const cols: TableColumn[] = [
        makeColumn({ name: "id", is_pk: true, is_auto_increment: true }),
        makeColumn({ name: "name", is_nullable: false }),
      ];
      const tab: PendingTabSlice = {
        result: makeResult(["id", "name"], []),
        pkColumn: "id",
        pendingInsertions: {
          t1: makeInsertion("t1", { name: "" }, 0),
        },
      };
      const ops = computeSubmitOperations(tab, true, cols);
      expect(ops.insertions).toHaveLength(0);
      expect(ops.invalidInsertions).toHaveLength(1);
      expect(ops.invalidInsertions[0].tempId).toBe("t1");
    });

    it("skips updates and deletions when pkColumn is missing", () => {
      const tab: PendingTabSlice = {
        result: makeResult(["a"], [["x"]]),
        pendingChanges: {
          "1": { pkOriginalValue: 1, changes: { a: "y" } },
        },
        pendingDeletions: { "1": 1 },
      };
      const ops = computeSubmitOperations(tab, true, columns);
      expect(ops.updates).toEqual([]);
      expect(ops.deletions).toEqual([]);
    });
  });

  describe("rollbackPendingForSelection", () => {
    it("clears everything when applyToAll is true", () => {
      const out = rollbackPendingForSelection(
        {
          pendingChanges: {
            "1": { pkOriginalValue: 1, changes: { a: 1 } },
          },
          pendingDeletions: { "2": 2 },
          pendingInsertions: { t1: makeInsertion("t1") },
          selectedRows: [0],
          result: makeResult(["id"], [[1]]),
          pkColumn: "id",
        },
        true,
      );
      expect(out.pendingChanges).toBeUndefined();
      expect(out.pendingDeletions).toBeUndefined();
      expect(out.pendingInsertions).toBeUndefined();
    });

    it("clears everything when there is no selection", () => {
      const out = rollbackPendingForSelection(
        {
          pendingChanges: {
            "1": { pkOriginalValue: 1, changes: { a: 1 } },
          },
        },
        false,
      );
      expect(out.pendingChanges).toBeUndefined();
    });

    it("rolls back only selected existing rows by pk", () => {
      const result = makeResult(["id"], [[1], [2]]);
      const out = rollbackPendingForSelection(
        {
          pendingChanges: {
            "1": { pkOriginalValue: 1, changes: { a: 1 } },
            "2": { pkOriginalValue: 2, changes: { a: 2 } },
          },
          selectedRows: [0],
          result,
          pkColumn: "id",
        },
        false,
      );
      expect(out.pendingChanges).toEqual({
        "2": { pkOriginalValue: 2, changes: { a: 2 } },
      });
    });

    it("rolls back only selected insertion rows by displayIndex", () => {
      const result = makeResult(["id"], [[1]]);
      const insertions: PendingInsertionsMap = {
        t1: makeInsertion("t1", {}, 1),
        t2: makeInsertion("t2", {}, 2),
      };
      const out = rollbackPendingForSelection(
        {
          pendingInsertions: insertions,
          selectedRows: [2],
          result,
          pkColumn: "id",
        },
        false,
      );
      expect(out.pendingInsertions).toEqual({ t1: insertions.t1 });
    });
  });

  describe("cleanupSubmittedPending", () => {
    it("removes processed entries", () => {
      const out = cleanupSubmittedPending(
        {
          "1": { pkOriginalValue: 1, changes: { a: 1 } },
          "2": { pkOriginalValue: 2, changes: { a: 2 } },
        },
        { "1": 1, "9": 9 },
        { t1: makeInsertion("t1"), t2: makeInsertion("t2") },
        {
          updates: [{ pkVal: 1, colName: "a", newVal: 1 }],
          deletions: [1],
          insertions: [{ tempId: "t1", data: {} }],
          invalidInsertions: [],
        },
      );
      expect(out.pendingChanges).toEqual({
        "2": { pkOriginalValue: 2, changes: { a: 2 } },
      });
      expect(out.pendingDeletions).toEqual({ "9": 9 });
      expect(out.pendingInsertions).toEqual({ t2: makeInsertion("t2") });
    });

    it("collapses empty maps to undefined", () => {
      const out = cleanupSubmittedPending(
        { "1": { pkOriginalValue: 1, changes: { a: 1 } } },
        { "1": 1 },
        { t1: makeInsertion("t1") },
        {
          updates: [{ pkVal: 1, colName: "a", newVal: 1 }],
          deletions: [1],
          insertions: [{ tempId: "t1", data: {} }],
          invalidInsertions: [],
        },
      );
      expect(out.pendingChanges).toBeUndefined();
      expect(out.pendingDeletions).toBeUndefined();
      expect(out.pendingInsertions).toBeUndefined();
    });

    it("prunes row entries left with no cell changes", () => {
      const out = cleanupSubmittedPending(
        { "1": { pkOriginalValue: 1, changes: {} } },
        undefined,
        undefined,
        {
          updates: [],
          deletions: [],
          insertions: [],
          invalidInsertions: [],
        },
      );
      expect(out.pendingChanges).toBeUndefined();
    });
  });
});
