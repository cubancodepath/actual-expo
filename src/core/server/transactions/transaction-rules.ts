/**
 * Transaction rules — running rules over transactions, split-aware action
 * execution, enrichment (prepare/finalize), form bridging and category
 * learning. Mirrors loot-core/src/server/transactions/transaction-rules.ts,
 * merged from the port's former rules/{engine,splitActions,prepare,apply,learn}.
 */

import { subDays, addDays } from "date-fns";
import { first, runQuery } from "@/core/db";
import { batchMessages } from "@/core/sync";
import { findOrCreatePayee } from "@/core/server/payees";
import type { Rule } from "@/core/server/rules/rule";
import type { Action } from "@/core/server/rules/action";
import { rankRules, fastSetMerge } from "@/core/server/rules/rule-utils";
import { RuleIndexer } from "@/core/server/rules/rule-indexer";
import { getRules, createRule, updateRule } from "@/core/server/rules";
import {
  collectFormulasFromActions,
  extractBalanceOfLiterals,
  resolveAccountIdForBalanceOf,
} from "@/core/server/rules/balanceOfFormula";
import {
  splitTransaction,
  addSplitTransaction,
  groupTransaction,
  recalculateSplit,
  ungroupTransaction,
} from "@/core/shared/transactions";
import type { Transaction, TransactionWithSubtransactions } from "@/core/types/models";

// ═══ Rule running (former rules/engine.ts) ═══

/**
 * Narrow the rule set to those that could apply to `transaction`, then rank
 * them. Mirrors upstream's runRules: a payee indexer + an imported_payee
 * firstchar indexer return the rules keyed on the transaction's values plus the
 * wildcard rules (those without such a condition); their union is the candidate
 * set. This never drops a rule that could match — each returned rule's
 * conditions are still evaluated in apply()/evalConditions — so it is a pure
 * optimization of the linear scan.
 */
function getApplicableRankedRules(rules: Rule[], transaction: Record<string, unknown>): Rule[] {
  const firstcharIndexer = new RuleIndexer({ field: "imported_payee", method: "firstchar" });
  const payeeIndexer = new RuleIndexer({ field: "payee" });
  for (const rule of rules) {
    firstcharIndexer.index(rule);
    payeeIndexer.index(rule);
  }
  const applicable = fastSetMerge(
    firstcharIndexer.getApplicableRules(transaction),
    payeeIndexer.getApplicableRules(transaction),
  );
  return rankRules([...applicable]);
}

/**
 * Run all applicable rules against a transaction in ranked order.
 * Returns a new transaction object with all applicable rules applied.
 */
export function runRules(
  rules: Rule[],
  transaction: Record<string, unknown>,
): Record<string, unknown> {
  const ranked = getApplicableRankedRules(rules, transaction);
  let result = { ...transaction };
  for (const rule of ranked) {
    result = rule.apply(result);
  }
  return result;
}

/**
 * Like runRules, but split-aware: a matching rule with `set-split-amount`
 * actions produces `subtransactions`. Used by schedule previews and the
 * system-generated posting path.
 */
export function runRulesWithSplits(
  rules: Rule[],
  transaction: Record<string, unknown>,
): Record<string, unknown> {
  const ranked = getApplicableRankedRules(rules, transaction);
  let result = { ...transaction };
  for (const rule of ranked) {
    if (rule.evalConditions(result)) {
      result = execActionsWithSplits(rule.actions, result);
    }
  }
  return result;
}

// ═══ Split-aware action execution (former rules/splitActions.ts) ═══

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
    // and BALANCE_OF prefetch (Phase 2.2 / 3d).
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
export function execActionsWithSplits(actions: Action[], transaction: LooseTxn): LooseTxn {
  const parentActions = actions.filter((a) => !splitIndex(a));
  const childActions = actions.filter((a) => splitIndex(a));
  const totalSplitCount = actions.reduce((prev, cur) => Math.max(prev, splitIndex(cur)), 0) + 1;

  const nonSplitResult = execNonSplitActions(parentActions, transaction);
  if (totalSplitCount === 1) return nonSplitResult; // no splits
  if (nonSplitResult.is_child) return nonSplitResult; // can't split a child

  return execSplitActions(childActions, nonSplitResult);
}

// ═══ Enrichment: prepare / finalize / BALANCE_OF prefetch (former rules/prepare.ts) ═══

// ── Types ──

type AccountRow = {
  id: string;
  name: string;
  offbudget: 0 | 1;
  closed: 0 | 1;
};

