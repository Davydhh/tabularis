import { describe, it, expect } from "vitest";
import type { TableColumn } from "../../src/types/editor";
import {
  deriveColumnMetadata,
  emptyColumnMetadata,
  fillMissingColumnMetadata,
} from "../../src/utils/columnMetadata";

const col = (overrides: Partial<TableColumn>): TableColumn => ({
  name: "c",
  data_type: "text",
  is_pk: false,
  is_nullable: false,
  is_auto_increment: false,
  ...overrides,
});

describe("columnMetadata", () => {
  describe("deriveColumnMetadata", () => {
    it("returns nulls and empty arrays for an empty column list", () => {
      expect(deriveColumnMetadata([])).toEqual({
        pkColumn: null,
        autoIncrementColumns: [],
        defaultValueColumns: [],
        nullableColumns: [],
        columnMetadata: [],
      });
    });

    it("flags the first pk column", () => {
      const cols = [
        col({ name: "id", is_pk: true, is_auto_increment: true }),
        col({ name: "name" }),
      ];
      expect(deriveColumnMetadata(cols).pkColumn).toBe("id");
    });

    it("collects auto-increment, default-value, and nullable columns", () => {
      const cols = [
        col({ name: "id", is_pk: true, is_auto_increment: true }),
        col({ name: "created_at", default_value: "now()" }),
        col({ name: "deleted_at", is_nullable: true }),
        col({ name: "name" }),
      ];
      const meta = deriveColumnMetadata(cols);
      expect(meta.autoIncrementColumns).toEqual(["id"]);
      expect(meta.defaultValueColumns).toEqual(["created_at"]);
      expect(meta.nullableColumns).toEqual(["deleted_at"]);
    });

    it("treats an explicit null default_value as no default", () => {
      const cols = [
        col({ name: "x", default_value: undefined }),
        col({ name: "y", default_value: "0" }),
      ];
      expect(deriveColumnMetadata(cols).defaultValueColumns).toEqual(["y"]);
    });

    it("preserves the input column list as columnMetadata", () => {
      const cols = [col({ name: "id" })];
      expect(deriveColumnMetadata(cols).columnMetadata).toBe(cols);
    });
  });

  describe("emptyColumnMetadata", () => {
    it("returns null pk and empty arrays", () => {
      expect(emptyColumnMetadata()).toEqual({
        pkColumn: null,
        autoIncrementColumns: [],
        defaultValueColumns: [],
        nullableColumns: [],
        columnMetadata: [],
      });
    });
  });

  describe("fillMissingColumnMetadata", () => {
    const cols = [
      col({ name: "id", is_pk: true, is_auto_increment: true }),
      col({ name: "name" }),
    ];

    it("fills every field on a tab that has none", () => {
      const patch = fillMissingColumnMetadata({}, cols);
      expect(patch.pkColumn).toBe("id");
      expect(patch.autoIncrementColumns).toEqual(["id"]);
      expect(patch.defaultValueColumns).toEqual([]);
      expect(patch.nullableColumns).toEqual([]);
      expect(patch.columnMetadata).toBe(cols);
    });

    it("does not overwrite a non-empty pkColumn", () => {
      const patch = fillMissingColumnMetadata({ pkColumn: "existing" }, cols);
      expect(patch.pkColumn).toBeUndefined();
    });

    it("does not overwrite already-set array fields", () => {
      const patch = fillMissingColumnMetadata(
        {
          autoIncrementColumns: [],
          defaultValueColumns: ["created_at"],
          nullableColumns: ["bio"],
          columnMetadata: [col({ name: "different" })],
        },
        cols,
      );
      expect(patch.autoIncrementColumns).toBeUndefined();
      expect(patch.defaultValueColumns).toBeUndefined();
      expect(patch.nullableColumns).toBeUndefined();
      expect(patch.columnMetadata).toBeUndefined();
    });

    it("leaves pkColumn unset when the table has no primary key", () => {
      const noPk = [col({ name: "x" })];
      const patch = fillMissingColumnMetadata({}, noPk);
      expect(patch.pkColumn).toBeUndefined();
      expect(patch.columnMetadata).toBe(noPk);
    });
  });
});
