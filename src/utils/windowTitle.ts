export interface WindowTitleInput {
  appName?: string;
  connectionName: string | null | undefined;
  databaseName: string | null | undefined;
  /** Schema picked in the explorer, only honored when the driver advertises schema support. */
  schema?: string | null;
  /** True when the driver advertises schema support and a schema is selected. */
  schemasEnabled?: boolean;
  /** True when the connection exposes more than one database simultaneously (multi-db mode). */
  isMultiDb?: boolean;
  /** Schema/database label attached to the active tab in multi-db mode. */
  activeTabSchema?: string | null;
  /** First entry of the multi-db selection, used as a fallback when the tab has no schema. */
  firstSelectedDatabase?: string | null;
}

/**
 * Builds the Tauri window title for the editor. Falls back to the bare app name
 * until the user has an active connection AND database.
 *
 *   "tabularis"                                no active connection/db
 *   "tabularis - <conn> (<db>)"                single db
 *   "tabularis - <conn> (<db>/<schema>)"       schema-capable driver
 *   "tabularis - <conn> (<tabSchema>)"         multi-db: the tab pins one db
 */
export function composeWindowTitle(input: WindowTitleInput): string {
  const appName = input.appName ?? "tabularis";
  const { connectionName, databaseName } = input;

  if (!connectionName || !databaseName) return appName;

  const schemaSuffix =
    input.schemasEnabled && input.schema ? `/${input.schema}` : "";

  const dbDisplay = input.isMultiDb
    ? input.activeTabSchema ?? input.firstSelectedDatabase ?? databaseName
    : databaseName;

  return `${appName} - ${connectionName} (${dbDisplay}${schemaSuffix})`;
}
