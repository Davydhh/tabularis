import { describe, it, expect } from "vitest";
import {
  buildNavStateKey,
  buildTabPayloadFromNavState,
  navTargetsOtherConnection,
  resolveNavTabTitle,
} from "../../src/utils/editorNavigation";

describe("editorNavigation", () => {
  describe("buildNavStateKey", () => {
    it("joins the identifying fields with dashes", () => {
      expect(
        buildNavStateKey({
          initialQuery: "SELECT 1",
          tableName: "users",
          queryName: "list",
          schema: "public",
          title: "Users",
        }),
      ).toBe("SELECT 1-users-list-public-Users");
    });

    it("renders missing fields as the empty placeholder", () => {
      expect(buildNavStateKey({})).toBe("----");
    });

    it("matches when only the non-identifying fields differ", () => {
      const a = buildNavStateKey({
        initialQuery: "SELECT 1",
        readOnly: true,
        preventAutoRun: true,
      });
      const b = buildNavStateKey({
        initialQuery: "SELECT 1",
        readOnly: false,
      });
      expect(a).toBe(b);
    });
  });

  describe("resolveNavTabTitle", () => {
    it("prefers title over everything else", () => {
      expect(
        resolveNavTabTitle(
          { title: "T", queryName: "Q", tableName: "tbl" },
          "fallback",
        ),
      ).toBe("T");
    });

    it("falls back to queryName when title is missing", () => {
      expect(
        resolveNavTabTitle({ queryName: "Q", tableName: "tbl" }, "fallback"),
      ).toBe("Q");
    });

    it("falls back to tableName when title and queryName are missing", () => {
      expect(resolveNavTabTitle({ tableName: "tbl" }, "fallback")).toBe("tbl");
    });

    it("returns the fallback when no identifier is present", () => {
      expect(resolveNavTabTitle({}, "fallback")).toBe("fallback");
    });
  });

  describe("navTargetsOtherConnection", () => {
    it("is false when the nav state has no target", () => {
      expect(navTargetsOtherConnection({}, "conn-1")).toBe(false);
    });

    it("is false when the target matches the active connection", () => {
      expect(
        navTargetsOtherConnection({ targetConnectionId: "conn-1" }, "conn-1"),
      ).toBe(false);
    });

    it("is true when the target points at a different connection", () => {
      expect(
        navTargetsOtherConnection({ targetConnectionId: "conn-2" }, "conn-1"),
      ).toBe(true);
    });

    it("is true when there is no active connection at all", () => {
      expect(
        navTargetsOtherConnection({ targetConnectionId: "conn-1" }, null),
      ).toBe(true);
    });
  });

  describe("buildTabPayloadFromNavState", () => {
    it("creates a console tab when no table is named", () => {
      const payload = buildTabPayloadFromNavState(
        { initialQuery: "SELECT 1", title: "Ad hoc" },
        "New Console",
      );
      expect(payload).toEqual({
        type: "console",
        title: "Ad hoc",
        query: "SELECT 1",
        activeTable: undefined,
        schema: undefined,
        readOnly: undefined,
      });
    });

    it("creates a table tab when a table name is supplied", () => {
      const payload = buildTabPayloadFromNavState(
        { tableName: "users", schema: "public", readOnly: true },
        "New Console",
      );
      expect(payload.type).toBe("table");
      expect(payload.activeTable).toBe("users");
      expect(payload.schema).toBe("public");
      expect(payload.readOnly).toBe(true);
      expect(payload.title).toBe("users");
    });

    it("uses the fallback title only when no identifier is provided", () => {
      const payload = buildTabPayloadFromNavState({}, "New Console");
      expect(payload.title).toBe("New Console");
    });
  });
});
