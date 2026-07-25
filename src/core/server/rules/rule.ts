/**
 * Rule class + split-aware action execution.
 * Ported from loot-core/src/server/rules/rule.ts.
 *
 * `execActions` dispatches parent (non-split) actions and, when a rule carries
 * `set-split-amount` actions, produces `subtransactions` via `execSplitActions`
 * (fixed-amount / fixed-percent / remainder distribution). Faithful to upstream.
 */

import {
  splitTransaction,
  addSplitTransaction,
  groupTransaction,
  recalculateSplit,
  ungroupTransaction,
} from "@/core/shared/transactions";
import type { Transaction, TransactionWithSubtransactions } from "@/core/types/models";
import { Action } from "./action";
import { Condition } from "./condition";

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
    // Propagate enrichment so child formulas can reference the parent's balance
    // and BALANCE_OF prefetch.
    newTransactions[idx].balance = transaction.balance;
    newTransactions[idx]._balanceOfPrefetched = transaction._balanceOfPrefetched;
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
export function execActions(
  actions: Action[],
  transaction: Record<string, unknown>,
): Record<string, unknown> {
  const parentActions = actions.filter((a) => !splitIndex(a));
  const childActions = actions.filter((a) => splitIndex(a));
  const totalSplitCount = actions.reduce((prev, cur) => Math.max(prev, splitIndex(cur)), 0) + 1;

  const nonSplitResult = execNonSplitActions(parentActions, transaction);
  if (totalSplitCount === 1) return nonSplitResult; // no splits
  if (nonSplitResult.is_child) return nonSplitResult; // can't split a child

  return execSplitActions(childActions, nonSplitResult);
}

export class Rule {
  actions: Action[];
  conditions: Condition[];
  conditionsOp: "and" | "or";
  id?: string;
  stage: "pre" | null | "post";

  constructor({
    id,
    stage,
    conditionsOp,
    conditions,
    actions,
  }: {
    id?: string;
    stage?: "pre" | null | "post";
    conditionsOp: "and" | "or";
    conditions: Array<{
      op: string;
      field: string;
      value: unknown;
      options?: Record<string, unknown>;
    }>;
    actions: Array<{
      op: string;
      field?: string;
      value: unknown;
      options?: Record<string, unknown>;
    }>;
  }) {
    this.id = id;
    this.stage = stage ?? null;
    this.conditionsOp = conditionsOp;
    this.conditions = conditions.map((c) => new Condition(c.op, c.field, c.value, c.options));
    this.actions = actions.map((a) => new Action(a.op, a.field ?? null, a.value, a.options));
  }

  evalConditions(object: Record<string, unknown>): boolean {
    if (this.conditions.length === 0) return false;
    const method = this.conditionsOp === "or" ? "some" : "every";
    return this.conditions[method]((condition) => condition.eval(object));
  }

  execActions<T extends Record<string, unknown>>(object: T): Partial<T> {
    const result = execActions(this.actions, { ...object });
    const changes: Record<string, unknown> = {};
    for (const key of Object.keys(result)) {
      if (result[key] !== object[key]) {
        changes[key] = result[key];
      }
    }
    return changes as Partial<T>;
  }

  exec(object: Record<string, unknown>): Partial<Record<string, unknown>> | null {
    if (this.evalConditions(object)) {
      return this.execActions(object);
    }
    return null;
  }

  apply(object: Record<string, unknown>): Record<string, unknown> {
    const changes = this.exec(object);
    return Object.assign({}, object, changes);
  }

  getId(): string | undefined {
    return this.id;
  }

  serialize(): Record<string, unknown> {
    return {
      id: this.id,
      stage: this.stage,
      conditionsOp: this.conditionsOp,
      conditions: this.conditions.map((c) => c.serialize()),
      actions: this.actions.map((a) => a.serialize()),
    };
  }
}
