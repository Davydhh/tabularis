import type {
  PendingInsertion,
  QueryResult,
  TableColumn,
  Tab,
} from "../types/editor";
import {
  generateTempId,
  insertionToBackendData,
  validatePendingInsertion,
} from "./pendingInsertions";

export type PendingChangesMap = Record<
  string,
  { pkOriginalValue: unknown; changes: Record<string, unknown> }
>;
export type PendingDeletionsMap = Record<string, unknown>;
export type PendingInsertionsMap = Record<string, PendingInsertion>;

/**
 * Subset of Tab used by pending-state utilities. Accepting a lean slice keeps
 * the helpers easy to test without constructing a full Tab.
 */
export interface PendingTabSlice {
  pendingChanges?: PendingChangesMap;
  pendingDeletions?: PendingDeletionsMap;
  pendingInsertions?: PendingInsertionsMap;
  selectedRows?: number[];
  result?: QueryResult | null;
  pkColumn?: string | null;
  autoIncrementColumns?: string[];
}

/**
 * Adds, updates, or removes a single cell change in the pendingChanges map.
 *
 * `value === undefined` clears that cell. When the last cell change for a row
 * is cleared, the row entry is dropped.
 */
export function togglePendingChange(
  pendingChanges: PendingChangesMap | undefined,
  pkVal: unknown,
  colName: string,
  value: unknown,
): PendingChangesMap {
  const pkKey = String(pkVal);
  const current = pendingChanges || {};
  const rowEntry = current[pkKey] || {
    pkOriginalValue: pkVal,
    changes: {},
  };

  const newChanges = { ...rowEntry.changes };
  if (value === undefined) {
    delete newChanges[colName];
  } else {
    newChanges[colName] = value;
  }

  const next = { ...current };
  if (Object.keys(newChanges).length === 0) {
    delete next[pkKey];
  } else {
    next[pkKey] = { ...rowEntry, changes: newChanges };
  }
  return next;
}

/**
 * Updates a single cell on a pending insertion. Returns the input unchanged if
 * the tempId is not present. `value === undefined` clears the cell.
 */
export function updatePendingInsertionField(
  pendingInsertions: PendingInsertionsMap | undefined,
  tempId: string,
  colName: string,
  value: unknown,
): PendingInsertionsMap {
  const current = pendingInsertions || {};
  const insertion = current[tempId];
  if (!insertion) return current;

  const newData = { ...insertion.data };
  if (value === undefined) {
    delete newData[colName];
  } else {
    newData[colName] = value;
  }

  return {
    ...current,
    [tempId]: { ...insertion, data: newData },
  };
}

/**
 * Removes a pending insertion by its tempId.
 */
export function removePendingInsertion(
  pendingInsertions: PendingInsertionsMap | undefined,
  tempId: string,
): PendingInsertionsMap {
  const current = pendingInsertions || {};
  if (!(tempId in current)) return current;
  const next = { ...current };
  delete next[tempId];
  return next;
}

/**
 * Marks a single row for deletion.
 */
export function addPendingDeletion(
  pendingDeletions: PendingDeletionsMap | undefined,
  pkVal: unknown,
): PendingDeletionsMap {
  return {
    ...(pendingDeletions || {}),
    [String(pkVal)]: pkVal,
  };
}

/**
 * Marks multiple rows for deletion.
 */
export function addMultiplePendingDeletions(
  pendingDeletions: PendingDeletionsMap | undefined,
  pkVals: unknown[],
): PendingDeletionsMap {
  const next = { ...(pendingDeletions || {}) };
  for (const pkVal of pkVals) {
    next[String(pkVal)] = pkVal;
  }
  return next;
}

/**
 * Reverts a pending deletion. Returns `undefined` when the resulting map is
 * empty, mirroring the editor's preference to clear the field entirely.
 */
