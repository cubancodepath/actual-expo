import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { first } from "@/core/db";
import { sendMessages } from "@/core/sync";
import { Timestamp } from "@/core/crdt";
import { createAccount } from "@/core/server/accounts";
import { createCategoryGroup, createCategory } from "@/core/server/budget";
import { fixSplitTransactions } from "../fixSplitTransactions";

let counter = 0;
async function mkTxn(fields: Record<string, string | number | null>): Promise<string> {
  const id = fields.id ? String(fields.id) : `txn-${++counter}`;
  const full = { id, tombstone: 0, isParent: 0, isChild: 0, cleared: 0, ...fields };
  await sendMessages(
    Object.entries(full).map(([column, value]) => ({
      timestamp: Timestamp.send()!,
      dataset: "transactions" as const,
      row: id,
      column,
      value,
    })),
  );
  return id;
}
const row = (id: string) =>
  first<Record<string, unknown>>("SELECT * FROM transactions WHERE id = ?", [id]);

describe("fixSplitTransactions", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("copies a blank child payee from the parent", async () => {
    await openTestDb();
    const acct = await createAccount({ name: "A" });
    const parent = await mkTxn({
      acct,
      amount: -100,
      date: 20260101,
      isParent: 1,
      description: "payee-x",
    });
    const child = await mkTxn({
      acct,
      amount: -100,
      date: 20260101,
      isChild: 1,
      parent_id: parent,
      description: null,
    });

    const res = await fixSplitTransactions();
    expect(res.numBlankPayees).toBe(1);
    expect((await row(child))!.description).toBe("payee-x");
  });

  it("syncs a child's cleared flag to the parent", async () => {
    await openTestDb();
    const acct = await createAccount({ name: "A" });
    const parent = await mkTxn({ acct, amount: -100, date: 20260101, isParent: 1, cleared: 1 });
    const child = await mkTxn({
      acct,
      amount: -100,
      date: 20260101,
      isChild: 1,
      parent_id: parent,
      cleared: 0,
    });

    const res = await fixSplitTransactions();
    expect(res.numCleared).toBe(1);
    expect((await row(child))!.cleared).toBe(1);
  });

  it("tombstones an orphan child whose parent is tombstoned", async () => {
    await openTestDb();
    const acct = await createAccount({ name: "A" });
    const parent = await mkTxn({ acct, amount: -100, date: 20260101, isParent: 1, tombstone: 1 });
    const child = await mkTxn({
      acct,
      amount: -100,
      date: 20260101,
      isChild: 1,
      parent_id: parent,
    });

    const res = await fixSplitTransactions();
    expect(res.numDeleted).toBe(1);
    expect((await row(child))!.tombstone).toBe(1);
  });

  it("detects mismatched split totals without changing them", async () => {
    await openTestDb();
    const acct = await createAccount({ name: "A" });
    const parent = await mkTxn({ acct, amount: -1000, date: 20260101, isParent: 1 });
    await mkTxn({ acct, amount: -600, date: 20260101, isChild: 1, parent_id: parent });
    // child total = 600, parent = 1000 → mismatch of 400.

    const res = await fixSplitTransactions();
    expect(res.mismatchedSplits).toEqual([{ id: parent, parentAmount: -1000, childTotal: -600 }]);
    expect((await row(parent))!.amount).toBe(-1000); // unchanged
  });

  it("clears a category on a same-offbudget transfer", async () => {
    await openTestDb();
    const a1 = await createAccount({ name: "On1", offbudget: false });
    const a2 = await createAccount({ name: "On2", offbudget: false });
    const g = await createCategoryGroup({ name: "G" });
    const cat = await createCategory({ name: "C", group: g });
    const t2 = await mkTxn({ acct: a2, amount: 500, date: 20260101 });
    const t1 = await mkTxn({
      acct: a1,
      amount: -500,
      date: 20260101,
      transferred_id: t2,
      category: cat,
    });
    await mkTxn({ id: t2, transferred_id: t1 });

    const res = await fixSplitTransactions();
    expect(res.numTransfersFixed).toBe(1);
    expect((await row(t1))!.category).toBeNull();
  });

  it("clears a stale error on a non-parent and a category on a parent", async () => {
    await openTestDb();
    const acct = await createAccount({ name: "A" });
    const g = await createCategoryGroup({ name: "G" });
    const cat = await createCategory({ name: "C", group: g });
    const withError = await mkTxn({ acct, amount: -100, date: 20260101, error: '{"x":1}' });
    const parentWithCat = await mkTxn({
      acct,
      amount: -100,
      date: 20260101,
      isParent: 1,
      category: cat,
    });

    const res = await fixSplitTransactions();
    expect(res.numNonParentErrorsFixed).toBe(1);
    expect(res.numParentTransactionsWithCategoryFixed).toBe(1);
    expect((await row(withError))!.error).toBeNull();
    expect((await row(parentWithCat))!.category).toBeNull();
  });
});
