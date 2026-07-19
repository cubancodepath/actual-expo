import { describe, it, expect, afterEach, vi } from "vitest";

// See save.test.ts for why this stub is needed (expo-location has no vitest
// mock/alias and fails to parse under Node; saveTransaction imports it
// transitively via savePayeeLocationIfEnabled, which we never trigger here).
vi.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: vi.fn(),
  getForegroundPermissionsAsync: vi.fn(),
  getCurrentPositionAsync: vi.fn(),
}));

import { setupFixtures, closeTestDb, getTxnRow } from "./helpers";
import { saveTransaction } from "../save";
import type { SaveTransactionInput } from "../save";
import { deleteTransaction, getChildTransactions } from "../index";
import { runQuery } from "@/core/db";
import type { TransactionRow } from "@/core/db/types";

/**
 * Characterization tests for saveTransaction()'s split-new / split-edit paths
 * and deleteTransaction()'s cascade to children (plan 002). These pin CURRENT
 * behavior — see plans/002-transactions-characterization-tests.md.
 */

function splitInput(overrides: Partial<SaveTransactionInput> = {}): SaveTransactionInput {
  return {
    account: "",
    date: 20260101,
    amount: 3000,
    type: "expense",
    payeeId: null,
    payeeName: "",
    categoryId: null,
    notes: "parent notes",
    cleared: false,
    splitCategories: null,
    ...overrides,
  };
}

describe("saveTransaction — split-new", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("creates 1 parent (isParent=1, category NULL) + N children (isChild=1, parent_id=parent)", async () => {
    const { accountA, payeeId, categoryId, categoryId2 } = await setupFixtures();
    const parentId = await saveTransaction(
      splitInput({
        account: accountA,
        payeeId,
        amount: 3000,
        splitCategories: [
          { categoryId, categoryName: "Groceries", amount: 1000 },
          { categoryId: categoryId2, categoryName: "Dining", amount: 2000 },
        ],
      }),
    );

    const parent = await getTxnRow(parentId);
    expect(parent?.isParent).toBe(1);
    expect(parent?.isChild).toBe(0);
    expect(parent?.category).toBeNull();
    expect(parent?.amount).toBe(-3000);

    const children = await runQuery<TransactionRow>(
      "SELECT * FROM transactions WHERE parent_id = ? ORDER BY amount DESC",
      [parentId],
    );
    expect(children).toHaveLength(2);
    expect(children.every((c) => c.isChild === 1)).toBe(true);
    expect(children.every((c) => c.parent_id === parentId)).toBe(true);
    // expense: sign applied per line (negated)
    expect(children.map((c) => c.amount).sort((a, b) => a - b)).toEqual([-2000, -1000]);
  });

  it("income split: sign applied per line (positive)", async () => {
    const { accountA, payeeId, categoryId, categoryId2 } = await setupFixtures();
    const parentId = await saveTransaction(
      splitInput({
        account: accountA,
        payeeId,
        amount: 3000,
        type: "income",
        splitCategories: [
          { categoryId, categoryName: "Groceries", amount: 1000 },
          { categoryId: categoryId2, categoryName: "Dining", amount: 2000 },
        ],
      }),
    );
    const children = await runQuery<TransactionRow>(
      "SELECT * FROM transactions WHERE parent_id = ?",
      [parentId],
    );
    expect(children.map((c) => c.amount).sort((a, b) => a - b)).toEqual([1000, 2000]);
  });

  it("children do NOT inherit parent notes (children.notes is null)", async () => {
    const { accountA, payeeId, categoryId, categoryId2 } = await setupFixtures();
    const parentId = await saveTransaction(
      splitInput({
        account: accountA,
        payeeId,
        notes: "parent-only note",
        splitCategories: [
          { categoryId, categoryName: "Groceries", amount: 1000 },
          { categoryId: categoryId2, categoryName: "Dining", amount: 2000 },
        ],
      }),
    );
    const parent = await getTxnRow(parentId);
    expect(parent?.notes).toBe("parent-only note");

    const children = await runQuery<TransactionRow>(
      "SELECT * FROM transactions WHERE parent_id = ?",
      [parentId],
    );
    expect(children.every((c) => c.notes === null)).toBe(true);
  });

  // KNOWN-ODD: the code does not enforce children.amount summing to the
  // parent's amount anywhere (no validation, no error). This test pins that
  // absence of an invariant — split.ts's recalculateSplit() computes a
  // SplitTransactionError for *in-memory* diffing use, but saveTransaction()
  // never calls it, so nothing stops mismatched sums from being persisted.
  it("KNOWN-ODD: child amounts need not sum to the parent's amount — no invariant enforced", async () => {
    const { accountA, payeeId, categoryId, categoryId2 } = await setupFixtures();
    const parentId = await saveTransaction(
      splitInput({
        account: accountA,
        payeeId,
        amount: 3000, // parent amount
        splitCategories: [
          { categoryId, categoryName: "Groceries", amount: 100 },
          { categoryId: categoryId2, categoryName: "Dining", amount: 200 },
        ], // children sum to 300, nowhere near 3000
      }),
    );
    const parent = await getTxnRow(parentId);
    expect(parent?.amount).toBe(-3000);

    const children = await runQuery<TransactionRow>(
      "SELECT * FROM transactions WHERE parent_id = ?",
      [parentId],
    );
    const childSum = children.reduce((sum, c) => sum + c.amount, 0);
    expect(childSum).toBe(-300);
    expect(childSum).not.toBe(parent?.amount);
  });
});

