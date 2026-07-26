import { describe, it, expect } from "vitest";
import { Spreadsheet } from "@/core/server/spreadsheet/spreadsheet";

/**
 * Mutable dependency edges — what lets a group total gain or lose a category
 * without rebuilding the sheet. Upstream keeps the same two methods on its
 * spreadsheet class.
 */
describe("Spreadsheet — addDependencies / removeDependencies", () => {
  function sheetWithTotal() {
    const ss = new Spreadsheet();
    // Cell creation only queues work; a build flushes it by closing its
    // transaction, same as loadSpreadsheet does.
    ss.transaction(() => {
      ss.createDynamic("s", "a", { dependencies: [], run: () => 10 });
      ss.createDynamic("s", "b", { dependencies: [], run: () => 20 });
      ss.createDynamic("s", "total", {
        dependencies: ["a"],
        run: (...vals) => vals.reduce((sum: number, v) => sum + (typeof v === "number" ? v : 0), 0),
      });
    });
    return ss;
  }

  it("folds a new input into the aggregate and recomputes it", () => {
    const ss = sheetWithTotal();
    expect(ss.getValue("s", "total")).toBe(10);

    ss.addDependencies("s", "total", ["b"]);

    expect(ss.getValue("s", "total")).toBe(30);
  });

  it("cascades when the newly wired input changes", () => {
    const ss = sheetWithTotal();
    ss.addDependencies("s", "total", ["b"]);

    ss.recompute("s", "b");

    expect(ss.getValue("s", "total")).toBe(30);
  });

  it("is idempotent — re-adding the same input changes nothing", () => {
    const ss = sheetWithTotal();
    ss.addDependencies("s", "total", ["b"]);
    ss.addDependencies("s", "total", ["b"]);

    expect(ss.getValue("s", "total")).toBe(30);
  });

  it("drops an input and recomputes without it", () => {
    const ss = sheetWithTotal();
    ss.addDependencies("s", "total", ["b"]);
    expect(ss.getValue("s", "total")).toBe(30);

    ss.removeDependencies("s", "total", ["b"]);

    expect(ss.getValue("s", "total")).toBe(10);
  });

  it("stops cascading from a dropped input", () => {
    const ss = sheetWithTotal();
    ss.addDependencies("s", "total", ["b"]);
    ss.removeDependencies("s", "total", ["b"]);

    ss.recompute("s", "b");

    expect(ss.getValue("s", "total")).toBe(10);
  });

  it("ignores cells that don't exist or aren't dynamic", () => {
    const ss = sheetWithTotal();
    ss.createStatic("s", "fixed", 5);

    expect(() => ss.addDependencies("s", "missing", ["a"])).not.toThrow();
    expect(() => ss.addDependencies("s", "fixed", ["a"])).not.toThrow();
    expect(ss.getValue("s", "fixed")).toBe(5);
  });
});
