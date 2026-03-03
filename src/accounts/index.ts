import { randomUUID } from 'expo-crypto';
import { runQuery, run, first } from '../db';
import { sendMessages, batchMessages } from '../sync';
import { Timestamp } from '../crdt';
import { todayInt } from '../lib/date';
import type { AccountRow } from '../db/types';
import type { Account } from './types';

type AccountWithBalance = AccountRow & {
  balance: number | null;
  clearedBalance: number | null;
  unclearedBalance: number | null;
};

function rowToAccount(r: AccountWithBalance): Account {
  return {
    id: r.id,
    name: r.name,
    offbudget: r.offbudget === 1,
    closed: r.closed === 1,
    sort_order: r.sort_order,
    tombstone: r.tombstone === 1,
    balance: r.balance ?? 0,
    clearedBalance: r.clearedBalance ?? 0,
    unclearedBalance: r.unclearedBalance ?? 0,
  };
}

export async function getAccounts(): Promise<Account[]> {
  const rows = await runQuery<AccountWithBalance>(
    `SELECT a.*,
       COALESCE(SUM(CASE WHEN t.tombstone = 0 AND t.isParent = 0 THEN t.amount ELSE 0 END), 0) AS balance,
       COALESCE(SUM(CASE WHEN t.tombstone = 0 AND t.isParent = 0 AND t.cleared = 1 THEN t.amount ELSE 0 END), 0) AS clearedBalance,
       COALESCE(SUM(CASE WHEN t.tombstone = 0 AND t.isParent = 0 AND t.cleared = 0 THEN t.amount ELSE 0 END), 0) AS unclearedBalance
     FROM accounts a
     LEFT JOIN transactions t ON t.acct = a.id
     WHERE a.tombstone = 0
     GROUP BY a.id
     ORDER BY a.sort_order ASC, a.name ASC`,
  );
  return rows.map(rowToAccount);
}

/**
 * Finds or creates the "Starting Balance" payee and returns its id
 * along with the best income category to assign.
 * Mirrors loot-core's getStartingBalancePayee().
 */
async function getStartingBalancePayee(): Promise<{ id: string; categoryId: string | null }> {
  // Reuse existing "Starting Balance" payee if present
  const existing = await first<{ id: string }>(
    `SELECT id FROM payees WHERE name = 'Starting Balance' AND tombstone = 0 LIMIT 1`,
  );

  let payeeId: string;
  if (existing) {
    payeeId = existing.id;
  } else {
    payeeId = randomUUID();
    await sendMessages([
      { timestamp: Timestamp.send()!, dataset: 'payees', row: payeeId, column: 'name', value: 'Starting Balance' },
      { timestamp: Timestamp.send()!, dataset: 'payees', row: payeeId, column: 'transfer_acct', value: null },
      { timestamp: Timestamp.send()!, dataset: 'payees', row: payeeId, column: 'favorite', value: 0 },
    ]);
  }

  // Prefer category named "Starting Balances" (income), fall back to any income category.
  // Check both categories.is_income AND category group membership (is_income on the group)
  // to handle cases where the field isn't set directly on the category.
  const cat = await first<{ id: string }>(
    `SELECT c.id FROM categories c
     LEFT JOIN category_groups g ON c.cat_group = g.id
     WHERE (c.is_income = 1 OR g.is_income = 1) AND c.tombstone = 0
     ORDER BY CASE WHEN LOWER(c.name) = 'starting balances' THEN 0 ELSE 1 END
     LIMIT 1`,
  );

  return { id: payeeId, categoryId: cat?.id ?? null };
}

export async function createAccount(
  fields: Omit<Partial<Account>, 'id' | 'tombstone'>,
  startingBalance = 0,
): Promise<string> {
  const id = randomUUID();

  await batchMessages(async () => {
    // 1. Create the account
    const dbFields: Record<string, unknown> = {
      name: fields.name ?? 'New Account',
      offbudget: fields.offbudget ? 1 : 0,
      closed: fields.closed ? 1 : 0,
      sort_order: fields.sort_order ?? Date.now(),
    };
    await sendMessages(
      Object.entries(dbFields).map(([column, value]) => ({
        timestamp: Timestamp.send()!,
        dataset: 'accounts',
        row: id,
        column,
        value: value as string | number | null,
      })),
    );

    // 2. Create the transfer payee for this account (used in transfers between accounts)
    const transferPayeeId = randomUUID();
    await sendMessages([
      { timestamp: Timestamp.send()!, dataset: 'payees', row: transferPayeeId, column: 'name', value: '' },
      { timestamp: Timestamp.send()!, dataset: 'payees', row: transferPayeeId, column: 'transfer_acct', value: id },
      { timestamp: Timestamp.send()!, dataset: 'payees', row: transferPayeeId, column: 'favorite', value: 0 },
    ]);

    // 3. Create starting balance transaction if balance is non-zero
    if (startingBalance !== 0) {
      const { id: payeeId, categoryId } = await getStartingBalancePayee();
      const txId = randomUUID();
      await sendMessages([
        { timestamp: Timestamp.send()!, dataset: 'transactions', row: txId, column: 'acct', value: id },
        { timestamp: Timestamp.send()!, dataset: 'transactions', row: txId, column: 'amount', value: startingBalance },
        { timestamp: Timestamp.send()!, dataset: 'transactions', row: txId, column: 'date', value: todayInt() },
        { timestamp: Timestamp.send()!, dataset: 'transactions', row: txId, column: 'description', value: payeeId },
        {
          timestamp: Timestamp.send()!, dataset: 'transactions', row: txId, column: 'category',
          value: fields.offbudget ? null : categoryId,
        },
        { timestamp: Timestamp.send()!, dataset: 'transactions', row: txId, column: 'cleared', value: 1 },
        { timestamp: Timestamp.send()!, dataset: 'transactions', row: txId, column: 'starting_balance_flag', value: 1 },
      ]);
    }
  });

  return id;
}

export async function updateAccount(
  id: string,
  fields: Omit<Partial<Account>, 'id' | 'tombstone'>,
): Promise<void> {
  const dbFields: Record<string, unknown> = {};
  if (fields.name !== undefined) dbFields.name = fields.name;
  if (fields.offbudget !== undefined) dbFields.offbudget = fields.offbudget ? 1 : 0;
  if (fields.closed !== undefined) dbFields.closed = fields.closed ? 1 : 0;
  if (fields.sort_order !== undefined) dbFields.sort_order = fields.sort_order;

  if (Object.keys(dbFields).length === 0) return;

  await sendMessages(
    Object.entries(dbFields).map(([column, value]) => ({
      timestamp: Timestamp.send()!,
      dataset: 'accounts',
      row: id,
      column,
      value: value as string | number | null,
    })),
  );
}

export async function closeAccount(id: string): Promise<void> {
  await updateAccount(id, { closed: true });
}

export async function deleteAccount(id: string): Promise<void> {
  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: 'accounts', row: id, column: 'tombstone', value: 1 },
  ]);
}
