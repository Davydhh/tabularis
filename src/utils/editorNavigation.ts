import type { Tab } from "../types/editor";

/**
 * Payload passed via `react-router` `location.state` when another page opens
 * a tab in the editor (e.g. saved-query, schema explorer, FK-navigate).
 */
export interface EditorNavState {
  initialQuery?: string;
  tableName?: string;
  queryName?: string;
  preventAutoRun?: boolean;
  readOnly?: boolean;
  schema?: string;
  targetConnectionId?: string;
  title?: string;
}

/**
 * Stable cache key for an incoming nav state. Two states that should be
 * treated as the same navigation produce the same key — used by the editor
 * to short-circuit duplicate processing.
 */
export function buildNavStateKey(state: EditorNavState): string {
  return [
    state.initialQuery,
    state.tableName,
    state.queryName,
    state.schema,
    state.title,
  ].join("-");
}

/**
 * Resolves the tab title with the same precedence the editor effect uses:
 * `state.title > state.queryName > state.tableName > fallback`. The fallback
 * is supplied so the util stays i18n-free.
 */
export function resolveNavTabTitle(
  state: EditorNavState,
  fallback: string,
): string {
  return state.title || state.queryName || state.tableName || fallback;
}

/**
 * True when the nav state targets a different connection than the active one.
 * The editor uses this to bail out instead of processing the state on the
 * wrong tab strip.
 */
export function navTargetsOtherConnection(
  state: EditorNavState,
  activeConnectionId: string | null | undefined,
): boolean {
  return (
    !!state.targetConnectionId &&
    state.targetConnectionId !== activeConnectionId
  );
}

/**
 * Builds the `addTab` payload from a nav state. Tab type is `table` when the
 * state names a table, `console` otherwise.
 */
export function buildTabPayloadFromNavState(
  state: EditorNavState,
  fallbackTitle: string,
): Partial<Tab> {
  return {
    type: state.tableName ? "table" : "console",
    title: resolveNavTabTitle(state, fallbackTitle),
    query: state.initialQuery,
    activeTable: state.tableName,
    schema: state.schema,
    readOnly: state.readOnly,
  };
}
