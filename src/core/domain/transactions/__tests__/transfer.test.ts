import { describe, it, expect, afterEach, vi } from "vitest";

// See save.test.ts for why this stub is needed.
vi.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: vi.fn(),
  getForegroundPermissionsAsync: vi.fn(),
  getCurrentPositionAsync: vi.fn(),
}));

import { setupFixtures, closeTestDb, getTxnRow } from "./helpers";
import { saveTransaction } from "../save";
import type { SaveTransactionInput } from "../save";
import { addTransaction, updateTransaction, deleteTransaction } from "../index";
import { createAccount } from "@/core/domain/accounts";
import { first, runQuery } from "@/core/db";
import type { TransactionRow } from "@/core/db/types";

/**
 * Characterization tests for the transfer lifecycle hooks in transfer.ts
 * (onInsert/onUpdate/onDelete), driven through addTransaction/updateTransaction
 * /deleteTransaction (plan 002). These pin CURRENT behavior — see
 * plans/002-transactions-characterization-tests.md.
 */

describe("transfer lifecycle — onInsert (via addTransaction)", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("addTransaction with a transfer payee creates a mirror in the destination account, negated amount, linked via transferred_id both ways", async () => {
    const { accountA, accountB, transferPayeeB } = await setupFixtures();

    const id = await addTransaction({
      account: accountA,
      date: 20260101,
      amount: -1500,
      payee: transferPayeeB, // transfer_acct = accountB
      notes: "moving money",
    });

    const original = await getTxnRow(id);
    expect(original?.transferred_id).toBeTruthy();

    const mirror = await getTxnRow(original!.transferred_id!);
    expect(mirror).not.toBeNull();
    expect(mirror?.acct).toBe(accountB);
    expect(mirror?.amount).toBe(1500); // negated
    expect(mirror?.transferred_id).toBe(id);
    expect(mirror?.notes).toBe("moving money");
    expect(mirror?.cleared).toBe(0);
  });

  it("category is cleared on both sides when source and destination share the same on/off-budget status", async () => {
    const { accountA, categoryId } = await setupFixtures();
    // accountA is on-budget; create a second on-budget account to transfer to.
    const accountC = await createAccount({ name: "Checking 2", offbudget: false });
    const transferPayeeC = await first<{ id: string }>(
      "SELECT id FROM payees WHERE transfer_acct = ?",
      [accountC],
    );

    const id = await addTransaction({
      account: accountA,
      date: 20260101,
      amount: -1000,
      payee: transferPayeeC!.id,
      category: categoryId,
    });

    const original = await getTxnRow(id);
    expect(original?.category).toBeNull();

    const mirror = await getTxnRow(original!.transferred_id!);
    expect(mirror?.category).toBeNull();
  });

  it("category is NOT cleared when source and destination differ in on/off-budget status", async () => {
    const { accountA, transferPayeeB, categoryId } = await setupFixtures();
    // accountA is on-budget, accountB (transferPayeeB's account) is off-budget.
    const id = await addTransaction({
      account: accountA,
      date: 20260101,
      amount: -1000,
      payee: transferPayeeB,
      category: categoryId,
    });

    const original = await getTxnRow(id);
    expect(original?.category).toBe(categoryId);
  });

  it("addTransaction with a non-transfer payee does not create a mirror", async () => {
    const { accountA, payeeId } = await setupFixtures();
    const id = await addTransaction({
      account: accountA,
      date: 20260101,
      amount: -500,
      payee: payeeId,
    });
    const row = await getTxnRow(id);
    expect(row?.transferred_id).toBeNull();
  });
});

describe("transfer lifecycle — onUpdate (via updateTransaction)", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("became a transfer: changing payee from normal to a transfer payee creates the mirror", async () => {
    const { accountA, payeeId, transferPayeeB } = await setupFixtures();
    const id = await addTransaction({
      account: accountA,
      date: 20260101,
      amount: -1000,
      payee: payeeId,
    });
    let row = await getTxnRow(id);
    expect(row?.transferred_id).toBeNull();

    await updateTransaction(id, { payee: transferPayeeB });

    row = await getTxnRow(id);
    expect(row?.transferred_id).toBeTruthy();
    const mirror = await getTxnRow(row!.transferred_id!);
    expect(mirror?.amount).toBe(1000);
  });

  it("no longer a transfer: changing payee from transfer to normal tombstones the mirror and clears transferred_id", async () => {
    const { accountA, transferPayeeB, payeeId } = await setupFixtures();
    const id = await addTransaction({
      account: accountA,
      date: 20260101,
      amount: -1000,
      payee: transferPayeeB,
    });
    const row = await getTxnRow(id);
    const mirrorId = row!.transferred_id!;

    await updateTransaction(id, { payee: payeeId });

    const rowAfter = await getTxnRow(id);
    expect(rowAfter?.transferred_id).toBeNull();

    const mirrorAfter = await getTxnRow(mirrorId);
    expect(mirrorAfter?.tombstone).toBe(1);
    expect(mirrorAfter?.transferred_id).toBeNull();
  });

  it("amount change propagates negated to the mirror", async () => {
    const { accountA, transferPayeeB } = await setupFixtures();
    const id = await addTransaction({
      account: accountA,
      date: 20260101,
      amount: -1000,
      payee: transferPayeeB,
    });
    const row = await getTxnRow(id);
    const mirrorId = row!.transferred_id!;

    await updateTransaction(id, { amount: -2500 });

    const mirrorAfter = await getTxnRow(mirrorId);
    expect(mirrorAfter?.amount).toBe(2500);
  });

  it("date change propagates to the mirror", async () => {
    const { accountA, transferPayeeB } = await setupFixtures();
    const id = await addTransaction({
      account: accountA,
      date: 20260101,
      amount: -1000,
      payee: transferPayeeB,
    });
    const row = await getTxnRow(id);
    const mirrorId = row!.transferred_id!;

    await updateTransaction(id, { date: 20260215 });

    const mirrorAfter = await getTxnRow(mirrorId);
    expect(mirrorAfter?.date).toBe(20260215);
  });
});

