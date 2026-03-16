/**
 * Split transaction logic — pure functions ported from
 * actual/packages/loot-core/src/shared/transactions.ts
 *
 * These operate on in-memory arrays and return diffs { added, updated, deleted }.
 * The caller is responsible for persisting changes via addTransaction/updateTransaction/deleteTransaction.
 */
import { randomUUID } from "expo-crypto";
import type { Transaction, SplitTransactionError, TransactionWithSubtransactions } from "./types";

// ---------------------------------------------------------------------------
// Utility helpers (ported from loot-core/src/shared/util.ts)
// ---------------------------------------------------------------------------

function num(n: number | null | undefined): number {
  return typeof n === "number" ? n : 0;
}

function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

function getChangedValues<T extends { id?: string }>(obj1: T, obj2: T): Partial<T> | null {
  const diff: Partial<T> = {};
  const keys = Object.keys(obj2) as (keyof T)[];
  let hasChanged = false;

  if (obj1.id) {
    (diff as { id?: string }).id = obj1.id;
  }

  for (const key of keys) {
    if (obj1[key] !== obj2[key]) {
      diff[key] = obj2[key];
      hasChanged = true;
    }
  }

  return hasChanged ? diff : null;
}

export type Diff<T extends { id: string }> = {
  added: T[];
  updated: Partial<T>[];
  deleted: Pick<T, "id">[];
};

export function diffItems<T extends { id: string }>(items: T[], newItems: T[]): Diff<T> {
  const grouped = new Map(items.map((i) => [i.id, i]));
  const newGrouped = new Map(newItems.map((i) => [i.id, i]));

  const deleted: Pick<T, "id">[] = items
    .filter((item) => !newGrouped.has(item.id))
    .map((item) => ({ id: item.id }));

  const added: T[] = [];
  const updated: Partial<T>[] = [];

  for (const newItem of newItems) {
    const item = grouped.get(newItem.id);
    if (!item) {
      added.push(newItem);
    } else {
      const changes = getChangedValues(item, newItem);
      if (changes) {
        updated.push(changes);
      }
    }
  }

  return { added, updated, deleted };
}

