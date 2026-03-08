import { randomUUID } from 'expo-crypto';
import { runQuery, first } from '../db';
import { sendMessages, batchMessages } from '../sync';
import { undoable } from '../sync/undo';
import { Timestamp } from '../crdt';
import type { TransactionRow } from '../db/types';
import type { Transaction, GetTransactionsOptions, TransactionDisplay } from './types';
import { onInsert, onUpdate, onDelete as onDeleteTransfer } from './transfer';
import { todayInt, startOfMonthInt, endOfMonthInt } from '../lib/date';
import { transactionQuery } from './query';

export type { TransactionDisplay } from './types';

function rowToTransaction(r: TransactionRow): Transaction {
  return {
    id: r.id,
    isParent: r.isParent === 1,
    isChild: r.isChild === 1,
    acct: r.acct,
    date: r.date,
    amount: r.amount,
    category: r.category,
    description: r.description,
    notes: r.notes,
    parent_id: r.parent_id ?? null,
    transferred_id: r.transferred_id,
    cleared: r.cleared === 1,
    reconciled: r.reconciled === 1,
    sort_order: r.sort_order,
    starting_balance_flag: r.starting_balance_flag === 1,
    tombstone: r.tombstone === 1,
  };
}

export async function getTransactions(
  opts: GetTransactionsOptions = {},
): Promise<Transaction[]> {
  const conditions: string[] = ['tombstone = 0'];
  const params: (string | number)[] = [];

  if (opts.accountId) {
    conditions.push('acct = ?');
    params.push(opts.accountId);
  }
  if (opts.startDate !== undefined) {
    conditions.push('date >= ?');
    params.push(opts.startDate);
  }
  if (opts.endDate !== undefined) {
    conditions.push('date <= ?');
    params.push(opts.endDate);
  }

  const where = conditions.join(' AND ');
  const limit = opts.limit ? `LIMIT ${opts.limit}` : '';
  const offset = opts.offset ? `OFFSET ${opts.offset}` : '';

  const rows = await runQuery<TransactionRow>(
    `SELECT * FROM transactions WHERE ${where} ORDER BY date DESC, sort_order DESC ${limit} ${offset}`,
    params,
  );
  return rows.map(rowToTransaction);
}

export const addTransaction = undoable(async function addTransaction(
  fields: Omit<Partial<Transaction>, 'id' | 'tombstone'> & { acct: string; date: number; amount: number },
): Promise<string> {
  const id = randomUUID();

  const dbFields: Record<string, unknown> = {
    acct: fields.acct,
    date: fields.date,
    amount: fields.amount,
    isParent: fields.isParent ? 1 : 0,
    isChild: fields.isChild ? 1 : 0,
    category: fields.category ?? null,
    description: fields.description ?? null,
    notes: fields.notes ?? null,
    parent_id: fields.parent_id ?? null,
    transferred_id: fields.transferred_id ?? null,
    cleared: fields.cleared ? 1 : 0,
    reconciled: fields.reconciled ? 1 : 0,
    sort_order: fields.sort_order ?? Date.now(),
    starting_balance_flag: fields.starting_balance_flag ? 1 : 0,
  };

  await sendMessages(
    Object.entries(dbFields).map(([column, value]) => ({
      timestamp: Timestamp.send()!,
      dataset: 'transactions',
      row: id,
      column,
      value: value as string | number | null,
    })),
  );

  // Transfer hook: if payee is a transfer payee, create the paired transaction
  await onInsert({
    id,
    acct: fields.acct,
    amount: fields.amount,
    date: fields.date,
    description: fields.description ?? null,
    notes: fields.notes ?? null,
  });

  return id;
});

/** Duplicate a transaction — copies all fields except cleared/reconciled (reset to false). */
export const duplicateTransaction = undoable(async function duplicateTransaction(id: string): Promise<string | null> {
  const original = await getTransactionById(id);
  if (!original) return null;

  return addTransaction({
    acct: original.acct,
    date: original.date,
    amount: original.amount,
    category: original.category,
    description: original.description,
    notes: original.notes,
    cleared: false,
    reconciled: false,
  });
});

