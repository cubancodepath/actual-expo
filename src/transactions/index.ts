import { randomUUID } from 'expo-crypto';
import { runQuery, first } from '../db';
import { sendMessages } from '../sync';
import { Timestamp } from '../crdt';
import type { TransactionRow } from '../db/types';
import type { Transaction, GetTransactionsOptions } from './types';
import { onInsert, onUpdate, onDelete as onDeleteTransfer } from './transfer';

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

export async function addTransaction(
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
}

export async function updateTransaction(
  id: string,
  fields: Omit<Partial<Transaction>, 'id' | 'tombstone'>,
): Promise<void> {
  // Fetch current state before updating (needed for transfer hook)
  const prev = await first<TransactionRow>('SELECT * FROM transactions WHERE id = ? AND tombstone = 0', [id]);

  const dbFields: Record<string, unknown> = {};
  const boolFields = ['isParent', 'isChild', 'cleared', 'reconciled', 'starting_balance_flag'] as const;
  const directFields = ['acct', 'date', 'amount', 'category', 'description', 'notes', 'transferred_id', 'sort_order'] as const;

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
}

/** Toggle the cleared flag on a transaction (skips reconciled transactions). */
export async function toggleCleared(id: string): Promise<void> {
  const row = await first<{ cleared: number }>('SELECT cleared FROM transactions WHERE id = ? AND tombstone = 0', [id]);
  if (!row) return;
  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: 'transactions', row: id, column: 'cleared', value: row.cleared === 1 ? 0 : 1 },
  ]);
}

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

export async function deleteTransaction(id: string): Promise<void> {
  // Fetch transferred_id before tombstoning so we can delete the paired transaction
  const row = await first<{ transferred_id: string | null }>(
    'SELECT transferred_id FROM transactions WHERE id = ? AND tombstone = 0',
    [id],
  );

  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: 'transactions', row: id, column: 'tombstone', value: 1 },
  ]);

  // Transfer hook: tombstone the paired transaction
  if (row?.transferred_id) {
    await onDeleteTransfer(row.transferred_id);
  }
}

// ---------------------------------------------------------------------------
// Display query — joins payee and category names
// ---------------------------------------------------------------------------

export async function getTransactionById(id: string): Promise<TransactionDisplay | null> {
  const rows = await runQuery<TransactionRow & { payee_name: string | null; category_name: string | null }>(
    `SELECT t.*,
            COALESCE(a.name, p.name) AS payee_name,
            c.name AS category_name
     FROM   transactions t
     LEFT JOIN payee_mapping    pm ON pm.id = t.description
     LEFT JOIN payees            p ON COALESCE(pm.targetId, t.description) = p.id AND p.tombstone = 0
     LEFT JOIN accounts          a ON p.transfer_acct = a.id AND a.tombstone = 0
     LEFT JOIN category_mapping cm ON cm.id = t.category
     LEFT JOIN categories        c ON COALESCE(cm.transferId, t.category) = c.id AND c.tombstone = 0
     WHERE  t.id = ? AND t.tombstone = 0`,
    [id],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
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
    transferred_id: r.transferred_id,
    cleared: r.cleared === 1,
    reconciled: r.reconciled === 1,
    sort_order: r.sort_order,
    starting_balance_flag: r.starting_balance_flag === 1,
    tombstone: r.tombstone === 1,
    payeeName: r.payee_name,
    categoryName: r.category_name,
  };
}

export type TransactionDisplay = Transaction & {
  payeeName: string | null;
  categoryName: string | null;
  accountName?: string | null; // populated by getAllTransactions
};

const PAGE_SIZE = 50;

