/**
 * Toggles the sort direction for a column in a single-column ORDER BY clause.
 *
 * Cycle when the current clause already targets `colName`:
 *   ""        -> "<col> ASC"
 *   "<col>"   -> "<col> DESC"      (no explicit direction is treated as ASC)
 *   "<col> ASC"  -> "<col> DESC"
 *   "<col> DESC" -> ""             (clears the sort)
 *
 * When the clause targets a different column (or is multi-column / unparseable),
 * the toggle resets to `<colName> ASC`.
 */
export function toggleSortClause(currentSort: string, colName: string): string {
  const parts = (currentSort || "").trim().split(/\s+/).filter(Boolean);

  const targetsSameColumn = parts[0] === colName && parts.length <= 2;
  if (!targetsSameColumn) {
    return `${colName} ASC`;
  }

  const currentDir = parts[1]?.toUpperCase();
  if (!currentDir || currentDir === "ASC") {
    return `${colName} DESC`;
  }
  return "";
}