describe("transfer lifecycle — onDelete (via deleteTransaction)", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("deleting the original tombstones the mirror", async () => {
    const { accountA, transferPayeeB } = await setupFixtures();
    const id = await addTransaction({
      account: accountA,
      date: 20260101,
      amount: -1000,
      payee: transferPayeeB,
    });
    const row = await getTxnRow(id);
    const mirrorId = row!.transferred_id!;

    await deleteTransaction(id);

    const mirrorAfter = await getTxnRow(mirrorId);
    expect(mirrorAfter?.tombstone).toBe(1);
  });
});

describe("transfer lifecycle — split + transfer payee (fixed, plan 005)", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  async function countRowsInAccountB(transferPayeeB: string): Promise<number> {
    const accountB = (await first<{ id: string }>(
      "SELECT transfer_acct AS id FROM payees WHERE id = ?",
      [transferPayeeB],
    ))!.id;
    const rows = await runQuery<TransactionRow>(
      "SELECT * FROM transactions WHERE acct = ? AND tombstone = 0",
      [accountB],
    );
    return rows.length;
  }

  it("a split-new whose payee is a transfer payee creates ZERO mirror transactions — splits and transfers are mutually exclusive", async () => {
    const { accountA, transferPayeeB, categoryId, categoryId2 } = await setupFixtures();

    const input: SaveTransactionInput = {
      account: accountA,
      date: 20260101,
      amount: 3000,
      type: "expense",
      payeeId: transferPayeeB,
      payeeName: "",
      categoryId: null,
      notes: null,
      cleared: false,
      splitCategories: [
        { categoryId, categoryName: "Groceries", amount: 1000 },
        { categoryId: categoryId2, categoryName: "Dining", amount: 2000 },
      ],
    };
    const parentId = await saveTransaction(input);

    // Fixed behavior: addTransaction skips the transfer hook for is_parent/
    // is_child rows, so no mirror rows are created in accountB at all.
    expect(await countRowsInAccountB(transferPayeeB)).toBe(0);

    const parent = await getTxnRow(parentId);
    expect(parent?.transferred_id).toBeNull();
  });

  it("a split-EDIT (children deleted + recreated) with a transfer payee creates ZERO new mirrors", async () => {
    const { accountA, transferPayeeB, categoryId, categoryId2 } = await setupFixtures();

    const parentId = await saveTransaction({
      account: accountA,
      date: 20260101,
      amount: 3000,
      type: "expense",
      payeeId: transferPayeeB,
      payeeName: "",
      categoryId: null,
      notes: null,
      cleared: false,
      splitCategories: [
        { categoryId, categoryName: "Groceries", amount: 1000 },
        { categoryId: categoryId2, categoryName: "Dining", amount: 2000 },
      ],
    });
    expect(await countRowsInAccountB(transferPayeeB)).toBe(0);

    await saveTransaction({
      transactionId: parentId,
      account: accountA,
      date: 20260101,
      amount: 3000,
      type: "expense",
      payeeId: transferPayeeB,
      payeeName: "",
      categoryId: null,
      notes: null,
      cleared: false,
      splitCategories: [
        { categoryId, categoryName: "Groceries", amount: 1800 },
        { categoryId: categoryId2, categoryName: "Dining", amount: 1200 },
      ],
    });

    // The delete+recreate of children during split-edit must not spawn any
    // mirrors either — still zero rows in accountB.
    expect(await countRowsInAccountB(transferPayeeB)).toBe(0);
  });

  it("editing a split child row's amount does not trigger any onUpdate mirror side effects", async () => {
    const { accountA, transferPayeeB, categoryId, categoryId2 } = await setupFixtures();

    const parentId = await saveTransaction({
      account: accountA,
      date: 20260101,
      amount: 3000,
      type: "expense",
      payeeId: transferPayeeB,
      payeeName: "",
      categoryId: null,
      notes: null,
      cleared: false,
      splitCategories: [
        { categoryId, categoryName: "Groceries", amount: 1000 },
        { categoryId: categoryId2, categoryName: "Dining", amount: 2000 },
      ],
    });
    const children = await runQuery<TransactionRow>(
      "SELECT * FROM transactions WHERE parent_id = ? AND tombstone = 0",
      [parentId],
    );
    expect(children).toHaveLength(2);
    expect(await countRowsInAccountB(transferPayeeB)).toBe(0);

    // Directly update a child row's amount (isChild=1 in the DB) — the
    // onUpdate guard must key off the DB's isChild flag, not just the
    // incoming fields, so this must not spawn a mirror either.
    await updateTransaction(children[0].id, { amount: -1500 });

    expect(await countRowsInAccountB(transferPayeeB)).toBe(0);
    const childAfter = await getTxnRow(children[0].id);
    expect(childAfter?.amount).toBe(-1500);
    expect(childAfter?.transferred_id).toBeNull();
  });
});
