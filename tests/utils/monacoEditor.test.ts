import { describe, it, expect } from "vitest";
import {
  getEditorSelectionText,
  getEditorTextOrSelection,
  type MonacoEditorLike,
  type MonacoSelectionLike,
} from "../../src/utils/monacoEditor";

interface FakeEditorOptions {
  value: string;
  selection?: MonacoSelectionLike | null;
  selectionText?: string;
  noModel?: boolean;
}

const makeEditor = (opts: FakeEditorOptions): MonacoEditorLike => ({
  getValue: () => opts.value,
  getSelection: () => (opts.selection === undefined ? null : opts.selection),
  getModel: () =>
    opts.noModel
      ? null
      : {
          getValueInRange: () => opts.selectionText ?? "",
        },
});

const range = {
  startLineNumber: 1,
  startColumn: 1,
  endLineNumber: 1,
  endColumn: 1,
};
const nonEmpty = (): MonacoSelectionLike => ({ ...range, isEmpty: () => false });
const empty = (): MonacoSelectionLike => ({ ...range, isEmpty: () => true });

describe("monacoEditor", () => {
  describe("getEditorSelectionText", () => {
    it("returns the selected text when there is a non-empty selection", () => {
      const editor = makeEditor({
        value: "SELECT 1; SELECT 2;",
        selection: nonEmpty(),
        selectionText: "SELECT 1",
      });
      expect(getEditorSelectionText(editor)).toBe("SELECT 1");
    });

    it("returns undefined when there is no selection", () => {
      const editor = makeEditor({ value: "x", selection: null });
      expect(getEditorSelectionText(editor)).toBeUndefined();
    });

    it("returns undefined when the selection is empty (cursor only)", () => {
      const editor = makeEditor({ value: "x", selection: empty() });
      expect(getEditorSelectionText(editor)).toBeUndefined();
    });

    it("returns undefined when the model is unavailable", () => {
      const editor = makeEditor({
        value: "x",
        selection: nonEmpty(),
        noModel: true,
      });
      expect(getEditorSelectionText(editor)).toBeUndefined();
    });
  });

  describe("getEditorTextOrSelection", () => {
    it("returns trimmed selection text when present", () => {
      const editor = makeEditor({
        value: "ignored",
        selection: nonEmpty(),
        selectionText: "  SELECT 1  ",
      });
      expect(getEditorTextOrSelection(editor)).toBe("SELECT 1");
    });

    it("falls back to the trimmed editor value when nothing is selected", () => {
      const editor = makeEditor({
        value: "  SELECT *;  ",
        selection: null,
      });
      expect(getEditorTextOrSelection(editor)).toBe("SELECT *;");
    });

    it("falls back to the editor value when the selection is empty", () => {
      const editor = makeEditor({
        value: "SELECT *;",
        selection: empty(),
      });
      expect(getEditorTextOrSelection(editor)).toBe("SELECT *;");
    });

    it("returns an empty string when nothing is available", () => {
      const editor = makeEditor({ value: "   ", selection: null });
      expect(getEditorTextOrSelection(editor)).toBe("");
    });
  });
});
