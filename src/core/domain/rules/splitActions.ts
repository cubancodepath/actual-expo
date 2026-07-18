/**
 * Split-aware rule action execution.
 *
 * Ported from Actual's rules/rule.ts (execActions/execSplitActions). Kept
 * SEPARATE from the default `execActions` (rule.ts) so the transaction posting,
 * import and manual-form paths keep their existing non-split behaviour; only
 * callers that explicitly want splits (schedule previews) use this.
 *
 * Operates on loose transaction records, reusing the transactions domain's
 * split helpers.
 */

import type { Action } from "./action";
import {
  splitTransaction,
  addSplitTransaction,
  groupTransaction,
  recalculateSplit,
  ungroupTransaction,
} from "@/core/domain/transactions/split";
import type { Transaction, TransactionWithSubtransactions } from "@/core/domain/transactions/types";

type LooseTxn = Record<string, unknown>;

const asTxns = (list: LooseTxn[]): Transaction[] => list as unknown as Transaction[];
const method = (a: Action): unknown => (a.options as Record<string, unknown> | undefined)?.method;
const splitIndex = (a: Action): number =>
  ((a.options as Record<string, unknown> | undefined)?.splitIndex as number) ?? 0;

/** Parent amount minus the sum of child amounts (0 when balanced). */
function getSplitRemainder(transactions: LooseTxn[]): number {
  const { error } = recalculateSplit(groupTransaction(asTxns(transactions)));
  return error ? error.difference : 0;
}

function execNonSplitActions(actions: Action[], transaction: LooseTxn): LooseTxn {
  for (const action of actions) action.exec(transaction);
  return transaction;
}

function execSplitActions(actions: Action[], transaction: LooseTxn): LooseTxn {
  const splitAmountActions = actions.filter((a) => a.op === "set-split-amount");

  // Convert to a split transaction (parent + one reserved child).
  const { data } = splitTransaction(
    ungroupTransaction(transaction as unknown as TransactionWithSubtransactions),
    transaction.id as string,
  );
  let newTransactions = data as unknown as LooseTxn[];

  // Add empty splits and apply per-split actions (fixed amounts + categories).
  for (const action of actions) {
    const idx = splitIndex(action) + 1;
    if (idx >= newTransactions.length) {
      const res = addSplitTransaction(asTxns(newTransactions), transaction.id as string);
      newTransactions = res.data as unknown as LooseTxn[];
    }
    newTransactions[idx].parent_amount = transaction.amount;
    action.exec(newTransactions[idx]);
  }

  // Distribute to fixed-percent splits.
  const remainingAfterFixedAmounts = getSplitRemainder(newTransactions);
  for (const action of splitAmountActions.filter((a) => method(a) === "fixed-percent")) {
    const idx = splitIndex(action) + 1;
    const percent = (action.value as number) / 100;
    newTransactions[idx].amount = Math.round(remainingAfterFixedAmounts * percent);
  }

  // Distribute to remainder splits (last one absorbs rounding leftovers).
  const remainderActions = splitAmountActions.filter((a) => method(a) === "remainder");
  const remainingAfterFixedPercents = getSplitRemainder(newTransactions);
  if (remainderActions.length !== 0) {
    const per = Math.round(remainingAfterFixedPercents / remainderActions.length);
    let lastIdx = -1;
    for (const action of remainderActions) {
      const idx = splitIndex(action) + 1;
      newTransactions[idx].amount = per;
      lastIdx = Math.max(lastIdx, idx);
    }
    newTransactions[lastIdx].amount =
      (newTransactions[lastIdx].amount as number) + getSplitRemainder(newTransactions);
  }

  // Split index 0 (transaction index 1) is the reserved "apply to all" slot.
  newTransactions.splice(1, 1);
  return recalculateSplit(groupTransaction(asTxns(newTransactions))) as unknown as LooseTxn;
}

/**
 * Apply a rule's actions to a transaction, producing `subtransactions` when the
 * rule carries `set-split-amount` actions. Faithful port of Actual's execActions.
 */
export function execActionsWithSplits(actions: Action[], transaction: LooseTxn): LooseTxn {
  const parentActions = actions.filter((a) => !splitIndex(a));
  const childActions = actions.filter((a) => splitIndex(a));
  const totalSplitCount = actions.reduce((prev, cur) => Math.max(prev, splitIndex(cur)), 0) + 1;

  const nonSplitResult = execNonSplitActions(parentActions, transaction);
  if (totalSplitCount === 1) return nonSplitResult; // no splits
  if (nonSplitResult.is_child) return nonSplitResult; // can't split a child

  return execSplitActions(childActions, nonSplitResult);
}
