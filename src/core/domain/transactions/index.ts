import { randomUUID } from "@/core/platform/crypto";
import { runQuery, first } from "@/core/db";
import { sendMessages, batchMessages } from "@/core/sync";
import { undoable } from "@/core/sync/undo";
import { Timestamp } from "@/core/crdt";
import type { TransactionRow } from "@/core/db/types";
import type { Transaction, GetTransactionsOptions, TransactionDisplay } from "@/core/types/models";
import { onInsert, onUpdate, onDelete as onDeleteTransfer } from "./transfer";
import { todayInt, startOfMonthInt, endOfMonthInt } from "@/lib/date";
import { q, executeQuery } from "@/core/queries";
import { getRules } from "../rules";
import { applyRulesToNewTransaction } from "../rules/apply";

export type { TransactionDisplay } from "@/core/types/models";

function rowToTransaction(r: TransactionRow): Transaction {
  return {
    id: r.id,
    is_parent: r.isParent === 1,
    is_child: r.isChild === 1,
    account: r.acct,
    date: r.date,
    amount: r.amount,
    category: r.category,
    payee: r.description,
    notes: r.notes,
    parent_id: r.parent_id ?? null,
    transfer_id: r.transferred_id,
    cleared: r.cleared === 1,
    reconciled: r.reconciled === 1,
    sort_order: r.sort_order,
    starting_balance_flag: r.starting_balance_flag === 1,
    schedule: r.schedule ?? null,
    tombstone: r.tombstone === 1,
  };
}

export async function getTransactions(opts: GetTransactionsOptions = {}): Promise<Transaction[]> {
  const conditions: string[] = ["tombstone = 0"];
  const params: (string | number)[] = [];

  if (opts.accountId) {
    conditions.push("acct = ?");
    params.push(opts.accountId);
  }
  if (opts.startDate !== undefined) {
    conditions.push("date >= ?");
    params.push(opts.startDate);
  }
  if (opts.endDate !== undefined) {
    conditions.push("date <= ?");
    params.push(opts.endDate);
  }

  const where = conditions.join(" AND ");
  const limit = opts.limit ? "LIMIT ?" : "";
  const offset = opts.offset ? "OFFSET ?" : "";
  if (opts.limit) {
    if (!Number.isFinite(opts.limit)) throw new Error(`Invalid LIMIT value: ${opts.limit}`);
    params.push(Math.trunc(opts.limit));
  }
  if (opts.offset) {
    if (!Number.isFinite(opts.offset)) throw new Error(`Invalid OFFSET value: ${opts.offset}`);
    params.push(Math.trunc(opts.offset));
  }

  const rows = await runQuery<TransactionRow>(
    `SELECT * FROM transactions WHERE ${where} ORDER BY date DESC, sort_order DESC ${limit} ${offset}`,
    params,
  );
  return rows.map(rowToTransaction);
}

export const addTransaction = undoable(async function addTransaction(
  fields: Omit<Partial<Transaction>, "id" | "tombstone"> & {
    account: string;
    date: number;
    amount: number;
  },
): Promise<string> {
  const id = randomUUID();

  // Map public field names → DB column names for CRDT messages
  const dbFields: Record<string, unknown> = {
    acct: fields.account,
    date: fields.date,
    amount: fields.amount,
    isParent: fields.is_parent ? 1 : 0,
    isChild: fields.is_child ? 1 : 0,
    category: fields.category ?? null,
    description: fields.payee ?? null,
    notes: fields.notes ?? null,
    parent_id: fields.parent_id ?? null,
    transferred_id: fields.transfer_id ?? null,
    cleared: fields.cleared ? 1 : 0,
    reconciled: fields.reconciled ? 1 : 0,
    sort_order: fields.sort_order ?? Date.now(),
    starting_balance_flag: fields.starting_balance_flag ? 1 : 0,
    schedule: fields.schedule ?? null,
  };

  await sendMessages(
    Object.entries(dbFields).map(([column, value]) => ({
      timestamp: Timestamp.send()!,
      dataset: "transactions",
      row: id,
      column,
      value: value as string | number | null,
    })),
  );

  // Transfer hook: if payee is a transfer payee, create the paired transaction.
  // Splits and transfers are mutually exclusive — a split parent/child sharing
  // the transfer payee with its siblings must NOT each spawn their own mirror.
  if (!fields.is_parent && !fields.is_child) {
    await onInsert({
      id,
      acct: fields.account,
      amount: fields.amount,
      date: fields.date,
      description: fields.payee ?? null,
      notes: fields.notes ?? null,
    });
  }

  return id;
});