export const updateTransaction = undoable(async function updateTransaction(
  id: string,
  fields: Omit<Partial<Transaction>, 'id' | 'tombstone'>,
): Promise<void> {
  // Fetch current state before updating (needed for transfer hook)
  const prev = await first<TransactionRow>('SELECT * FROM transactions WHERE id = ? AND tombstone = 0', [id]);

  const dbFields: Record<string, unknown> = {};
  const boolFields = ['isParent', 'isChild', 'cleared', 'reconciled', 'starting_balance_flag'] as const;
  const directFields = ['acct', 'date', 'amount', 'category', 'description', 'notes', 'parent_id', 'transferred_id', 'sort_order'] as const;

  for (const f of boolFields) {
    if (fields[f] !== undefined) dbFields[f] = fields[f] ? 1 : 0;
  }
  for (const f of directFields) {
    if (fields[f] !== undefined) dbFields[f] = fields[f] ?? null;
  }

  if (Object.keys(dbFields).length === 0) return;

  await sendMessages(
    Object.entries(dbFields).map(([column, value]) => ({
      timestamp: Timestamp.send()!,
      dataset: 'transactions',
      row: id,
      column,
      value: value as string | number | null,
    })),
  );

  // Transfer hook: sync changes to the paired transaction if needed
  if (prev) {
    await onUpdate(
      {
        id,
        acct:          prev.acct,
        amount:        prev.amount,
        date:          prev.date,
        description:   prev.description,
        notes:         prev.notes,
        transferred_id: prev.transferred_id,
      },
      {
        acct:        fields.acct,
        amount:      fields.amount,
        date:        fields.date,
        description: fields.description,
        notes:       fields.notes,
      },
    );
  }
});

/** Toggle the cleared flag on a transaction (skips reconciled transactions). */
export const toggleCleared = undoable(async function toggleCleared(id: string): Promise<void> {
  const row = await first<{ cleared: number; reconciled: number }>(
    'SELECT cleared, reconciled FROM transactions WHERE id = ? AND tombstone = 0', [id],
  );
  if (!row || row.reconciled === 1) return;
  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: 'transactions', row: id, column: 'cleared', value: row.cleared === 1 ? 0 : 1 },
  ]);
});

/**
 * Set the cleared flag on multiple transactions at once.
 * Skips reconciled transactions and those already in the target state.
 * Uses batchMessages for sync efficiency.
 */
export const setClearedBulk = undoable(async function setClearedBulk(ids: string[], cleared: boolean): Promise<number> {
  if (ids.length === 0) return 0;

  const placeholders = ids.map(() => '?').join(',');
  const rows = await runQuery<{ id: string; cleared: number; reconciled: number }>(
    `SELECT id, cleared, reconciled FROM transactions WHERE id IN (${placeholders}) AND tombstone = 0`,
    ids,
  );

  const targetVal = cleared ? 1 : 0;
  const toUpdate = rows.filter(r => r.reconciled !== 1 && r.cleared !== targetVal);
  if (toUpdate.length === 0) return 0;

  await batchMessages(async () => {
    for (const row of toUpdate) {
      await sendMessages([
        { timestamp: Timestamp.send()!, dataset: 'transactions', row: row.id, column: 'cleared', value: targetVal },
      ]);
    }
  });

  return toUpdate.length;
});

/**
 * Sum of cleared (non-parent) transaction amounts for an account, in cents.
 * Mirrors loot-core's cleared balance calculation.
 */
