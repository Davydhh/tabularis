import { describe, it, expect } from "vitest";
import { computeResizeHeight } from "../../src/utils/editorResize";

const bounds = { offsetTop: 50, minHeight: 100, bottomMargin: 150 };

describe("editorResize", () => {
  describe("computeResizeHeight", () => {
    it("returns the pointer-derived height inside the allowed range", () => {
      // clientY 300, windowHeight 800 → candidate 250, in (100, 650)
      expect(computeResizeHeight(300, 800, bounds)).toBe(250);
    });

    it("returns null when the candidate hits the lower bound", () => {
      // candidate = 100 = minHeight, exclusive
      expect(computeResizeHeight(150, 800, bounds)).toBeNull();
    });

    it("returns null when the candidate is below the lower bound", () => {
      expect(computeResizeHeight(100, 800, bounds)).toBeNull();
    });

    it("returns null when the candidate hits the upper bound", () => {
      // windowHeight - bottomMargin = 650; candidate = 650, exclusive
      expect(computeResizeHeight(700, 800, bounds)).toBeNull();
    });

    it("returns null when the candidate is above the upper bound", () => {
      expect(computeResizeHeight(800, 800, bounds)).toBeNull();
    });

    it("returns a strictly-greater-than-min value when just above the lower bound", () => {
      expect(computeResizeHeight(151, 800, bounds)).toBe(101);
    });
  });
});
