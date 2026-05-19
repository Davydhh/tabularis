/**
 * Structural subset of the Monaco editor surface that the helpers below need.
 * Shaped to remain assignable from a real `monaco.editor.ICodeEditor` while
 * still being trivially mockable in tests.
 */
export interface MonacoRangeLike {
  readonly startLineNumber: number;
  readonly startColumn: number;
  readonly endLineNumber: number;
  readonly endColumn: number;
}

export interface MonacoSelectionLike extends MonacoRangeLike {
  isEmpty(): boolean;
}

export interface MonacoModelLike {
  getValueInRange(range: MonacoRangeLike): string;
}

export interface MonacoEditorLike {
  getSelection(): MonacoSelectionLike | null;
  getModel(): MonacoModelLike | null | undefined;
  getValue(): string;
}

/**
 * Returns the currently-selected text in the editor, or `undefined` if there
 * is no selection or the selection is empty (cursor only).
 */
export function getEditorSelectionText(
  editor: MonacoEditorLike,
): string | undefined {
  const selection = editor.getSelection();
  if (!selection || selection.isEmpty()) return undefined;
  return editor.getModel()?.getValueInRange(selection);
}

/**
 * Returns the trimmed selection text when present, otherwise the trimmed full
 * editor value. Mirrors the "selection wins, otherwise whole editor" pattern
 * used by Run / Explain / context-menu actions.
 */
export function getEditorTextOrSelection(editor: MonacoEditorLike): string {
  const selected = getEditorSelectionText(editor);
  return (selected ?? editor.getValue()).trim();
}