export type EnrichedTransaction = Record<string, unknown> & {
  payee_name?: string | null;
  _account?: AccountRow | null;
  _account_name?: string;
  _category_name?: string;
  balance?: number;
};

// ── Accounts lookup ──

/**
 * Fresh account map for rule enrichment. Deliberately not cached: the previous
 * module-level cache was never invalidated on account mutations, so rules saw
 * stale account data (onBudget/offBudget conditions, BALANCE_OF). The accounts
 * table is tiny and rules run on save/post (not in tight loops).
 */
async function getAccountMap(): Promise<Map<string, AccountRow>> {
  const rows = await runQuery<AccountRow>(
    "SELECT id, name, offbudget, closed FROM accounts WHERE tombstone = 0",
  );
  return new Map(rows.map((r) => [r.id, r]));
}

/** Retained as a no-op for API compatibility; the map is no longer cached. */
export function invalidateAccountCache(): void {}

// ── Prepare ──

/**
 * Enrich a transaction object with contextual data needed by rule conditions:
 * - payee_name: display name of the payee
 * - _account: full account row (for onBudget/offBudget conditions)
 * - _account_name: account display name
 * - _category_name: category display name
 * - balance: running account balance up to this transaction (expensive, optional)
 *
 * The input should use public rule field names (payee, account, category, etc.)
 */
export async function prepareTransactionForRules(
  txn: Record<string, unknown>,
  opts?: { skipBalance?: boolean },
): Promise<EnrichedTransaction> {
  const enriched: EnrichedTransaction = { ...txn };
  const accounts = await getAccountMap();

  // Payee name
  if (enriched.payee && typeof enriched.payee === "string" && enriched.payee !== "new") {
    const payeeRow = await first<{ name: string }>(
      "SELECT name FROM payees WHERE id = ? AND tombstone = 0",
      [enriched.payee],
    );
    enriched.payee_name = payeeRow?.name ?? null;
  }

  // Account object + name
  if (enriched.account && typeof enriched.account === "string") {
    const acct = accounts.get(enriched.account);
    if (acct) {
      enriched._account = acct;
      enriched._account_name = acct.name;
    }
  }

  // Category name
  if (enriched.category && typeof enriched.category === "string") {
    const catRow = await first<{ name: string }>(
      "SELECT name FROM categories WHERE id = ? AND tombstone = 0",
      [enriched.category],
    );
    enriched._category_name = catRow?.name ?? "";
  }

  // Balance — expensive query, skip for form-level rule application
  if (!opts?.skipBalance && enriched.account && enriched.date) {
    const balanceRow = await first<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
       WHERE acct = ? AND tombstone = 0 AND isChild = 0
       AND (date < ? OR (date = ? AND sort_order <= COALESCE(?, 0)))`,
      [
        enriched.account as string,
        toDateInt(enriched.date),
        toDateInt(enriched.date),
        (enriched.sort_order as number) ?? 0,
      ],
    );
    enriched.balance = balanceRow?.total ?? 0;
  }

  return enriched;
}

// ── BALANCE_OF prefetch ──

/** Normalize a date (ISO "YYYY-MM-DD" or already-int YYYYMMDD) to integer form. */
function toDateInt(date: unknown): number {
  if (typeof date === "number") return date;
  if (typeof date === "string") return Number(date.replace(/-/g, "")) || 0;
  return 0;
}

/**
 * Running balance of `accountId` strictly before (`date`, `sortOrder`),
 * excluding `excludeId`, over non-child rows. Used to resolve BALANCE_OF("…")
 * literals synchronously during formula evaluation.
 */
async function getRunningBalanceBefore(
  accountId: string,
  date: unknown,
  sortOrder: unknown,
  excludeId: unknown,
): Promise<number> {
  const dateInt = toDateInt(date);
  const row = await first<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
     WHERE acct = ? AND tombstone = 0 AND isChild = 0
     AND id != ?
     AND (date < ? OR (date = ? AND COALESCE(sort_order, 0) < COALESCE(?, 0)))`,
    [accountId, (excludeId as string) ?? "", dateInt, dateInt, (sortOrder as number) ?? 0],
  );
  return row?.total ?? 0;
}

/**
 * Prefetch the running balances referenced by BALANCE_OF("…") literals across
 * the given rules' action formulas, so the synchronous evaluator can read them.
 * Returns an empty map (no queries) when no formula references BALANCE_OF.
 */
