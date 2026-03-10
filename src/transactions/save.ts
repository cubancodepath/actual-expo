/**
 * High-level transaction save — handles all 4 paths:
 *   split-edit, split-new, simple-edit, simple-new.
 *
 * Encapsulates payee resolution, amount sign convention,
 * split child management, and CRDT batching.
 */

import { findOrCreatePayee } from '../payees';
import { batchMessages } from '../sync';
import {
  addTransaction,
  updateTransaction,
  getChildTransactions,
  deleteTransaction,
} from './index';
import { createSchedule, setNextDate } from '../schedules';
import { addDays } from 'date-fns';
import { parseDate } from '../schedules/recurrence';
import type { RecurConfig, RuleCondition } from '../schedules/types';

export type SplitLine = {
  id?: string;
  categoryId: string | null;
  categoryName: string;
  amount: number; // positive cents
};

export type SaveTransactionInput = {
  /** If provided, this is an edit. Otherwise, a new transaction. */
  transactionId?: string;
  acct: string;
  date: number;
  /** Always positive cents. Sign is determined by `type`. */
  amount: number;
  type: 'expense' | 'income';
  payeeId: string | null;
  payeeName: string;
  categoryId: string | null;
  notes: string | null;
  cleared: boolean;
  /** Non-null with length > 1 = split transaction */
  splitCategories: SplitLine[] | null;
  /** If set, creates a recurring schedule linked to this transaction */
  recurConfig?: RecurConfig | null;
};

/**
 * Saves a transaction (new or edit, simple or split).
 * Returns the saved transaction ID.
 */
export async function saveTransaction(input: SaveTransactionInput): Promise<string> {
  const {
    transactionId,
    acct,
    date,
    amount,
    type,
    payeeId,
    payeeName,
    categoryId,
    notes,
    cleared,
    splitCategories,
    recurConfig,
  } = input;

  const isEdit = !!transactionId;
  const isSplit = splitCategories !== null && splitCategories.length > 1;
  const finalAmount = type === 'expense' ? -amount : amount;
  const sign = type === 'expense' ? -1 : 1;

  const resolvedPayeeId = payeeId ?? (await findOrCreatePayee(payeeName));

  if (isSplit && isEdit) {
    // Edit split: update parent, delete old children, create new children
    await batchMessages(async () => {
      await updateTransaction(transactionId, {
        acct,
        date,
        amount: finalAmount,
        description: resolvedPayeeId,
        category: null,
        notes,
        cleared,
        isParent: true,
      });

      const oldChildren = await getChildTransactions(transactionId);
      for (const child of oldChildren) {
        await deleteTransaction(child.id);
      }

      for (const line of splitCategories!) {
        await addTransaction({
          acct,
          date,
          amount: sign * line.amount,
          description: resolvedPayeeId,
          category: line.categoryId,
          notes: null,
          cleared,
          isChild: true,
          parent_id: transactionId,
        });
      }
    });
    return transactionId;
  }

  if (isSplit) {
    // New split: create parent + children in a single batch
    let parentId = '';
    await batchMessages(async () => {
      parentId = await addTransaction({
        acct,
        date,
        amount: finalAmount,
        description: resolvedPayeeId,
        category: null,
        notes,
        cleared,
        isParent: true,
      });

      for (const line of splitCategories!) {
        await addTransaction({
          acct,
          date,
          amount: sign * line.amount,
          description: resolvedPayeeId,
          category: line.categoryId,
          notes: null,
          cleared,
          isChild: true,
          parent_id: parentId,
        });
      }
    });
    return parentId;
  }

  if (isEdit) {
    // Simple edit
    await updateTransaction(transactionId, {
      acct,
      date,
      amount: finalAmount,
      description: resolvedPayeeId,
      category: categoryId,
      notes,
      cleared,
    });
    return transactionId;
  }

  // Simple new
  const newId = await addTransaction({
    acct,
    date,
    amount: finalAmount,
    description: resolvedPayeeId,
    category: categoryId,
    notes,
    cleared,
  });

  // Create a linked schedule if recurrence was configured
  if (recurConfig) {
    await linkSchedule(newId, recurConfig, resolvedPayeeId, acct, finalAmount);
  }

  return newId;
}

/**
 * Creates a schedule linked to a transaction.
 */
async function linkSchedule(
  txnId: string,
  recurConfig: RecurConfig,
  payeeId: string | null,
  acct: string,
  amount: number,
): Promise<void> {
  const conditions: RuleCondition[] = [
    { field: 'payee', op: 'is', value: payeeId },
    { field: 'account', op: 'is', value: acct },
    { field: 'amount', op: 'isapprox', value: amount },
    { field: 'date', op: 'isapprox', value: recurConfig },
  ];

  const scheduleId = await createSchedule({
    schedule: { posts_transaction: true },
    conditions,
  });

  await updateTransaction(txnId, { schedule: scheduleId });

  // The transaction we just created "pays" the current occurrence,
  // so advance the schedule to the next date immediately.
  await setNextDate({
    id: scheduleId,
    conditions,
    start: (nextDate) => addDays(parseDate(nextDate), 1),
  });
}
