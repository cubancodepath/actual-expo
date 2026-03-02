/**
 * Transfer lifecycle hooks — mirrors loot-core/src/server/transactions/transfer.ts
 *
 * A transfer is identified by its payee having transfer_acct set.
 * Two transactions are paired: original and its mirror in the other account,
 * linked via transferred_id on both sides.
 */

import { randomUUID } from 'expo-crypto';
import { first } from '../db';
import { sendMessages } from '../sync';
import { Timestamp } from '../crdt';

/** Returns the destination account ID if payeeId is a transfer payee, else null. */
export async function getTransferAccount(payeeId: string | null): Promise<string | null> {
  if (!payeeId) return null;
  const row = await first<{ transfer_acct: string | null }>(
    'SELECT transfer_acct FROM payees WHERE id = ? AND tombstone = 0',
    [payeeId],
  );
  return row?.transfer_acct ?? null;
}

/** Returns the transfer payee ID associated with an account. */
async function getTransferPayee(accountId: string): Promise<string | null> {
  const row = await first<{ id: string }>(
    'SELECT id FROM payees WHERE transfer_acct = ? AND tombstone = 0',
    [accountId],
  );
  return row?.id ?? null;
}

/**
 * If both accounts share the same budget type (both on-budget or both off-budget)
 * there is no net budget impact, so clear category on both sides.
 */
async function clearCategoryIfNeeded(
  fromAccountId: string,
  toAccountId: string,
  txnId: string,
  pairedId: string,
): Promise<void> {
  const from = await first<{ offbudget: number }>('SELECT offbudget FROM accounts WHERE id = ?', [fromAccountId]);
  const to   = await first<{ offbudget: number }>('SELECT offbudget FROM accounts WHERE id = ?', [toAccountId]);
  if (from && to && from.offbudget === to.offbudget) {
    await sendMessages([
      { timestamp: Timestamp.send()!, dataset: 'transactions', row: txnId,   column: 'category', value: null },
      { timestamp: Timestamp.send()!, dataset: 'transactions', row: pairedId, column: 'category', value: null },
    ]);
  }
}

// ---------------------------------------------------------------------------
// Lifecycle hooks
// ---------------------------------------------------------------------------

/**
 * Called after addTransaction. If the payee is a transfer payee, creates the
 * paired transaction in the destination account and links both via transferred_id.
 */
export async function onInsert(txn: {
  id: string;
  acct: string;
  amount: number;
  date: number;
  description: string | null; // payee id
  notes: string | null;
}): Promise<void> {
  const toAccountId = await getTransferAccount(txn.description);
  if (!toAccountId) return;

  const fromPayeeId = await getTransferPayee(txn.acct);
  if (!fromPayeeId) return;

  const pairedId = randomUUID();

  // Create the mirror transaction in the destination account
  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: 'transactions', row: pairedId, column: 'acct',          value: toAccountId },
    { timestamp: Timestamp.send()!, dataset: 'transactions', row: pairedId, column: 'amount',        value: -txn.amount },
    { timestamp: Timestamp.send()!, dataset: 'transactions', row: pairedId, column: 'date',          value: txn.date },
    { timestamp: Timestamp.send()!, dataset: 'transactions', row: pairedId, column: 'description',   value: fromPayeeId },
    { timestamp: Timestamp.send()!, dataset: 'transactions', row: pairedId, column: 'notes',         value: txn.notes ?? null },
    { timestamp: Timestamp.send()!, dataset: 'transactions', row: pairedId, column: 'transferred_id',value: txn.id },
    { timestamp: Timestamp.send()!, dataset: 'transactions', row: pairedId, column: 'cleared',       value: 0 },
  ]);

  // Link the original transaction to the paired one
  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: 'transactions', row: txn.id, column: 'transferred_id', value: pairedId },
  ]);

  await clearCategoryIfNeeded(txn.acct, toAccountId, txn.id, pairedId);
}

/**
 * Called before deleteTransaction. Tombstones the paired transfer transaction.
 */
export async function onDelete(transferredId: string): Promise<void> {
  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: 'transactions', row: transferredId, column: 'tombstone',     value: 1 },
    { timestamp: Timestamp.send()!, dataset: 'transactions', row: transferredId, column: 'transferred_id', value: null },
  ]);
}

/**
 * Called after updateTransaction. Handles all four transfer state transitions:
 * - Was not / still not a transfer → no-op
 * - Became a transfer              → create paired transaction
 * - Was a transfer, no longer is  → tombstone paired transaction
 * - Was and still is a transfer   → update paired transaction
 */
export async function onUpdate(
  prev: {
    id: string;
    acct: string;
    amount: number;
    date: number;
    description: string | null;
    notes: string | null;
    transferred_id: string | null;
  },
  next: {
    acct?: string;
    amount?: number;
    date?: number;
    description?: string | null;
    notes?: string | null;
  },
): Promise<void> {
  // Compute the merged final state
  const merged = {
    acct:        next.acct        ?? prev.acct,
    amount:      next.amount      ?? prev.amount,
    date:        next.date        ?? prev.date,
    description: next.description !== undefined ? next.description : prev.description,
    notes:       next.notes       !== undefined ? next.notes       : prev.notes,
  };

  const prevTransferAcct = await getTransferAccount(prev.description);
  const nextTransferAcct = await getTransferAccount(merged.description);

  if (!prevTransferAcct && !nextTransferAcct) return;

  if (!prevTransferAcct && nextTransferAcct) {
    // Became a transfer
    await onInsert({ id: prev.id, ...merged });
    return;
  }

  if (prevTransferAcct && !nextTransferAcct) {
    // No longer a transfer
    if (prev.transferred_id) {
      await onDelete(prev.transferred_id);
      await sendMessages([
        { timestamp: Timestamp.send()!, dataset: 'transactions', row: prev.id, column: 'transferred_id', value: null },
      ]);
    }
    return;
  }

  // Was and still is a transfer — update the paired side
  if (prev.transferred_id && nextTransferAcct) {
    const fromPayeeId = await getTransferPayee(merged.acct);
    if (!fromPayeeId) return;

    await sendMessages([
      { timestamp: Timestamp.send()!, dataset: 'transactions', row: prev.transferred_id, column: 'acct',        value: nextTransferAcct },
      { timestamp: Timestamp.send()!, dataset: 'transactions', row: prev.transferred_id, column: 'amount',      value: -merged.amount },
      { timestamp: Timestamp.send()!, dataset: 'transactions', row: prev.transferred_id, column: 'date',        value: merged.date },
      { timestamp: Timestamp.send()!, dataset: 'transactions', row: prev.transferred_id, column: 'description', value: fromPayeeId },
      { timestamp: Timestamp.send()!, dataset: 'transactions', row: prev.transferred_id, column: 'notes',       value: merged.notes ?? null },
    ]);

    await clearCategoryIfNeeded(merged.acct, nextTransferAcct, prev.id, prev.transferred_id);
  }
}
