import { describe, it, expect } from "vitest";
import { Spreadsheet } from "@/core/domain/spreadsheet/spreadsheet";

describe("Spreadsheet — prefix index (regression: compound-prefix / UUID-id bucketing)", () => {
  it("finds cells by a compound prefix ('sum-amount-') even when the cell id itself contains dashes", () => {
    const ss = new Spreadsheet();
    const sheet = "budget2026-07";
    // Real cell ids are UUIDs, which contain dashes — a naive "split at the
    // first dash" prefix scheme mis-buckets "sum-amount-<uuid>" under "sum-"
    // instead of "sum-amount-", so getCellsByPrefix("sum-amount-") would
    // silently return nothing and catSpent cells would never be marked
    // dirty by triggerBudgetChanges after a transaction changes.
    const catId = "a1b2c3d4-e5f6-47a8-9abc-def012345678";
    ss.createDynamic(sheet, `sum-amount-${catId}`, { dependencies: [], run: () => 0 });

    const found = ss.getCellsByPrefix("sum-amount-");
    expect(found.size).toBe(1);
    expect([...found][0]).toContain(`sum-amount-${catId}`);
  });

  it("does not cross-match unrelated prefixes that share a leading segment", () => {
    const ss = new Spreadsheet();
    const sheet = "budget2026-07";
    const catId = "cat-1";
    const groupId = "group-1";
    ss.createDynamic(sheet, `sum-amount-${catId}`, { dependencies: [], run: () => 0 });
    // "group-sum-amount-" must NOT be found by a "sum-amount-" query — it
    // cascades to catSpent via the dependency graph instead, it doesn't
    // need (and shouldn't get) direct prefix-index invalidation.
    ss.createDynamic(sheet, `group-sum-amount-${groupId}`, {
      dependencies: [`sum-amount-${catId}`],
      run: (x) => x,
    });

    const found = ss.getCellsByPrefix("sum-amount-");
    expect(found.size).toBe(1);
    expect([...found][0]).toContain(`sum-amount-${catId}`);
    expect([...found][0]).not.toContain("group-sum-amount");
  });

  it("finds budget- and carryover- cells distinctly", () => {
    const ss = new Spreadsheet();
    const sheet = "budget2026-07";
    const catId = "cat-1";
    ss.createStatic(sheet, `budget-${catId}`, 5000);
    ss.createStatic(sheet, `carryover-${catId}`, false);

    expect(ss.getCellsByPrefix("budget-").size).toBe(1);
    expect(ss.getCellsByPrefix("carryover-").size).toBe(1);
  });
});