export function removePendingDeletion(
  pendingDeletions: PendingDeletionsMap | undefined,
  pkVal: unknown,
): PendingDeletionsMap | undefined {
  const current = pendingDeletions || {};
  const pkKey = String(pkVal);
  if (!(pkKey in current)) {
    return Object.keys(current).length > 0 ? current : undefined;
  }
  const next = { ...current };
  delete next[pkKey];
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * True when the tab has any pending edit, deletion, or insertion.
 */
export function hasAnyPendingChanges(tab: PendingTabSlice): boolean {
  return (
    Object.keys(tab.pendingChanges || {}).length > 0 ||
    Object.keys(tab.pendingDeletions || {}).length > 0 ||
    Object.keys(tab.pendingInsertions || {}).length > 0
  );
}

/**
 * True when the current selection (or the whole tab, if no selection) has any
 * pending change. Insertion rows are addressed by displayIndex `>= existing
 * row count`.
 */
export function selectionHasPendingChanges(tab: PendingTabSlice): boolean {
  const { pendingChanges, pendingDeletions, pendingInsertions, selectedRows, result, pkColumn } = tab;

  const hasGlobalPending = hasAnyPendingChanges(tab);

  if (!selectedRows || selectedRows.length === 0) return hasGlobalPending;

  const existingRowCount = result?.rows.length ?? 0;
  const hasInsertions =
    pendingInsertions && Object.keys(pendingInsertions).length > 0;

  return selectedRows.some((rowIndex) => {
    if (rowIndex >= existingRowCount) {
      return !!hasInsertions;
    }
    if (!result || !pkColumn) return false;
    const pkIndex = result.columns.indexOf(pkColumn);
    if (pkIndex === -1) return false;
    const row = result.rows[rowIndex];
    if (!row) return false;
    const pkVal = String(row[pkIndex]);
    return (
      !!(pendingChanges && pendingChanges[pkVal]) ||
      !!(pendingDeletions && pendingDeletions[pkVal])
    );
  });
}

/**
 * Given the current selection, computes the updated pending state after
 * marking selected existing rows for deletion and dropping selected insertion
 * rows.
 */
export function computeDeletionsForSelection(tab: PendingTabSlice): {
  pendingDeletions: PendingDeletionsMap;
  pendingInsertions: PendingInsertionsMap;
} {
  const existingRowCount = tab.result?.rows.length ?? 0;
  const currentInsertions = tab.pendingInsertions || {};
  const currentDeletions = tab.pendingDeletions || {};

  const nextDeletions: PendingDeletionsMap = { ...currentDeletions };
  const nextInsertions: PendingInsertionsMap = { ...currentInsertions };
  const insertionTempIds = Object.keys(currentInsertions);
  const selectedRows = tab.selectedRows || [];

  selectedRows.forEach((rowIndex) => {
    if (rowIndex < existingRowCount) {
      if (tab.result && tab.pkColumn) {
        const pkIndex = tab.result.columns.indexOf(tab.pkColumn);
        if (pkIndex !== -1) {
          const row = tab.result.rows[rowIndex];
          if (row) {
            const pkVal = row[pkIndex];
            nextDeletions[String(pkVal)] = pkVal;
          }
        }
      }
    } else {
      const insertionArrayIndex = rowIndex - existingRowCount;
      if (
        insertionArrayIndex >= 0 &&
        insertionArrayIndex < insertionTempIds.length
      ) {
        const tempId = insertionTempIds[insertionArrayIndex];
        delete nextInsertions[tempId];
      }
    }
  });

  return {
    pendingDeletions: nextDeletions,
    pendingInsertions: nextInsertions,
  };
}

/**
 * Builds the pendingInsertions map after duplicating a row. Auto-increment
 * columns are nulled so the DB generates fresh values.
 */
export function buildDuplicateInsertion(
  rowData: Record<string, unknown>,
  autoIncrementColumns: string[],
  pendingInsertions: PendingInsertionsMap | undefined,
  existingRowCount: number,
  tempIdFactory: () => string = generateTempId,
): { pendingInsertions: PendingInsertionsMap; tempId: string } {
  const data: Record<string, unknown> = { ...rowData };
  autoIncrementColumns.forEach((col) => {
    data[col] = null;
  });

  const current = pendingInsertions || {};
  const tempId = tempIdFactory();
  const displayIndex = existingRowCount + Object.keys(current).length;

  return {
    pendingInsertions: {
      ...current,
      [tempId]: { tempId, data, displayIndex },
    },
    tempId,
  };
}

export interface SubmitOperations {
  updates: { pkVal: unknown; colName: string; newVal: unknown }[];
  deletions: unknown[];
  insertions: { tempId: string; data: Record<string, unknown> }[];
  invalidInsertions: { tempId: string; errors: Record<string, string> }[];
}

/**
 * Derives the row-level operations to send to the backend from a tab's
 * pending state. Pure: requires the caller to provide table columns (used to
 * validate and normalize insertions).
 *
 * When `applyToAll` is false and the tab has a selection, only changes that
 * map to selected rows are emitted.
 */
export function computeSubmitOperations(
  tab: PendingTabSlice,
  applyToAll: boolean,
  columns: TableColumn[],
): SubmitOperations {
  const ops: SubmitOperations = {
    updates: [],
    deletions: [],
    insertions: [],
    invalidInsertions: [],
  };

  const {
    pendingChanges,
    pendingDeletions,
    pendingInsertions,
    selectedRows,
    pkColumn,
    result,
  } = tab;
  const hasPkColumn = !!pkColumn;
  const hasSelection = !applyToAll && !!selectedRows && selectedRows.length > 0;

  const selectedPkSet = new Set<string>();
  const selectedDisplayIndices = new Set<number>();

  if (hasSelection) {
    selectedRows!.forEach((rowIndex) => {
      selectedDisplayIndices.add(rowIndex);
    });
    if (result && hasPkColumn && pkColumn) {
      const pkIndex = result.columns.indexOf(pkColumn);
      if (pkIndex !== -1) {
        selectedRows!.forEach((rowIndex) => {
          const row = result.rows[rowIndex];
          if (row) selectedPkSet.add(String(row[pkIndex]));
        });
      }
    }
  }

  if (hasPkColumn && pkColumn && pendingChanges) {
    for (const [pkKey, rowData] of Object.entries(pendingChanges)) {
      if (hasSelection && !selectedPkSet.has(pkKey)) continue;
      const { pkOriginalValue, changes } = rowData;
      for (const [colName, newVal] of Object.entries(changes)) {
        ops.updates.push({ pkVal: pkOriginalValue, colName, newVal });
      }
    }
  }

  if (hasPkColumn && pkColumn && pendingDeletions) {
    for (const [pkKey, pkVal] of Object.entries(pendingDeletions)) {
      if (hasSelection && !selectedPkSet.has(pkKey)) continue;
      ops.deletions.push(pkVal);
    }
  }

  if (pendingInsertions && Object.keys(pendingInsertions).length > 0) {
    const existingRowCount = result?.rows.length ?? 0;
    let insertionIndex = 0;
    for (const [tempId, insertion] of Object.entries(pendingInsertions)) {
      const insertionDisplayIndex = existingRowCount + insertionIndex;
      insertionIndex++;

      if (hasSelection && !selectedDisplayIndices.has(insertionDisplayIndex)) {
        continue;
      }

      const errors = validatePendingInsertion(insertion, columns);
      if (Object.keys(errors).length > 0) {
        ops.invalidInsertions.push({ tempId, errors });
        continue;
      }

      const backendData = insertionToBackendData(insertion, columns);
      ops.insertions.push({ tempId, data: backendData });
    }
  }

  return ops;
}

/**
 * Returns the pending state after rolling back changes covered by the current
 * selection. When `applyToAll` is true or there is no selection, everything is
 * cleared.
 */
export function rollbackPendingForSelection(
  tab: PendingTabSlice,
  applyToAll: boolean,
): {
  pendingChanges: PendingChangesMap | undefined;
  pendingDeletions: PendingDeletionsMap | undefined;
  pendingInsertions: PendingInsertionsMap | undefined;
} {
  const { selectedRows, result, pkColumn, pendingChanges, pendingDeletions, pendingInsertions } = tab;

  if (applyToAll || !selectedRows || selectedRows.length === 0) {
    return {
      pendingChanges: undefined,
      pendingDeletions: undefined,
      pendingInsertions: undefined,
    };
  }

  const selectedPkSet = new Set<string>();
  const selectedDisplayIndices = new Set<number>(selectedRows);

  if (result && pkColumn) {
    const pkIndex = result.columns.indexOf(pkColumn);
    if (pkIndex !== -1) {
      selectedRows.forEach((rowIndex) => {
        const row = result.rows[rowIndex];
        if (row) selectedPkSet.add(String(row[pkIndex]));
      });
    }
  }

  const newPendingChanges = { ...(pendingChanges || {}) };
  const newPendingDeletions = { ...(pendingDeletions || {}) };
  const newPendingInsertions = { ...(pendingInsertions || {}) };

  selectedPkSet.forEach((pk) => {
    delete newPendingChanges[pk];
    delete newPendingDeletions[pk];
  });

  const existingRowCount = result?.rows.length ?? 0;
  let insertionIndex = 0;
  for (const tempId of Object.keys(newPendingInsertions)) {
    const insertionDisplayIndex = existingRowCount + insertionIndex;
    if (selectedDisplayIndices.has(insertionDisplayIndex)) {
      delete newPendingInsertions[tempId];
    }
    insertionIndex++;
  }

  return {
    pendingChanges:
      Object.keys(newPendingChanges).length > 0 ? newPendingChanges : undefined,
    pendingDeletions:
      Object.keys(newPendingDeletions).length > 0
        ? newPendingDeletions
        : undefined,
    pendingInsertions:
      Object.keys(newPendingInsertions).length > 0
        ? newPendingInsertions
        : undefined,
  };
}

/**
 * Returns the pending state after a submit succeeded. Removes processed
 * entries; collapses empty maps to `undefined`. Empty row-change objects are
 * also pruned (matches the editor's invariant: a row with no edits should not
 * appear in pendingChanges).
 */
export function cleanupSubmittedPending(
  pendingChanges: PendingChangesMap | undefined,
  pendingDeletions: PendingDeletionsMap | undefined,
  pendingInsertions: PendingInsertionsMap | undefined,
  submitted: SubmitOperations,
): {
  pendingChanges: PendingChangesMap | undefined;
  pendingDeletions: PendingDeletionsMap | undefined;
  pendingInsertions: PendingInsertionsMap | undefined;
} {
  const newPendingChanges = { ...(pendingChanges || {}) };
  const newPendingDeletions = { ...(pendingDeletions || {}) };
  const newPendingInsertions = { ...(pendingInsertions || {}) };

  submitted.updates.forEach((u) => delete newPendingChanges[String(u.pkVal)]);
  submitted.deletions.forEach((d) => delete newPendingDeletions[String(d)]);
  submitted.insertions.forEach((i) => delete newPendingInsertions[i.tempId]);

  Object.keys(newPendingChanges).forEach((key) => {
    if (Object.keys(newPendingChanges[key]?.changes || {}).length === 0) {
      delete newPendingChanges[key];
    }
  });

  return {
    pendingChanges:
      Object.keys(newPendingChanges).length > 0 ? newPendingChanges : undefined,
    pendingDeletions:
      Object.keys(newPendingDeletions).length > 0
        ? newPendingDeletions
        : undefined,
    pendingInsertions:
      Object.keys(newPendingInsertions).length > 0
        ? newPendingInsertions
        : undefined,
  };
}

// Re-export Tab so call sites can pass a full Tab without an extra import.
export type { Tab };