export function applyChanges<T extends { id: string }>(changes: Diff<T>, items: T[]): T[] {
  items = [...items];

  if (changes.added) {
    for (const add of changes.added) {
      items.push(add);
    }
  }

  if (changes.updated) {
    for (const { id, ...fields } of changes.updated) {
      const idx = items.findIndex((t) => t.id === id);
      if (idx !== -1) {
        items[idx] = { ...items[idx], ...fields };
      }
    }
  }

  if (changes.deleted) {
    for (const t of changes.deleted) {
      const idx = items.findIndex((t2) => t.id === t2.id);
      if (idx !== -1) {
        items.splice(idx, 1);
      }
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Split transaction error
// ---------------------------------------------------------------------------

function makeSplitTransactionError(total: number, parent: Transaction): SplitTransactionError {
  return {
    type: "SplitTransactionError",
    version: 1,
    difference: num(parent.amount) - total,
  };
}

// ---------------------------------------------------------------------------
// Core split functions
// ---------------------------------------------------------------------------

export function makeChild(parent: Transaction, data: Partial<Transaction> = {}): Transaction {
  const prefix = parent.id === "temp" ? "temp" : "";

  return {
    id: data.id ?? prefix + randomUUID(),
    isParent: false,
    isChild: true,
    parent_id: parent.id,
    acct: parent.acct,
    date: parent.date,
    amount: data.amount ?? 0,
    category: data.category !== undefined ? data.category : parent.category,
    description: data.description !== undefined ? data.description : parent.description,
    notes: data.notes ?? null,
    transferred_id: data.transferred_id ?? null,
    cleared: data.cleared !== undefined ? data.cleared : parent.cleared,
    reconciled: data.reconciled !== undefined ? data.reconciled : parent.reconciled,
    sort_order: data.sort_order ?? null,
    starting_balance_flag: parent.starting_balance_flag,
    schedule: parent.schedule,
    tombstone: false,
  };
}

export function recalculateSplit(
  trans: TransactionWithSubtransactions,
): TransactionWithSubtransactions {
  const total = (trans.subtransactions || []).reduce((acc, t) => acc + num(t.amount), 0);

  return {
    ...trans,
    error: total === num(trans.amount) ? null : makeSplitTransactionError(total, trans),
  };
}

// ---------------------------------------------------------------------------
// Group / ungroup helpers
// ---------------------------------------------------------------------------

export function groupTransaction(split: Transaction[]): TransactionWithSubtransactions {
  return {
    ...split[0],
    subtransactions: split.slice(1),
    error: null,
  };
}

export function ungroupTransaction(split: TransactionWithSubtransactions | null): Transaction[] {
  if (split == null) return [];
  const { subtransactions, error: _error, ...parent } = split;
  return [parent, ...(subtransactions || [])];
}

export function ungroupTransactions(transactions: TransactionWithSubtransactions[]): Transaction[] {
  return transactions.reduce<Transaction[]>((list, parent) => {
    const { subtransactions, error: _error, ...trans } = parent;
    list.push(trans);
    for (const sub of subtransactions || []) {
      list.push(sub);
    }
    return list;
  }, []);
}

// ---------------------------------------------------------------------------
// Internal: replaceTransactions
// ---------------------------------------------------------------------------

export type ReplaceResult = {
  data: Transaction[];
  newTransaction: (TransactionWithSubtransactions & { _deleted?: boolean }) | null;
  diff: Diff<Transaction>;
};

function findParentIndex(transactions: readonly Transaction[], idx: number): number | null {
  while (idx >= 0) {
    if (transactions[idx].isParent) return idx;
    idx--;
  }
  return null;
}

function getSplit(transactions: readonly Transaction[], parentIndex: number): Transaction[] {
  const split = [transactions[parentIndex]];
  let curr = parentIndex + 1;
  while (curr < transactions.length && transactions[curr].isChild) {
    split.push(transactions[curr]);
    curr++;
  }
  return split;
}

function replaceTransactions(
  transactions: readonly Transaction[],
  id: string,
  func: (transaction: TransactionWithSubtransactions) => TransactionWithSubtransactions | null,
): ReplaceResult {
  const idx = transactions.findIndex((t) => t.id === id);
  if (idx === -1) {
    throw new Error("Tried to edit unknown transaction id: " + id);
  }

  const trans = transactions[idx];
  const transactionsCopy = [...transactions];

  if (trans.isParent || trans.isChild) {
    const parentIndex = findParentIndex(transactions, idx);
    if (parentIndex == null) {
      return {
        data: [],
        diff: { added: [], deleted: [], updated: [] },
        newTransaction: null,
      };
    }

    const split = getSplit(transactions, parentIndex);
    const funcResult = func(groupTransaction(split));
    const newSplit = funcResult ? ungroupTransaction(funcResult) : [];

    let diff: Diff<Transaction>;
    let newTransaction: ReplaceResult["newTransaction"];
    if (newSplit.length === 0) {
      diff = { added: [], deleted: [{ id: split[0].id }], updated: [] };
      newTransaction = { ...groupTransaction(split), _deleted: true };
      transactionsCopy.splice(parentIndex, split.length);
    } else {
      diff = diffItems(split, newSplit);
      newTransaction = funcResult;
      transactionsCopy.splice(parentIndex, split.length, ...newSplit);
    }

    return { data: transactionsCopy, newTransaction, diff };
  } else {
    const asGrouped: TransactionWithSubtransactions = {
      ...trans,
      subtransactions: [],
      error: null,
    };
    const grouped = func(asGrouped);
    const newTrans = grouped ? ungroupTransaction(grouped) : [];
    if (grouped) {
      grouped.subtransactions = grouped.subtransactions || [];
    }
    transactionsCopy.splice(idx, 1, ...newTrans);

    return {
      data: transactionsCopy,
      newTransaction: grouped ? grouped : { ...asGrouped, _deleted: true },
      diff: diffItems([trans], newTrans),
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function splitTransaction(
  transactions: readonly Transaction[],
  id: string,
  createSubtransactions?: (parent: Transaction) => Transaction[],
): ReplaceResult {
  return replaceTransactions(transactions, id, (trans) => {
    if (trans.isParent || trans.isChild) return trans;

    const subtransactions = createSubtransactions?.(trans) || [makeChild(trans)];

    return recalculateSplit({
      ...trans,
      isParent: true,
      category: null,
      subtransactions: subtransactions.map((t) => ({
        ...t,
        sort_order: t.sort_order ?? -1,
      })),
      error: null,
    });
  });
}

export function addSplitTransaction(
  transactions: readonly Transaction[],
  id: string,
): ReplaceResult {
  return replaceTransactions(transactions, id, (trans) => {
    if (!trans.isParent) return trans;

    const prevSub = last(trans.subtransactions || []);
    const newChild = makeChild(trans, {
      amount: 0,
      sort_order: num(prevSub?.sort_order) - 1,
    });

    return {
      ...trans,
      subtransactions: [...(trans.subtransactions || []), newChild],
    };
  });
}

export function updateTransaction(
  transactions: readonly Transaction[],
  transaction: Transaction,
): ReplaceResult {
  return replaceTransactions(transactions, transaction.id, (trans) => {
    if (trans.isParent) {
      const parent = trans.id === transaction.id ? transaction : trans;
      const originalSubtransactions =
        (parent as TransactionWithSubtransactions).subtransactions ?? trans.subtransactions;

      const sub = originalSubtransactions?.map((t) => {
        let child = t;
        if (trans.id === transaction.id) {
          // Parent was updated — propagate payee change to children
          const newDescription =
            t.description === trans.description ? transaction.description : t.description;
          child = { ...t, description: newDescription };
        } else if (t.id === transaction.id) {
          child = transaction;
        }
        return makeChild({ ...parent, isParent: true, isChild: false } as Transaction, child);
      });

      return recalculateSplit({
        ...parent,
        isParent: true,
        isChild: false,
        subtransactions: sub || [],
        error: null,
      });
    } else {
      return { ...trans, ...transaction, subtransactions: [], error: null };
    }
  });
}

export function deleteTransaction(transactions: Transaction[], id: string): ReplaceResult {
  return replaceTransactions(transactions, id, (trans) => {
    if (trans.isParent) {
      if (trans.id === id) {
        // Delete the entire split
        return null;
      } else if ((trans.subtransactions?.length ?? 0) === 1) {
        // Only one child left — convert back to normal transaction
        return {
          ...trans,
          isParent: false,
          subtransactions: [],
          error: null,
        };
      } else {
        // Remove the child and recalculate
        const sub = trans.subtransactions?.filter((t) => t.id !== id) || [];
        return recalculateSplit({ ...trans, subtransactions: sub });
      }
    } else {
      return null;
    }
  });
}

export function realizeTempTransactions(transactions: Transaction[]): Transaction[] {
  const parent = transactions.find((t) => !t.isChild);
  if (!parent) return transactions;

  const newParent: Transaction = {
    ...parent,
    id: randomUUID(),
    sort_order: Date.now(),
  };

  const children = transactions.filter((t) => t.isChild);
  return [
    newParent,
    ...children.map((child) => ({
      ...child,
      id: randomUUID(),
      parent_id: newParent.id,
    })),
  ];
}

export function isTemporaryId(id: string): boolean {
  return id.indexOf("temp") !== -1;
}
