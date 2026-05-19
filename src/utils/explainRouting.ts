import { getExplainableQueries } from "./sql";

export type ExplainTarget =
  /** Source text is empty or whitespace; caller should do nothing. */
  | { kind: "none" }
  /**
   * Text contains no explainable statements. Caller should still open the
   * Explain modal with the source text so the modal can render the
   * "nothing to explain here" error to the user.
   */
  | { kind: "fallback"; query: string }
  /** Exactly one explainable statement was found. */
  | { kind: "single"; query: string }
  /**
   * Multiple explainable statements were found. The caller decides whether to
   * show a chooser modal or auto-pick the first one.
   */
  | { kind: "choose"; choices: { query: string; index: number }[] };

/**
 * Classifies a raw SQL text into an explain action. Pure: no side effects,
 * caller wires the resulting decision to the visual explain UI.
 */
export function resolveExplainTarget(text: string): ExplainTarget {
  const trimmed = (text || "").trim();
  if (!trimmed) return { kind: "none" };

  const explainable = getExplainableQueries(trimmed);
  if (explainable.length === 0) {
    return { kind: "fallback", query: trimmed };
  }
  if (explainable.length === 1) {
    return { kind: "single", query: explainable[0].query };
  }
  return { kind: "choose", choices: explainable };
}
