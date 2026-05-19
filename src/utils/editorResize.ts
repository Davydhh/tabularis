export interface ResizeBounds {
  /** Pixels subtracted from the pointer Y to align with the panel top. */
  offsetTop: number;
  /** Smallest editor height that should be respected. */
  minHeight: number;
  /** Bottom margin to leave for the result pane / status bar. */
  bottomMargin: number;
}

/**
 * Given the current pointer Y and window height, returns the new editor panel
 * height in pixels, or `null` when the pointer is outside the allowed range
 * (in which case the caller keeps the previous height).
 */
export function computeResizeHeight(
  clientY: number,
  windowHeight: number,
  bounds: ResizeBounds,
): number | null {
  const candidate = clientY - bounds.offsetTop;
  if (candidate <= bounds.minHeight) return null;
  if (candidate >= windowHeight - bounds.bottomMargin) return null;
  return candidate;
}
