import { describe, it, expect } from "vitest";
import { resolveExplainTarget } from "../../src/utils/explainRouting";

describe("explainRouting", () => {
  describe("resolveExplainTarget", () => {
    it("returns 'none' on empty input", () => {
      expect(resolveExplainTarget("")).toEqual({ kind: "none" });
      expect(resolveExplainTarget("   ")).toEqual({ kind: "none" });
    });

    it("returns 'fallback' for SQL with no explainable statements", () => {
      const decision = resolveExplainTarget("CREATE TABLE t (id INT);");
      expect(decision).toEqual({
        kind: "fallback",
        query: "CREATE TABLE t (id INT);",
      });
    });

    it("returns 'single' for one explainable statement", () => {
      const decision = resolveExplainTarget("SELECT 1");
      expect(decision.kind).toBe("single");
      if (decision.kind === "single") {
        expect(decision.query).toMatch(/^SELECT\s+1/i);
      }
    });

    it("returns 'choose' when more than one statement is explainable", () => {
      const decision = resolveExplainTarget(
        "SELECT 1; SELECT 2; SELECT 3;",
      );
      expect(decision.kind).toBe("choose");
      if (decision.kind === "choose") {
        expect(decision.choices).toHaveLength(3);
        expect(decision.choices[0].index).toBe(1);
        expect(decision.choices[1].index).toBe(2);
      }
    });

    it("trims whitespace before classifying", () => {
      const decision = resolveExplainTarget("   SELECT 1   ");
      expect(decision.kind).toBe("single");
    });

    it("filters non-explainable statements when classifying mixed input", () => {
      const decision = resolveExplainTarget(
        "SET search_path TO public; SELECT 1;",
      );
      expect(decision.kind).toBe("single");
    });
  });
});