/** Duplicate a transaction — copies all fields except cleared/reconciled (reset to false). */
export const duplicateTransaction = undoable(async function duplicateTransaction(
  id: string,
): Promise<string | null> {
  const original = await getTransactionById(id);
  if (!original) return null;

  return addTransaction({
    account: original.account,
    date: original.date,
    amount: original.amount,
    category: original.category,
    payee: original.payee,
    notes: original.notes,
    cleared: false,
    reconciled: false,
  });
});

export const updateTransaction = undoable(async function updateTransaction(
  id: string,
  fields: Omit<Partial<Transaction>, "id" | "tombstone">,
): Promise<void> {
  // Fetch current state before updating (needed for transfer hook)
  const prev = await first<TransactionRow>(
    "SELECT * FROM transactions WHERE id = ? AND tombstone = 0",
    [id],
  );

  // Map public field names → DB column names for CRDT messages
  const dbFields: Record<string, unknown> = {};

  // Boolean fields: public name → DB column name
  const boolMap: Array<[keyof Transaction, string]> = [
    ["is_parent", "isParent"],
    ["is_child", "isChild"],
    ["cleared", "cleared"],
    ["reconciled", "reconciled"],
    ["starting_balance_flag", "starting_balance_flag"],
  ];
  // Direct fields: public name → DB column name
  const directMap: Array<[keyof Transaction, string]> = [
    ["account", "acct"],
    ["date", "date"],
    ["amount", "amount"],
    ["category", "category"],
    ["payee", "description"],
    ["notes", "notes"],
    ["parent_id", "parent_id"],
    ["transfer_id", "transferred_id"],
    ["sort_order", "sort_order"],
    ["schedule", "schedule"],
  ];

  const f = fields as Record<string, unknown>;
  for (const [pub, db] of boolMap) {
    if (f[pub] !== undefined) dbFields[db] = f[pub] ? 1 : 0;
  }
  for (const [pub, db] of directMap) {
    if (f[pub] !== undefined) dbFields[db] = f[pub] ?? null;
  }

  if (Object.keys(dbFields).length === 0) return;

  await sendMessages(
    Object.entries(dbFields).map(([column, value]) => ({
      timestamp: Timestamp.send()!,
      dataset: "transactions",
      row: id,
      column,
      value: value as string | number | null,
    })),
  );

  // Transfer hook: sync changes to the paired transaction if needed.
  // Transfer module works with DB column names internally.
  // Splits and transfers are mutually exclusive — guard with BOTH the DB's
  // current isParent/isChild flags AND the incoming fields (e.g. editing a
  // child's payee to a transfer payee must not re-open the mirror-per-row bug).
  const isSplitRow =
    prev?.isParent === 1 || prev?.isChild === 1 || fields.is_parent || fields.is_child;
  if (prev && !isSplitRow) {
    await onUpdate(
      {
        id,
        acct: prev.acct,
        amount: prev.amount,
        date: prev.date,
        description: prev.description,
        notes: prev.notes,
        transferred_id: prev.transferred_id,
      },
      {
        acct: fields.account,
        amount: fields.amount,
        date: fields.date,
        description: fields.payee,
        notes: fields.notes,
      },
    );
  }
});

/**
 * Move a transaction to another account. Split children carry their own `acct`
 * column, so moving a parent must cascade to every child — a bare
 * `updateTransaction(id, { account })` would desync them. Transfers stay in
 * sync through updateTransaction's transfer hook.
 */
export const moveTransaction = undoable(async function moveTransaction(
  id: string,
  accountId: string,
): Promise<void> {
  const row = await first<TransactionRow>(
    "SELECT isParent FROM transactions WHERE id = ? AND tombstone = 0",
    [id],
  );
  await batchMessages(async () => {
    await updateTransaction(id, { account: accountId });
    if (row?.isParent === 1) {
      const children = await getChildTransactions(id);
      for (const child of children) {
        await updateTransaction(child.id, { account: accountId });
      }
    }
  });
});

/** Toggle the cleared flag on a transaction (skips reconciled transactions). */
export const toggleCleared = undoable(async function toggleCleared(id: string): Promise<void> {
  const row = await first<{ cleared: number; reconciled: number }>(
    "SELECT cleared, reconciled FROM transactions WHERE id = ? AND tombstone = 0",
    [id],
  );
  if (!row || row.reconciled === 1) return;
  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: "transactions",
      row: id,
      column: "cleared",
      value: row.cleared === 1 ? 0 : 1,
    },
  ]);
});

/**
 * Set the cleared flag on multiple transactions at once.
 * Skips reconciled transactions and those already in the target state.
 * Uses batchMessages for sync efficiency.
 */