export async function getClearedBalance(accountId: string): Promise<number> {
  const row = await first<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM transactions
     WHERE acct = ? AND cleared = 1 AND isParent = 0 AND tombstone = 0`,
    [accountId],
  );
  return row?.total ?? 0;
}

/**
 * Lock all cleared-but-not-yet-reconciled transactions for an account.
 * Mirrors loot-core's lockTransactions().
 */
export async function lockTransactions(accountId: string): Promise<void> {
  const rows = await runQuery<{ id: string }>(
    `SELECT id FROM transactions
     WHERE acct = ? AND cleared = 1 AND reconciled = 0 AND tombstone = 0`,
    [accountId],
  );
  if (rows.length === 0) return;
  await sendMessages(
    rows.map(r => ({
      timestamp: Timestamp.send()!,
      dataset: 'transactions',
      row: r.id,
      column: 'reconciled',
      value: 1,
    })),
  );
}

/**
 * Reconcile an account: optionally create an adjustment transaction
 * to match the bank balance, then lock all cleared transactions.
 */
export const reconcileAccount = undoable(async function reconcileAccount(
  accountId: string,
  bankBalance: number,
): Promise<{ adjusted: boolean; diff: number }> {
  const cleared = await getClearedBalance(accountId);
  const diff = bankBalance - cleared;

  await batchMessages(async () => {
    if (diff !== 0) {
      await addTransaction({
        acct: accountId,
        date: todayInt(),
        amount: diff,
        cleared: true,
        notes: 'Reconciliation balance adjustment',
      });
    }

    await lockTransactions(accountId);
  });

  return { adjusted: diff !== 0, diff };
});

export const deleteTransaction = undoable(async function deleteTransaction(id: string): Promise<void> {
  // Fetch row info before tombstoning
  const row = await first<{ transferred_id: string | null; isParent: 0 | 1 }>(
    'SELECT transferred_id, isParent FROM transactions WHERE id = ? AND tombstone = 0',
    [id],
  );

  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: 'transactions', row: id, column: 'tombstone', value: 1 },
  ]);

  // If this is a parent split, also tombstone all children
  if (row?.isParent === 1) {
    const children = await runQuery<{ id: string; transferred_id: string | null }>(
      'SELECT id, transferred_id FROM transactions WHERE parent_id = ? AND tombstone = 0',
      [id],
    );
    for (const child of children) {
      await sendMessages([
        { timestamp: Timestamp.send()!, dataset: 'transactions', row: child.id, column: 'tombstone', value: 1 },
      ]);
      if (child.transferred_id) {
        await onDeleteTransfer(child.transferred_id);
      }
    }
  }

  // Transfer hook: tombstone the paired transaction
  if (row?.transferred_id) {
    await onDeleteTransfer(row.transferred_id);
  }
});

// ---------------------------------------------------------------------------
// Display query — joins payee and category names
// ---------------------------------------------------------------------------

export async function getTransactionById(id: string): Promise<TransactionDisplay | null> {
  const rows = await transactionQuery()
    .filter('t.id = ?', [id])
    .filter('t.tombstone = 0')
    .execute();
  return rows[0] ?? null;
}

const PAGE_SIZE = 25;

export async function getTransactionsForAccount(
  accountId: string,
  opts?: { limit?: number; offset?: number; hideReconciled?: boolean },
): Promise<TransactionDisplay[]> {
  return transactionQuery()
    .forAccount(accountId)
    .alive()
    .when(opts?.hideReconciled, q => q.hideReconciled())
    .includeSplitDetails()
    .limit(opts?.limit ?? PAGE_SIZE)
    .offset(opts?.offset ?? 0)
    .execute();
}

/** All transactions across every account with pagination. */
export async function getAllTransactions(opts?: {
  limit?: number;
  offset?: number;
  hideReconciled?: boolean;
}): Promise<TransactionDisplay[]> {
  return transactionQuery()
    .alive()
    .includeAccountName()
    .includeSplitDetails()
    .when(opts?.hideReconciled, q => q.hideReconciled())
    .limit(opts?.limit ?? PAGE_SIZE)
    .offset(opts?.offset ?? 0)
    .execute();
}

/** Search transactions with text + status filters across all accounts. */
export async function searchTransactions(opts: {
  text?: string;
  accountId?: string;
  categoryId?: string;
  payeeId?: string;
  cleared?: boolean;
  uncleared?: boolean;
  reconciled?: boolean;
  unreconciled?: boolean;
  uncategorized?: boolean;
  tagName?: string;
  tagNames?: string[];
  hideReconciled?: boolean;
  limit?: number;
  offset?: number;
}): Promise<TransactionDisplay[]> {
  const q = transactionQuery()
    .alive()
    .includeAccountName()
    .includeSplitDetails()
    .when(opts.hideReconciled, q => q.hideReconciled())
    .when(!!opts.accountId, q => q.forAccount(opts.accountId!))
    .when(!!opts.categoryId, q => q.withCategory(opts.categoryId!))
    .when(!!opts.payeeId, q => q.withPayee(opts.payeeId!))
    .when(opts.uncategorized, q => q.uncategorized())
    .when(!!opts.text, q => q.textSearch(opts.text!));

  // Tag filters
  if (opts.tagNames && opts.tagNames.length > 0) {
    q.withTags(opts.tagNames);
  } else if (opts.tagName) {
    q.withTag(opts.tagName);
  }

  // Status filters
  if (opts.cleared || opts.uncleared || opts.reconciled || opts.unreconciled) {
    q.withStatus({
      cleared: opts.cleared,
      uncleared: opts.uncleared,
      reconciled: opts.reconciled,
      unreconciled: opts.unreconciled,
    });
  }

  return q
    .limit(opts.limit ?? PAGE_SIZE)
    .offset(opts.offset ?? 0)
    .execute();
}

// ---------------------------------------------------------------------------
// Spending summary — aggregates for the current month
// ---------------------------------------------------------------------------

export interface SpendingSummary {
  totalSpent: number;       // cents, negative or zero
  totalIncome: number;      // cents, positive or zero
  transactionCount: number;
  topCategories: Array<{ categoryName: string; total: number; count: number }>;
}

export async function getSpendingSummary(
  start?: number,
  end?: number,
): Promise<SpendingSummary> {
  const startDate = start ?? startOfMonthInt();
  const endDate = end ?? endOfMonthInt();

  const totalsRow = await first<{
    totalSpent: number;
    totalIncome: number;
    transactionCount: number;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN t.amount < 0 THEN t.amount ELSE 0 END), 0) AS totalSpent,
       COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0) AS totalIncome,
       COUNT(*) AS transactionCount
     FROM transactions t
     JOIN accounts a ON a.id = t.acct AND a.offbudget = 0 AND a.tombstone = 0
     WHERE t.tombstone = 0 AND t.isParent = 0
       AND t.date >= ? AND t.date <= ?`,
    [startDate, endDate],
  );

  const catRows = await runQuery<{ categoryName: string; total: number; count: number }>(
    `SELECT
       c.name AS categoryName,
       COALESCE(SUM(t.amount), 0) AS total,
       COUNT(*) AS count
     FROM transactions t
     JOIN accounts a ON a.id = t.acct AND a.offbudget = 0 AND a.tombstone = 0
     LEFT JOIN category_mapping cm ON cm.id = t.category
     LEFT JOIN categories c ON COALESCE(cm.transferId, t.category) = c.id AND c.tombstone = 0
     WHERE t.tombstone = 0 AND t.isParent = 0 AND t.amount < 0
       AND t.date >= ? AND t.date <= ?
       AND c.id IS NOT NULL
     GROUP BY c.id, c.name
     ORDER BY total ASC
     LIMIT 5`,
    [startDate, endDate],
  );

  return {
    totalSpent: totalsRow?.totalSpent ?? 0,
    totalIncome: totalsRow?.totalIncome ?? 0,
    transactionCount: totalsRow?.transactionCount ?? 0,
    topCategories: catRows,
  };
}