export async function prefetchBalanceOf(
  rules: Array<{ actions: Array<{ options?: Record<string, unknown> }> }>,
  txn: Record<string, unknown>,
): Promise<Map<string, number>> {
  const literals = new Set<string>();
  for (const rule of rules) {
    for (const formula of collectFormulasFromActions(rule.actions)) {
      for (const lit of extractBalanceOfLiterals(formula)) literals.add(lit);
    }
  }

  const map = new Map<string, number>();
  if (literals.size === 0) return map;

  const accounts = await getAccountMap();
  for (const literal of literals) {
    const accountId = resolveAccountIdForBalanceOf(literal, accounts);
    map.set(
      literal,
      accountId ? await getRunningBalanceBefore(accountId, txn.date, txn.sort_order, txn.id) : 0,
    );
  }
  return map;
}

// ── Finalize ──

/**
 * Clean up a rule-processed transaction:
 * - If payee === 'new', create or find the payee by payee_name
 * - Remove temporary enrichment fields
 */
export async function finalizeTransactionForRules(
  txn: EnrichedTransaction,
): Promise<Record<string, unknown>> {
  // Create new payee if rules set payee_name
  if (txn.payee === "new") {
    if (txn.payee_name && typeof txn.payee_name === "string") {
      const payeeId = await findOrCreatePayee(txn.payee_name);
      txn.payee = payeeId;
    } else {
      txn.payee = null;
    }
  }

  // Remove temporary fields
  delete txn.payee_name;
  delete txn._account;
  delete txn._account_name;
  delete txn._category_name;
  delete txn.balance;
  delete (txn as Record<string, unknown>).parent_amount;
  delete (txn as Record<string, unknown>)._balanceOfPrefetched;

  return txn;
}

// ═══ Form + new-transaction bridging (former rules/apply.ts) ═══

