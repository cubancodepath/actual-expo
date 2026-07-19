import { describe, it, expect, vi } from "vitest";
import { Spreadsheet, resolveName } from "@/core/domain/spreadsheet/spreadsheet";

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

describe("Spreadsheet — onCellChanged (keyed subscriptions, plan 014)", () => {
  const sheet = "budget2026-07";

  it("fires once with the new value when the subscribed cell changes, even amid other changed cells", () => {
    const ss = new Spreadsheet();
    ss.createStatic(sheet, "A", 1);
    ss.createStatic(sheet, "B", 1);
    // Flush the initial-creation dirty entries before subscribing, so the
    // assertions below only observe the change caused by set() (mirrors
    // real usage — the engine finishes its initial computation before the
    // UI subscribes).
    ss.startTransaction();
    ss.endTransaction();
    const resolvedA = resolveName(sheet, "A");
    const resolvedB = resolveName(sheet, "B");

    const listener = vi.fn();
    ss.onCellChanged(resolvedA, listener);

    ss.startTransaction();
    ss.set(resolvedA, 42);
    ss.set(resolvedB, 99);
    ss.endTransaction();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(42);
  });

  it("does not fire when only unrelated cells change", () => {
    const ss = new Spreadsheet();
    ss.createStatic(sheet, "A", 1);
    ss.createStatic(sheet, "B", 1);
    // Flush the initial-creation dirty entries before subscribing, so the
    // assertions below only observe the change caused by set() (mirrors
    // real usage — the engine finishes its initial computation before the
    // UI subscribes).
    ss.startTransaction();
    ss.endTransaction();
    const resolvedA = resolveName(sheet, "A");
    const resolvedB = resolveName(sheet, "B");

    const listener = vi.fn();
    ss.onCellChanged(resolvedA, listener);

    ss.set(resolvedB, 99);

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops firing after unsubscribe; double-unsubscribe is safe", () => {
    const ss = new Spreadsheet();
    ss.createStatic(sheet, "A", 1);
    const resolvedA = resolveName(sheet, "A");

    const listener = vi.fn();
    const unsubscribe = ss.onCellChanged(resolvedA, listener);

    ss.set(resolvedA, 2);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    unsubscribe(); // must not throw

    ss.set(resolvedA, 3);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("dispatches to all listeners subscribed to the same cell", () => {
    const ss = new Spreadsheet();
    ss.createStatic(sheet, "A", 1);
    const resolvedA = resolveName(sheet, "A");

    const listener1 = vi.fn();
    const listener2 = vi.fn();
    ss.onCellChanged(resolvedA, listener1);
    ss.onCellChanged(resolvedA, listener2);

    ss.set(resolvedA, 7);

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener1).toHaveBeenCalledWith(7);
    expect(listener2).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledWith(7);
  });
});