/**
 * Returns the count and total amount of uncategorized transactions on
 * on-budget accounts. Excludes transfers between on-budget accounts
 * (those are auto-categorized by the envelope budget model) but
 * includes transfers to off-budget accounts, which do need a category.
 */
export async function getUncategorizedStats(): Promise<{ count: number; total: number }> {
  const row = await first<{ count: number; total: number }>(
    `SELECT COUNT(*) AS count, COALESCE(SUM(t.amount), 0) AS total
     FROM transactions t
     JOIN accounts a ON a.id = t.acct AND a.offbudget = 0 AND a.tombstone = 0
     LEFT JOIN payees p ON p.id = t.description AND p.tombstone = 0
     LEFT JOIN accounts ta ON ta.id = p.transfer_acct AND ta.tombstone = 0
     WHERE t.tombstone = 0
       AND t.isParent = 0
       AND t.category IS NULL
       AND (p.transfer_acct IS NULL OR ta.offbudget = 1)`,
  );
  return { count: row?.count ?? 0, total: row?.total ?? 0 };
}

/** Count of uncleared (and non-reconciled) transactions across all accounts, or for a specific account. */
export async function getUnclearedCount(accountId?: string): Promise<number> {
  const conditions = ['t.tombstone = 0', 't.isChild = 0', 't.cleared = 0', 't.reconciled = 0'];
  const params: string[] = [];
  if (accountId) {
    conditions.push('t.acct = ?');
    params.push(accountId);
  }
  const row = await first<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM transactions t
     JOIN accounts a ON a.id = t.acct AND a.tombstone = 0
     WHERE ${conditions.join(' AND ')}`,
    params,
  );
  return row?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Split transaction queries
// ---------------------------------------------------------------------------

/** Fetch all child transactions for a parent split transaction. */
export async function getChildTransactions(parentId: string): Promise<TransactionDisplay[]> {
  return transactionQuery()
    .filter('t.parent_id = ?', [parentId])
    .filter('t.tombstone = 0')
    .orderBy('t.sort_order ASC')
    .execute();
}

/** Fetch a parent transaction with all its children grouped. */
export async function getTransactionWithChildren(
  id: string,
): Promise<{ parent: TransactionDisplay; children: TransactionDisplay[] } | null> {
  const parent = await getTransactionById(id);
  if (!parent || !parent.isParent) return null;

  const children = await getChildTransactions(id);
  return { parent, children };
}
