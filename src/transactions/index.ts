import { randomUUID } from 'expo-crypto';
import { runQuery } from '../db';
import { sendMessages } from '../sync';
import { Timestamp } from '../crdt';
import type { TransactionRow } from '../db/types';
import type { Transaction, GetTransactionsOptions } from './types';

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

  return id;
}

export async function updateTransaction(
  id: string,
  fields: Omit<Partial<Transaction>, 'id' | 'tombstone'>,
): Promise<void> {
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
}

export async function deleteTransaction(id: string): Promise<void> {
  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: 'transactions', row: id, column: 'tombstone', value: 1 },
  ]);
}

// ---------------------------------------------------------------------------
// Display query — joins payee and category names
// ---------------------------------------------------------------------------

export type TransactionDisplay = Transaction & {
  payeeName: string | null;
  categoryName: string | null;
};

export async function getTransactionsForAccount(accountId: string): Promise<TransactionDisplay[]> {
  const rows = await runQuery<TransactionRow & { payee_name: string | null; category_name: string | null }>(
    `SELECT t.*,
            p.name  AS payee_name,
            c.name  AS category_name
     FROM   transactions t
     LEFT JOIN payees     p ON t.description = p.id AND p.tombstone = 0
     LEFT JOIN categories c ON t.category    = c.id AND c.tombstone = 0
     WHERE  t.acct = ? AND t.tombstone = 0
     ORDER  BY t.date DESC, t.sort_order DESC`,
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