/** Convert integer date (e.g. 20240315) to ISO string "2024-03-15". */
function intDateToString(d: number): string {
  if (!d) return "";
  const s = String(d);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

export type TransactionFormData = {
  acct: string | null;
  payeeId: string | null;
  categoryId: string | null;
  amount: number;
  date: number;
  notes: string | null;
  cleared: boolean;
};

export type RuleResult = {
  acctId: string | null;
  categoryId: string | null;
  notes: string | null;
};

/**
 * Run rules against form data and return the resulting field values.
 */
export function applyRulesToForm(rules: Rule[], form: TransactionFormData): RuleResult {
  // Build transaction using public rule field names (the Condition class uses these)
  const txn: Record<string, unknown> = {
    account: form.acct,
    payee: form.payeeId,
    category: form.categoryId,
    amount: form.amount,
    date: intDateToString(form.date),
    notes: form.notes ?? "",
    cleared: form.cleared,
  };

  const result = runRules(rules, txn);

  return {
    acctId: (result.account as string | null) ?? null,
    categoryId: (result.category as string | null) ?? null,
    notes: (result.notes as string | null) ?? null,
  };
}

/**
 * Suggest a category based on payee selection.
 * Builds a minimal transaction with just the payee and runs rules
 * to see if any rule sets a category for this payee.
 */
export function suggestCategoryForPayee(
  rules: Rule[],
  payeeId: string | null,
  acctId: string | null,
): string | null {
  if (!payeeId) return null;

  const txn: Record<string, unknown> = {
    payee: payeeId,
    account: acctId,
    category: null,
    amount: 0,
    date: "",
    notes: "",
    cleared: false,
  };

  const result = runRules(rules, txn);
  return (result.category as string | null) ?? null;
}

/**
 * Apply rules to a transaction with full enrichment (async).
 *
 * This is the full pipeline matching loot-core's runRules():
 * 1. Enrich with payee_name, account object, category_name, balance
 * 2. Run all rules in ranked order
 * 3. Finalize: create new payees, remove temp fields
 *
 * Use this for save-time rule application (not form-level).
 */
export async function applyRulesEnriched(
  rules: Rule[],
  txn: Record<string, unknown>,
  opts?: { skipBalance?: boolean },
): Promise<Record<string, unknown>> {
  const enriched = await prepareTransactionForRules(txn, opts);
  enriched._balanceOfPrefetched = await prefetchBalanceOf(rules, enriched);
  const result = runRules(rules, enriched);
  return finalizeTransactionForRules(result);
}

export type NewTransactionFields = {
  account: string;
  date: number; // YYYYMMDD int
  amount: number;
  payee?: string | null;
  category?: string | null;
  notes?: string | null;
  cleared?: boolean;
};

/**
 * Run all active rules against a system-generated transaction (schedule
 * post, bulk import) before insertion — overrides fields rather than only
 * filling gaps, matching upstream's addTransactions() bulk path. Manual
 * form entry uses applyRulesToForm's fill-empty-only variant instead,
 * since the user's own input is authoritative there (upstream never runs
 * the full rule engine over manually-typed transactions either).
 */
export async function applyRulesToNewTransaction(
  rules: Rule[],
  fields: NewTransactionFields,
): Promise<NewTransactionFields> {
  if (rules.length === 0) return fields;

  const txn: Record<string, unknown> = {
    account: fields.account,
    payee: fields.payee ?? null,
    category: fields.category ?? null,
    amount: fields.amount,
    date: intDateToString(fields.date),
    notes: fields.notes ?? "",
    cleared: fields.cleared ?? false,
  };

  const result = await applyRulesEnriched(rules, txn);

  return {
    ...fields,
    account: (result.account as string | null) ?? fields.account,
    payee: (result.payee as string | null) ?? fields.payee ?? null,
    category: (result.category as string | null) ?? fields.category ?? null,
    notes: (result.notes as string | null) ?? fields.notes ?? null,
    cleared: typeof result.cleared === "boolean" ? result.cleared : (fields.cleared ?? false),
  };
}

/** A rule-produced split child (amount is already signed). */
export type RuleSubtransaction = {
  amount: number;
  category: string | null;
  notes: string | null;
};

export type NewTransactionWithSplits = {
  fields: NewTransactionFields;
  /** Present only when a matching rule produced `set-split-amount` children. */
  subtransactions?: RuleSubtransaction[];
};

/**
 * Like {@link applyRulesToNewTransaction} but split-aware: when a matching rule
 * carries `set-split-amount` actions the result carries `subtransactions` for
 * the caller to materialize as a parent + child rows. Used by the
 * system-generated posting path (schedules); manual form entry stays
 * fill-empty and non-split, matching upstream.
 */
export async function applyRulesToNewTransactionWithSplits(
  rules: Rule[],
  fields: NewTransactionFields,
): Promise<NewTransactionWithSplits> {
  if (rules.length === 0) return { fields };

  const txn: Record<string, unknown> = {
    account: fields.account,
    payee: fields.payee ?? null,
    category: fields.category ?? null,
    amount: fields.amount,
    date: intDateToString(fields.date),
    notes: fields.notes ?? "",
    cleared: fields.cleared ?? false,
  };

  const enriched = await prepareTransactionForRules(txn);
  enriched._balanceOfPrefetched = await prefetchBalanceOf(rules, enriched);
  const applied = runRulesWithSplits(rules, enriched);
  const result = await finalizeTransactionForRules(applied);

  const newFields: NewTransactionFields = {
    ...fields,
    account: (result.account as string | null) ?? fields.account,
    payee: (result.payee as string | null) ?? fields.payee ?? null,
    category: (result.category as string | null) ?? fields.category ?? null,
    notes: (result.notes as string | null) ?? fields.notes ?? null,
    cleared: typeof result.cleared === "boolean" ? result.cleared : (fields.cleared ?? false),
    amount: typeof result.amount === "number" ? result.amount : fields.amount,
  };

  const rawSubs = result.subtransactions as
    | Array<{ amount?: number; category?: string | null; notes?: string | null }>
    | undefined;

  if (!rawSubs || rawSubs.length === 0) {
    return { fields: newFields };
  }

  return {
    fields: newFields,
    subtransactions: rawSubs.map((st) => ({
      amount: st.amount ?? 0,
      category: st.category ?? null,
      notes: (st.notes as string | null) ?? null,
    })),
  };
}

// ═══ Category learning (former rules/learn.ts) ═══

export type LearnTransaction = {
  id: string;
  payee: string | null;
  category: string | null;
  date: number; // YYYYMMDD int
};

// ── Date int helpers (DB stores integer YYYYMMDD) ──

function intToDate(d: number): Date {
  const s = String(d);
  return new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
}

function dateToInt(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/**
 * The category a payee is "probably" in: the most frequent category among the
 * given transactions, but only if it appears at least 3 times (so a single edit
 * doesn't immediately create a rule).
 */
export function getProbableCategory(transactions: LearnTransaction[]): string | null {
  const scores = new Map<string, number>();
  for (const trans of transactions) {
    if (trans.category) scores.set(trans.category, (scores.get(trans.category) ?? 0) + 1);
  }

  let winner: { score: number; category: string | null } | null = null;
  for (const trans of transactions) {
    const score = trans.category ? (scores.get(trans.category) ?? 0) : 0;
    if (!winner || score > winner.score) {
      winner = { score, category: trans.category };
    }
  }

  return winner && winner.score >= 3 ? winner.category : null;
}

/**
 * Rules that are a single `<condField> is/isNot ?` condition setting
 * `<actionField>` — the shape category-learning creates and maintains.
 */
function* getIsSetterRules(
  rules: Rule[],
  stage: string | null,
  condField: string,
  actionField: string,
  { condValue, actionValue }: { condValue?: string; actionValue?: string },
): Generator<Rule> {
  for (const rule of rules) {
    if (
      rule.stage === stage &&
      rule.actions.length === 1 &&
      rule.actions[0].op === "set" &&
      rule.actions[0].field === actionField &&
      (actionValue === undefined || rule.actions[0].value === actionValue) &&
      rule.conditions.length === 1 &&
      (rule.conditions[0].op === "is" || rule.conditions[0].op === "isNot") &&
      rule.conditions[0].field === condField &&
      (condValue === undefined || rule.conditions[0].value === condValue)
    ) {
      yield rule;
    }
  }
}

/**
 * Learn payee→category rules from the given (just-edited) transactions. For
 * each edited transaction's payee, look at its latest 5 transactions in a
 * ±180-day window; if one category dominates (getProbableCategory), create or
 * update a `payee is X → set category Y` rule.
 */
export async function updateCategoryRules(transactions: LearnTransaction[]): Promise<void> {
  if (transactions.length === 0) return;

  const payeeIds = new Set(transactions.map((t) => t.payee));
  const transIds = new Set(transactions.map((t) => t.id));

  let oldest = transactions[0].date;
  for (const t of transactions) {
    if (t.date < oldest) oldest = t.date;
  }
  // 180 days behind (bounded history) and ahead (future/scheduled) — matches upstream.
  const lower = dateToInt(subDays(intToDate(oldest), 180));
  const upper = dateToInt(addDays(new Date(), 180));

  // Resolve payee/category through their mapping tables (mirrors upstream's
  // v_transactions read): a payee merged into a target must have its history
  // counted under, and gated by the learn_categories flag of, the TARGET.
  const register = await runQuery<LearnTransaction>(
    `SELECT t.id AS id,
            COALESCE(pm.targetId, t.description) AS payee,
            COALESCE(cm.transferId, t.category) AS category,
            t.date AS date
     FROM transactions t
     LEFT JOIN accounts a ON a.id = t.acct
     LEFT JOIN payee_mapping pm ON pm.id = t.description
     LEFT JOIN category_mapping cm ON cm.id = t.category
     LEFT JOIN payees p ON p.id = COALESCE(pm.targetId, t.description)
     WHERE t.date >= ? AND t.date <= ? AND t.isParent = 0 AND t.tombstone = 0
       AND a.closed = 0 AND p.learn_categories = 1
     ORDER BY t.date DESC`,
    [lower, upper],
  );

  // Partition by payee (query is date-DESC, so each list is newest-first).
  const byPayee = new Map<string, LearnTransaction[]>();
  for (const t of register) {
    if (!t.payee) continue;
    const list = byPayee.get(t.payee) ?? [];
    list.push(t);
    byPayee.set(t.payee, list);
  }

  const categoriesToSet = new Map<string, string>();
  for (const payeeId of payeeIds) {
    if (!payeeId) continue;
    const latest = (byPayee.get(payeeId) ?? []).slice(0, 5);
    // Only learn if one of those latest transactions is one we just edited.
    if (latest.some((t) => transIds.has(t.id))) {
      const category = getProbableCategory(latest);
      if (category) categoriesToSet.set(payeeId, category);
    }
  }

  if (categoriesToSet.size === 0) return;

  const rules = await getRules();

  await batchMessages(async () => {
    for (const [payeeId, category] of categoriesToSet) {
      const setters = [
        ...getIsSetterRules(rules, null, "payee", "category", { condValue: payeeId }),
      ];

      if (setters.length > 0) {
        // Update every matching rule (duplicates can exist across clients).
        for (const rule of setters) {
          if (rule.actions[0].value !== category) {
            await updateRule(rule.getId()!, {
              actions: [{ op: "set", field: "category", value: category }],
            });
          }
        }
      } else {
        await createRule({
          conditions: [{ field: "payee", op: "is", value: payeeId }],
          actions: [{ op: "set", field: "category", value: category }],
        });
      }
    }
  });
}
