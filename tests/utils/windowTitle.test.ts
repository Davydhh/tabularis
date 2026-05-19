import { describe, it, expect } from "vitest";
import { composeWindowTitle } from "../../src/utils/windowTitle";

describe("windowTitle", () => {
  describe("composeWindowTitle", () => {
    it("returns the bare app name when there is no connection", () => {
      expect(
        composeWindowTitle({
          connectionName: null,
          databaseName: "db",
        }),
      ).toBe("tabularis");
    });

    it("returns the bare app name when there is no database", () => {
      expect(
        composeWindowTitle({
          connectionName: "prod",
          databaseName: null,
        }),
      ).toBe("tabularis");
    });

    it("formats connection + database when both are available", () => {
      expect(
        composeWindowTitle({
          connectionName: "prod",
          databaseName: "app",
        }),
      ).toBe("tabularis - prod (app)");
    });

    it("appends the schema suffix only when schemas are enabled", () => {
      expect(
        composeWindowTitle({
          connectionName: "prod",
          databaseName: "app",
          schema: "public",
          schemasEnabled: true,
        }),
      ).toBe("tabularis - prod (app/public)");

      expect(
        composeWindowTitle({
          connectionName: "prod",
          databaseName: "app",
          schema: "public",
          schemasEnabled: false,
        }),
      ).toBe("tabularis - prod (app)");
    });

    it("prefers the active tab schema in multi-db mode", () => {
      expect(
        composeWindowTitle({
          connectionName: "prod",
          databaseName: "fallback",
          isMultiDb: true,
          activeTabSchema: "analytics",
          firstSelectedDatabase: "app",
        }),
      ).toBe("tabularis - prod (analytics)");
    });

    it("falls back to the first selected database when the tab has no schema", () => {
      expect(
        composeWindowTitle({
          connectionName: "prod",
          databaseName: "fallback",
          isMultiDb: true,
          firstSelectedDatabase: "app",
        }),
      ).toBe("tabularis - prod (app)");
    });

    it("falls back to the active database name when nothing else is available", () => {
      expect(
        composeWindowTitle({
          connectionName: "prod",
          databaseName: "app",
          isMultiDb: true,
        }),
      ).toBe("tabularis - prod (app)");
    });

    it("honors a custom app name", () => {
      expect(
        composeWindowTitle({
          appName: "tabularis-dev",
          connectionName: "prod",
          databaseName: "app",
        }),
      ).toBe("tabularis-dev - prod (app)");
    });

    it("combines multi-db and schema suffix when both apply", () => {
      expect(
        composeWindowTitle({
          connectionName: "prod",
          databaseName: "fallback",
          isMultiDb: true,
          activeTabSchema: "shard_a",
          schema: "public",
          schemasEnabled: true,
        }),
      ).toBe("tabularis - prod (shard_a/public)");
    });
  });
});