export async function getTransactionsForAccount(
  accountId: string,
  opts?: { limit?: number; offset?: number; hideReconciled?: boolean },
): Promise<TransactionDisplay[]> {
  const limit  = opts?.limit  ?? PAGE_SIZE;
  const offset = opts?.offset ?? 0;
  const reconciledClause = opts?.hideReconciled ? 'AND t.reconciled = 0' : '';
  const rows = await runQuery<TransactionRow & { payee_name: string | null; category_name: string | null }>(
    `SELECT t.*,
            COALESCE(a.name, p.name) AS payee_name,
            c.name AS category_name
     FROM   transactions t
     LEFT JOIN payee_mapping    pm ON pm.id = t.description
     LEFT JOIN payees            p ON COALESCE(pm.targetId, t.description) = p.id AND p.tombstone = 0
     LEFT JOIN accounts          a ON p.transfer_acct = a.id AND a.tombstone = 0
     LEFT JOIN category_mapping cm ON cm.id = t.category
     LEFT JOIN categories        c ON COALESCE(cm.transferId, t.category) = c.id AND c.tombstone = 0
     WHERE  t.acct = ? AND t.tombstone = 0 ${reconciledClause}
     ORDER  BY t.date DESC, t.sort_order DESC
     LIMIT ${limit} OFFSET ${offset}`,
    [accountId],
  );
  return rows.map(r => ({
    id: r.id,
    isParent: r.isParent === 1,
    isChild: r.isChild === 1,
    acct: r.acct,
    date: r.date,
    amount: r.amount,
    category: r.category,
    description: r.description,
    notes: r.notes,
    transferred_id: r.transferred_id,
    cleared: r.cleared === 1,
    reconciled: r.reconciled === 1,
    sort_order: r.sort_order,
    starting_balance_flag: r.starting_balance_flag === 1,
    tombstone: r.tombstone === 1,
    payeeName: r.payee_name,
    categoryName: r.category_name,
  }));
}

/** All transactions across every account with pagination. */
export async function getAllTransactions(opts?: {
  limit?: number;
  offset?: number;
  hideReconciled?: boolean;
}): Promise<TransactionDisplay[]> {
  const limit  = opts?.limit  ?? PAGE_SIZE;
  const offset = opts?.offset ?? 0;
  const reconciledClause = opts?.hideReconciled ? 'AND t.reconciled = 0' : '';

  const rows = await runQuery<
    TransactionRow & { payee_name: string | null; category_name: string | null; account_name: string | null }
  >(
    `SELECT t.*,
            COALESCE(tr_acc.name, p.name) AS payee_name,
            c.name                        AS category_name,
            acc.name                      AS account_name
     FROM   transactions t
     JOIN   accounts          acc    ON acc.id = t.acct AND acc.tombstone = 0
     LEFT JOIN payee_mapping    pm   ON pm.id = t.description
     LEFT JOIN payees            p   ON COALESCE(pm.targetId, t.description) = p.id AND p.tombstone = 0
     LEFT JOIN accounts          tr_acc ON p.transfer_acct = tr_acc.id AND tr_acc.tombstone = 0
     LEFT JOIN category_mapping  cm  ON cm.id = t.category
     LEFT JOIN categories        c   ON COALESCE(cm.transferId, t.category) = c.id AND c.tombstone = 0
     WHERE  t.tombstone = 0 ${reconciledClause}
     ORDER  BY t.date DESC, t.sort_order DESC
     LIMIT ${limit} OFFSET ${offset}`,
    [],
  );

  return rows.map(r => ({
    id: r.id,
    isParent: r.isParent === 1,
    isChild: r.isChild === 1,
    acct: r.acct,
    date: r.date,
    amount: r.amount,
    category: r.category,
    description: r.description,
    notes: r.notes,
    transferred_id: r.transferred_id,
    cleared: r.cleared === 1,
    reconciled: r.reconciled === 1,
    sort_order: r.sort_order,
    starting_balance_flag: r.starting_balance_flag === 1,
    tombstone: r.tombstone === 1,
    payeeName: r.payee_name,
    categoryName: r.category_name,
    accountName: r.account_name,
  }));
}