describe("saveTransaction — split-edit", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("deletes old children (tombstoned) and creates new ones for the edited split", async () => {
    const { accountA, payeeId, categoryId, categoryId2 } = await setupFixtures();
    const parentId = await saveTransaction(
      splitInput({
        account: accountA,
        payeeId,
        amount: 3000,
        splitCategories: [
          { categoryId, categoryName: "Groceries", amount: 1000 },
          { categoryId: categoryId2, categoryName: "Dining", amount: 2000 },
        ],
      }),
    );
    const oldChildren = await getChildTransactions(parentId);
    expect(oldChildren).toHaveLength(2);
    const oldChildIds = oldChildren.map((c) => c.id);

    // Edit: replace with two different new split lines. NOTE: a single split
    // line does NOT count as a split — saveTransaction's `isSplit` check is
    // `splitCategories.length > 1`, so editing down to one line silently
    // falls through to the simple-edit branch and leaves the old children
    // untouched (see the KNOWN-ODD test below, which pins that behavior).
    await saveTransaction(
      splitInput({
        transactionId: parentId,
        account: accountA,
        payeeId,
        amount: 3000,
        splitCategories: [
          { categoryId, categoryName: "Groceries", amount: 1800 },
          { categoryId: categoryId2, categoryName: "Dining", amount: 1200 },
        ],
      }),
    );

    // Old children are tombstoned, not hard-deleted
    const oldRows = await runQuery<TransactionRow>(
      `SELECT * FROM transactions WHERE id IN (${oldChildIds.map(() => "?").join(",")})`,
      oldChildIds,
    );
    expect(oldRows.every((r) => r.tombstone === 1)).toBe(true);

    // getChildTransactions (alive-only) now returns just the new children
    const newChildren = await getChildTransactions(parentId);
    expect(newChildren).toHaveLength(2);
    for (const c of newChildren) {
      expect(oldChildIds).not.toContain(c.id);
    }
    expect(newChildren.map((c) => c.amount).sort((a, b) => a - b)).toEqual([-1800, -1200]);
  });

  it("KNOWN-ODD: editing a split down to a single line does NOT go through the split-edit path — isSplit requires length > 1, so it silently falls through to simple-edit and leaves the old children alive and untouched", async () => {
    const { accountA, payeeId, categoryId, categoryId2 } = await setupFixtures();
    const parentId = await saveTransaction(
      splitInput({
        account: accountA,
        payeeId,
        amount: 3000,
        splitCategories: [
          { categoryId, categoryName: "Groceries", amount: 1000 },
          { categoryId: categoryId2, categoryName: "Dining", amount: 2000 },
        ],
      }),
    );
    const oldChildren = await getChildTransactions(parentId);
    expect(oldChildren).toHaveLength(2);

    await saveTransaction(
      splitInput({
        transactionId: parentId,
        account: accountA,
        payeeId,
        amount: 3000,
        splitCategories: [{ categoryId, categoryName: "Groceries", amount: 3000 }],
      }),
    );

    // The old children are still alive and unchanged — the "split-edit" the
    // caller asked for never happened because splitCategories.length === 1.
    const childrenAfter = await getChildTransactions(parentId);
    expect(childrenAfter).toHaveLength(2);
    expect(childrenAfter.map((c) => c.id).sort()).toEqual(oldChildren.map((c) => c.id).sort());
    // The parent itself IS updated (simple-edit still runs), but is_parent
    // remains true and category remains NULL since those weren't part of
    // the simple-edit payload's field set being overwritten meaningfully
    // here (category stays whatever simple-edit passes — see below).
    const parent = await getTxnRow(parentId);
    expect(parent?.isParent).toBe(1);
  });

  it("split-edit sets is_parent=true on the parent again (idempotent)", async () => {
    const { accountA, payeeId, categoryId, categoryId2 } = await setupFixtures();
    const parentId = await saveTransaction(
      splitInput({
        account: accountA,
        payeeId,
        splitCategories: [
          { categoryId, categoryName: "Groceries", amount: 1000 },
          { categoryId: categoryId2, categoryName: "Dining", amount: 2000 },
        ],
      }),
    );

    await saveTransaction(
      splitInput({
        transactionId: parentId,
        account: accountA,
        payeeId,
        notes: "updated note",
        splitCategories: [
          { categoryId, categoryName: "Groceries", amount: 1500 },
          { categoryId: categoryId2, categoryName: "Dining", amount: 1500 },
        ],
      }),
    );

    const parent = await getTxnRow(parentId);
    expect(parent?.isParent).toBe(1);
    expect(parent?.notes).toBe("updated note");
  });
});

describe("deleteTransaction — cascades to split children", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("deleting the parent tombstones all of its children too", async () => {
    const { accountA, payeeId, categoryId, categoryId2 } = await setupFixtures();
    const parentId = await saveTransaction(
      splitInput({
        account: accountA,
        payeeId,
        splitCategories: [
          { categoryId, categoryName: "Groceries", amount: 1000 },
          { categoryId: categoryId2, categoryName: "Dining", amount: 2000 },
        ],
      }),
    );
    const children = await getChildTransactions(parentId);
    expect(children).toHaveLength(2);

    await deleteTransaction(parentId);

    const parentRow = await getTxnRow(parentId);
    expect(parentRow?.tombstone).toBe(1);

    const childRows = await runQuery<TransactionRow>(
      `SELECT * FROM transactions WHERE id IN (${children.map(() => "?").join(",")})`,
      children.map((c) => c.id),
    );
    expect(childRows.every((r) => r.tombstone === 1)).toBe(true);
  });
});
