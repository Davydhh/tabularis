import { describe, it, expect } from "vitest";
import { toggleSortClause } from "../../src/utils/sortClause";

describe("sortClause", () => {
  describe("toggleSortClause", () => {
    it("starts an ASC sort when there is no current sort", () => {
      expect(toggleSortClause("", "name")).toBe("name ASC");
    });

    it("treats whitespace-only sort as no sort", () => {
      expect(toggleSortClause("   ", "name")).toBe("name ASC");
    });

    it("rotates ASC to DESC for the same column", () => {
      expect(toggleSortClause("name ASC", "name")).toBe("name DESC");
    });

    it("treats a bare column (no direction) as ASC and rotates to DESC", () => {
      expect(toggleSortClause("name", "name")).toBe("name DESC");
    });

    it("clears the sort when rotating DESC", () => {
      expect(toggleSortClause("name DESC", "name")).toBe("");
    });

    it("is case-insensitive about the direction keyword", () => {
      expect(toggleSortClause("name desc", "name")).toBe("");
      expect(toggleSortClause("name asc", "name")).toBe("name DESC");
    });

    it("resets to ASC when toggling a different column", () => {
      expect(toggleSortClause("created_at DESC", "name")).toBe("name ASC");
    });

    it("resets to ASC when the current sort is multi-column", () => {
      expect(toggleSortClause("a ASC, b DESC", "a")).toBe("a ASC");
    });

    it("tolerates extra whitespace between column and direction", () => {
      expect(toggleSortClause("name    ASC", "name")).toBe("name DESC");
    });
  });
});
