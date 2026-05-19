import type { Tab, TableColumn } from "../types/editor";

export interface ColumnMetadata {
  pkColumn: string | null;
  autoIncrementColumns: string[];
  defaultValueColumns: string[];
  nullableColumns: string[];
  columnMetadata: TableColumn[];
}

/**
 * Derives the editor-facing metadata maps from a freshly-fetched
 * `TableColumn[]`. `pkColumn` is the first column flagged `is_pk` or `null` if
 * the table has no primary key.
 */
export function deriveColumnMetadata(cols: TableColumn[]): ColumnMetadata {
  const pk = cols.find((c) => c.is_pk);
  return {
    pkColumn: pk ? pk.name : null,
    autoIncrementColumns: cols
      .filter((c) => c.is_auto_increment)
      .map((c) => c.name),
    defaultValueColumns: cols
      .filter((c) => c.default_value !== undefined && c.default_value !== null)
      .map((c) => c.name),
    nullableColumns: cols.filter((c) => c.is_nullable).map((c) => c.name),
    columnMetadata: cols,
  };
}

/**
 * Empty-state metadata for the failure path (when `get_columns` errored out)
 * so the UI can unblock without leaving stale fields around.
 */
export function emptyColumnMetadata(): ColumnMetadata {
  return {
    pkColumn: null,
    autoIncrementColumns: [],
    defaultValueColumns: [],
    nullableColumns: [],
    columnMetadata: [],
  };
}

/**
 * Returns the partial Tab patch that fills only metadata fields the tab is
 * currently missing. Used when adding a new row to a tab that may already
 * carry partial metadata from a previous query.
 *
 * `pkColumn` is only patched when the derived value is non-null, so a tab
 * keyless tab stays keyless.
 */
export function fillMissingColumnMetadata(
  tab: Pick<
    Tab,
    | "pkColumn"
    | "autoIncrementColumns"
    | "defaultValueColumns"
    | "nullableColumns"
    | "columnMetadata"
  >,
  cols: TableColumn[],
): Partial<Tab> {
  const meta = deriveColumnMetadata(cols);
  const patch: Partial<Tab> = {};

  if (!tab.pkColumn && meta.pkColumn !== null) {
    patch.pkColumn = meta.pkColumn;
  }
  if (!tab.autoIncrementColumns) {
    patch.autoIncrementColumns = meta.autoIncrementColumns;
  }
  if (!tab.defaultValueColumns) {
    patch.defaultValueColumns = meta.defaultValueColumns;
  }
  if (!tab.nullableColumns) {
    patch.nullableColumns = meta.nullableColumns;
  }
  if (!tab.columnMetadata) {
    patch.columnMetadata = meta.columnMetadata;
  }

  return patch;
}