export const setClearedBulk = undoable(async function setClearedBulk(
  ids: string[],
  cleared: boolean,
): Promise<number> {
  if (ids.length === 0) return 0;

  const placeholders = ids.map(() => "?").join(",");
  const rows = await runQuery<{ id: string; cleared: number; reconciled: number }>(
    `SELECT id, cleared, reconciled FROM transactions WHERE id IN (${placeholders}) AND tombstone = 0`,
    ids,
  );

  const targetVal = cleared ? 1 : 0;
  const toUpdate = rows.filter((r) => r.reconciled !== 1 && r.cleared !== targetVal);
  if (toUpdate.length === 0) return 0;

  await batchMessages(async () => {
    for (const row of toUpdate) {
      await sendMessages([
        {
          timestamp: Timestamp.send()!,
          dataset: "transactions",
          row: row.id,
          column: "cleared",
          value: targetVal,
        },
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
  await sendMessages([
    ...rows.map((r) => ({
      timestamp: Timestamp.send()!,
      dataset: "transactions",
      row: r.id,
      column: "reconciled",
      value: 1 as string | number | null,
    })),
    {
      timestamp: Timestamp.send()!,
      dataset: "accounts",
      row: accountId,
      column: "last_reconciled",
      value: new Date().getTime().toString(),
    },
  ]);
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
      // Run the rule engine over the system-generated adjustment before insert
      // (upstream parity: the reconciliation transaction goes through rules,
      // e.g. to auto-categorize it). Same bulk/override path as schedule-post.
      const rules = await getRules();
      const f = await applyRulesToNewTransaction(rules, {
        account: accountId,
        date: todayInt(),
        amount: diff,
        cleared: true,
        notes: "Reconciliation balance adjustment",
      });
      await addTransaction({
        account: f.account,
        date: f.date,
        amount: f.amount,
        category: f.category ?? undefined,
        payee: f.payee ?? undefined,
        notes: f.notes,
        cleared: true,
      });
    }

    await lockTransactions(accountId);
  });

  return { adjusted: diff !== 0, diff };
});

export const deleteTransaction = undoable(async function deleteTransaction(
  id: string,
): Promise<void> {
  // Fetch row info before tombstoning
  const row = await first<{ transferred_id: string | null; isParent: 0 | 1 }>(
    "SELECT transferred_id, isParent FROM transactions WHERE id = ? AND tombstone = 0",
    [id],
  );

  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: "transactions",
      row: id,
      column: "tombstone",
      value: 1,
    },
  ]);

  // If this is a parent split, also tombstone all children
  if (row?.isParent === 1) {
    const children = await runQuery<{ id: string; transferred_id: string | null }>(
      "SELECT id, transferred_id FROM transactions WHERE parent_id = ? AND tombstone = 0",
      [id],
    );
    for (const child of children) {
      await sendMessages([
        {
          timestamp: Timestamp.send()!,
          dataset: "transactions",
          row: child.id,
          column: "tombstone",
          value: 1,
        },
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
  // splits: "all" keeps parent-split rows (the default alive filter drops isParent=1),
  // so this can load a parent for editing as well as normal/child rows.
  const { data } = await executeQuery<TransactionDisplay>(
    q("transactions").options({ splits: "all" }).filter({ id }).select(["*", "accountName"]),
  );
  return data[0] ?? null;
}

// ---------------------------------------------------------------------------
// Spending summary — aggregates for the current month
// ---------------------------------------------------------------------------

export interface SpendingSummary {
  totalSpent: number; // cents, negative or zero
  totalIncome: number; // cents, positive or zero
  transactionCount: number;
  topCategories: Array<{ categoryName: string; total: number; count: number }>;
}

export async function getSpendingSummary(start?: number, end?: number): Promise<SpendingSummary> {
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
     LEFT JOIN payee_mapping pm ON pm.id = t.description
     LEFT JOIN payees p ON p.id = COALESCE(pm.targetId, t.description) AND p.tombstone = 0
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
  const conditions = ["t.tombstone = 0", "t.isChild = 0", "t.cleared = 0", "t.reconciled = 0"];
  const params: string[] = [];
  if (accountId) {
    conditions.push("t.acct = ?");
    params.push(accountId);
  }
  const row = await first<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM transactions t
     JOIN accounts a ON a.id = t.acct AND a.tombstone = 0
     WHERE ${conditions.join(" AND ")}`,
    params,
  );
  return row?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Split transaction queries
// ---------------------------------------------------------------------------

/** Fetch all child transactions for a parent split transaction. */
export async function getChildTransactions(parentId: string): Promise<TransactionDisplay[]> {
  const { data } = await executeQuery<TransactionDisplay>(
    q("transactions").filter({ parent_id: parentId }).orderBy({ sort_order: "asc" }).select(["*"]),
  );
  return data;
}
