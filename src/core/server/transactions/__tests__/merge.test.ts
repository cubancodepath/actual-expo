import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { first, runQuery } from "@/core/db";
import { sendMessages } from "@/core/sync";
import { Timestamp } from "@/core/crdt";
import { createAccount } from "@/core/server/accounts";
import { createCategoryGroup, createCategory } from "@/core/server/budget";
import { mergeTransactions } from "../merge";

let counter = 0;
type TxnFields = Record<string, string | number | null>;
async function mkTxn(fields: TxnFields): Promise<string> {
  const id = fields.id ? String(fields.id) : `txn-${++counter}`;
  const full: TxnFields = { id, tombstone: 0, isParent: 0, isChild: 0, cleared: 0, ...fields };
  await sendMessages(
    Object.entries(full).map(([column, value]) => ({
      timestamp: Timestamp.send()!,
      dataset: "transactions",
      row: id,
      column,
      value,
    })),
  );
  return id;
}
async function row(id: string) {
  return first<Record<string, unknown>>("SELECT * FROM transactions WHERE id = ?", [id]);
}

describe("mergeTransactions", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  async function setup() {
    await openTestDb();
    const acct = await createAccount({ name: "Checking" });
    const g = await createCategoryGroup({ name: "Expenses" });
    const cat = await createCategory({ name: "Food", cat_group: g });
    return { acct, cat };
  }

  it("keeps the bank-imported one (financial_id), tombstones the other", async () => {
    const { acct } = await setup();
    const a = await mkTxn({ acct, amount: -500, date: 20260115, financial_id: "bank-1" });
    const b = await mkTxn({ acct, amount: -500, date: 20260110 });

    const kept = await mergeTransactions([a, b]);
    expect(kept).toBe(a);
    expect((await row(a))!.tombstone).toBe(0);
    expect((await row(b))!.tombstone).toBe(1);
  });

  it("breaks ties by imported_description, then by earlier date", async () => {
    const { acct } = await setup();
    const a = await mkTxn({ acct, amount: -500, date: 20260115, imported_description: "AMZN" });
    const b = await mkTxn({ acct, amount: -500, date: 20260110 });
    expect(await mergeTransactions([a, b])).toBe(a); // imported_description wins over date

    const c = await mkTxn({ acct, amount: -700, date: 20260101 });
    const d = await mkTxn({ acct, amount: -700, date: 20260220 });
    expect(await mergeTransactions([c, d])).toBe(c); // earlier date wins
  });

  it("coalesces fields drop → keep with keep-wins, OR-ing cleared", async () => {
    const { acct, cat } = await setup();
    // keep = a (has financial_id); keep has notes, no category, not cleared.
    const a = await mkTxn({
      acct,
      amount: -500,
      date: 20260115,
      financial_id: "b1",
      notes: "keep note",
      cleared: 0,
    });
    const b = await mkTxn({
      acct,
      amount: -500,
      date: 20260110,
      category: cat,
      notes: "drop note",
      cleared: 1,
    });

    await mergeTransactions([a, b]);
    const k = await row(a);
    expect(k!.notes).toBe("keep note"); // keep wins
    expect(k!.category).toBe(cat); // filled from drop
    expect(k!.cleared).toBe(1); // OR
  });

  it("promotes keep to a split parent when only drop has children (re-parent)", async () => {
    const { acct, cat } = await setup();
    const keep = await mkTxn({ acct, amount: -1000, date: 20260101, financial_id: "b1" });
    const drop = await mkTxn({ acct, amount: -1000, date: 20260110, isParent: 1 });
    const c1 = await mkTxn({
      acct,
      amount: -600,
      date: 20260110,
      isChild: 1,
      parent_id: drop,
      category: cat,
    });
    const c2 = await mkTxn({ acct, amount: -400, date: 20260110, isChild: 1, parent_id: drop });

    const kept = await mergeTransactions([keep, drop]);
    expect(kept).toBe(keep);
    expect((await row(keep))!.isParent).toBe(1);
    expect((await row(keep))!.category).toBeNull();
    expect((await row(c1))!.parent_id).toBe(keep);
    expect((await row(c2))!.parent_id).toBe(keep);
    expect((await row(drop))!.tombstone).toBe(1);
    // Children stay alive under the new parent.
    expect((await row(c1))!.tombstone).toBe(0);
  });

  it("rejects merging across accounts or with different amounts", async () => {
    const { acct } = await setup();
    const acct2 = await createAccount({ name: "Savings" });
    const a = await mkTxn({ acct, amount: -500, date: 20260101 });
    const diffAcct = await mkTxn({ acct: acct2, amount: -500, date: 20260101 });
    const diffAmt = await mkTxn({ acct, amount: -600, date: 20260101 });

    await expect(mergeTransactions([a, diffAcct])).rejects.toThrow(/different accounts/);
    await expect(mergeTransactions([a, diffAmt])).rejects.toThrow(/different amounts/);
    await expect(mergeTransactions([a])).rejects.toThrow(/exactly 2/);
  });

  it("merges two duplicate transfers: relinks the kept counterpart, tombstones the other", async () => {
    const { acct } = await setup();
    const acct2 = await createAccount({ name: "Savings" });
    // Transfer payee that points at acct2 (on-budget by default → category must be nulled).
    const xferPayee = await first<{ id: string }>("SELECT id FROM payees WHERE transfer_acct = ?", [
      acct2,
    ]);
    const payeeId = xferPayee!.id;

    // Two duplicate transfers from acct → acct2, each with its counterpart in acct2.
    const cpA = await mkTxn({ acct: acct2, amount: 500, date: 20260101 });
    const a = await mkTxn({
      acct,
      amount: -500,
      date: 20260101,
      description: payeeId,
      transferred_id: cpA,
    });
    await mkTxn({ id: cpA, acct: acct2, amount: 500, date: 20260101, transferred_id: a });

    const cpB = await mkTxn({ acct: acct2, amount: 500, date: 20260102 });
    const b = await mkTxn({
      acct,
      amount: -500,
      date: 20260102,
      description: payeeId,
      transferred_id: cpB,
    });
    await mkTxn({ id: cpB, acct: acct2, amount: 500, date: 20260102, transferred_id: b });

    const kept = await mergeTransactions([a, b]);

    // Kept transfer relinks to a single surviving counterpart, both pointing at
    // each other; the dropped transfer + its counterpart are tombstoned.
    const keptRow = await row(kept);
    expect(keptRow!.tombstone).toBe(0);
    const cpId = keptRow!.transferred_id as string;
    expect(cpId).toBeTruthy();
    expect((await row(cpId))!.transferred_id).toBe(kept);
    expect(keptRow!.category).toBeNull(); // on-budget transfer → no category

    const liveTransfers = await runQuery<{ id: string }>(
      "SELECT id FROM transactions WHERE acct = ? AND tombstone = 0",
      [acct],
    );
    expect(liveTransfers).toHaveLength(1); // only the kept one remains in acct
  });
});
