/**
 * Shared fixtures for transaction characterization tests (plan 002).
 *
 * Reuses the testDb.ts pattern from src/core/sync/__tests__ (better-sqlite3
 * in-memory DB + schema + clock). createAccount() already creates a transfer
 * payee for the new account (payees.transfer_acct = <account id>), so we lean
 * on that instead of hand-rolling CRDT messages.
 */
import { openTestDb, closeTestDb } from "@/core/server/db/__tests__/testDb";
import { first } from "@/core/server/db";
import { createAccount } from "@/core/server/accounts";
import { createCategoryGroup, createCategory } from "@/core/server/budget";
import { createPayee } from "@/core/server/payees";
import type { TransactionRow } from "@/core/server/db/types";

export { openTestDb, closeTestDb };

export type Fixtures = {
  /** On-budget account */
  accountA: string;
  /** Off-budget account */
  accountB: string;
  categoryId: string;
  categoryId2: string;
  /** A normal (non-transfer) payee */
  payeeId: string;
  /** The transfer payee auto-created for accountA (transfer_acct = accountA) */
  transferPayeeA: string;
  /** The transfer payee auto-created for accountB (transfer_acct = accountB) */
  transferPayeeB: string;
};

/** Opens a fresh test DB and seeds two accounts, two categories, a normal
 * payee, and each account's auto-created transfer payee. */
export async function setupFixtures(): Promise<Fixtures> {
  await openTestDb();

  const accountA = await createAccount({ name: "Checking", offbudget: false });
  const accountB = await createAccount({ name: "Savings", offbudget: true });

  const group = await createCategoryGroup({ name: "Expenses" });
  const categoryId = await createCategory({ name: "Groceries", groupId: group });
  const categoryId2 = await createCategory({ name: "Dining", groupId: group });

  const payeeId = await createPayee({ name: "Coffee Shop" });

  const transferPayeeARow = await first<{ id: string }>(
    "SELECT id FROM payees WHERE transfer_acct = ?",
    [accountA],
  );
  const transferPayeeBRow = await first<{ id: string }>(
    "SELECT id FROM payees WHERE transfer_acct = ?",
    [accountB],
  );

  return {
    accountA,
    accountB,
    categoryId,
    categoryId2,
    payeeId,
    transferPayeeA: transferPayeeARow!.id,
    transferPayeeB: transferPayeeBRow!.id,
  };
}

export async function getTxnRow(id: string): Promise<TransactionRow | null> {
  const row = await first<TransactionRow>("SELECT * FROM transactions WHERE id = ?", [id]);
  return row ?? null;
}
