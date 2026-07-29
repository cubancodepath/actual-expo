// The dashboard reader against a real DB: the `dashboard`/`dashboard_pages`
// tables must be queryable via AQL and `meta` must come back parsed (json).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/server/db/__tests__/testDb";
import { run } from "@/core/server/db";
import { executeQuery } from "@/lib/queries";
import { q } from "@/core/shared/query";
import {
  widgetPixelHeight,
  getWidgetMinHeight,
  ROW_HEIGHT,
  sortDefaultWidgets,
  sortWidgets,
} from "../useDashboardWidgets";

describe("dashboard reader (real DB)", () => {
  beforeEach(async () => {
    await openTestDb();
    await run("INSERT INTO dashboard_pages (id, name, tombstone) VALUES (?,?,?)", [
      "pg1",
      "Main",
      0,
    ]);
    await run(
      "INSERT INTO dashboard (id, type, width, height, x, y, meta, dashboard_page_id, tombstone) VALUES (?,?,?,?,?,?,?,?,?)",
      ["w1", "net-worth-card", 6, 2, 0, 2, null, "pg1", 0],
    );
    await run(
      "INSERT INTO dashboard (id, type, width, height, x, y, meta, dashboard_page_id, tombstone) VALUES (?,?,?,?,?,?,?,?,?)",
      ["w2", "summary-card", 3, 2, 0, 0, JSON.stringify({ name: "Income" }), "pg1", 0],
    );
  });
  afterEach(async () => {
    await closeTestDb();
  });

  it("queries dashboard_pages + dashboard and parses meta json", async () => {
    const { data: pages } = await executeQuery<{ id: string }>(q("dashboard_pages"));
    expect(pages.map((p) => p.id)).toContain("pg1");

    const { data: widgets } = await executeQuery<{ id: string; type: string; meta: unknown }>(
      q("dashboard"),
    );
    const w2 = widgets.find((w) => w.id === "w2")!;
    // meta is parsed to an object by the AQL json output conversion
    expect(w2.meta).toEqual({ name: "Income" });
    expect(widgets.find((w) => w.id === "w1")!.meta).toBeNull();
  });

  it("computes single-column heights from the upstream min-height table", () => {
    expect(getWidgetMinHeight("markdown-card")).toBe(1);
    expect(getWidgetMinHeight("sankey-card")).toBe(3);
    expect(getWidgetMinHeight("net-worth-card")).toBe(2);
    // height honors max(widget.height, minHeight) * ROW_HEIGHT
    expect(widgetPixelHeight({ type: "net-worth-card", height: 2 } as never)).toBe(2 * ROW_HEIGHT);
    expect(widgetPixelHeight({ type: "sankey-card", height: 1 } as never)).toBe(3 * ROW_HEIGHT);
  });

  it("uses pulse-first order for synthetic default widgets", () => {
    const widgets = [
      { id: "calendar", type: "calendar-card", x: 0, y: 0 },
      { id: "spending", type: "spending-card", x: 0, y: 0 },
      { id: "summary", type: "summary-card", x: 0, y: 0 },
      { id: "net-worth", type: "net-worth-card", x: 0, y: 0 },
      { id: "cash-flow", type: "cash-flow-card", x: 0, y: 0 },
      { id: "secondary-summary", type: "summary-card", x: 0, y: 8 },
    ] as never[];

    expect(sortDefaultWidgets(widgets).map((widget) => widget.id)).toEqual([
      "summary",
      "net-worth",
      "cash-flow",
      "spending",
      "calendar",
      "secondary-summary",
    ]);
  });

  it("keeps persisted widget coordinates authoritative", () => {
    const widgets = [
      { id: "custom-first", type: "calendar-card", x: 0, y: 0 },
      { id: "custom-second", type: "summary-card", x: 0, y: 1 },
    ] as never[];

    expect(sortWidgets(widgets).map((widget) => widget.id)).toEqual([
      "custom-first",
      "custom-second",
    ]);
  });
});
