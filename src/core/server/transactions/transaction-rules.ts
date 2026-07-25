/**
 * Transaction rules — running rules over transactions, split-aware action
 * execution, enrichment (prepare/finalize), form bridging and category
 * learning. Mirrors loot-core/src/server/transactions/transaction-rules.ts,
 * merged from the port's former rules/{engine,splitActions,prepare,apply,learn}.
 */

import { subDays, addDays } from "date-fns";
import * as monthUtils from "@/core/shared/monthUtils";
import { first, runQuery } from "@/core/server/db";
import { batchMessages } from "@/core/server/sync";
import { listen, type SyncEvent } from "@/core/server/sync/syncEvents";
import { ensureMappingsLoaded } from "@/core/server/db/mappings";
import { findOrCreatePayee } from "@/core/server/payees";
import { Rule, execActions } from "@/core/server/rules/rule";
import { Action } from "@/core/server/rules/action";
import { Condition } from "@/core/server/rules/condition";
import { ungroupTransaction } from "@/core/shared/transactions";
import {
  rankRules,
  fastSetMerge,
  getApproxNumberThreshold,
  sortNumbers,
  extractTagsForFilter,
  iterateIds,
} from "@/core/server/rules/rule-utils";
import { RuleIndexer } from "@/core/server/rules/rule-indexer";
import { makeRule, createRule, updateRule } from "@/core/server/rules";
import {
  collectFormulasFromActions,
  extractBalanceOfLiterals,
  resolveAccountIdForBalanceOf,
} from "@/core/server/rules/balanceOfFormula";
import type {
  RuleCondition,
  RuleAction,
  TransactionWithSubtransactions,
} from "@/core/types/models";
import type { RuleRow } from "@/core/server/db/types";
import type { ObjectExpression } from "@/core/shared/query";

// ═══ In-memory rule store (upstream module state) ═══

let allRules: Map<string, Rule> | null = null;
let firstcharIndexer: RuleIndexer;
let payeeIndexer: RuleIndexer;
let unlistenSync: (() => void) | null = null;

export function resetState(): void {
  allRules = new Map();
  firstcharIndexer = new RuleIndexer({ field: "imported_payee", method: "firstchar" });
  payeeIndexer = new RuleIndexer({ field: "payee" });
}

/**
 * Load all rules from the DB into the in-memory store + indexers and register a
 * sync listener so the store stays fresh. Idempotent — safe to call repeatedly
 * (re-registers the listener). Mirrors upstream loadRules().
 */
export async function loadRules(): Promise<void> {
  await ensureMappingsLoaded();
  resetState();

  const rows = await runQuery<RuleRow>(
    "SELECT * FROM rules WHERE conditions IS NOT NULL AND actions IS NOT NULL AND tombstone = 0",
  );
  for (const row of rows) {
    // Migrate legacy stages (cleanup/modify → pre), like upstream.
    const stage = (row as { stage?: string }).stage;
    if (stage === "cleanup" || stage === "modify") {
      (row as { stage?: string }).stage = "pre";
    }
    const rule = makeRule(row);
    if (rule) {
      allRules!.set(rule.getId()!, rule);
      firstcharIndexer.index(rule);
      payeeIndexer.index(rule);
    }
  }

  if (unlistenSync) unlistenSync();
  unlistenSync = listen(onApplySync);
}

/** In-memory rules — lazy-loads the store on first use. */
export async function getRules(): Promise<Rule[]> {
  if (allRules == null) await loadRules();
  return [...allRules!.values()];
}

/**
 * Drop the in-memory store and detach the sync listener so the next
 * getRules()/runRules() reloads from the (possibly new) DB. Call on budget
 * close / DB swap — the store's lifetime must not outlive the DB it mirrors.
 */
export function unloadRules(): void {
  if (unlistenSync) unlistenSync();
  unlistenSync = null;
  allRules = null;
}

/**
 * Keep the in-memory store fresh after a CRDT apply. Adaptation of upstream's
 * `onApplySync(oldValues, newValues)`: our sync bus (syncEvents) carries only
 * table NAMES, not row data, so on a `rules` change we reload the table and on
 * a `*mapping*` change we re-run migrateIds over the stored rules — the same
 * pattern used by src/core/db/mappings.ts.
 */
function onApplySync(event: SyncEvent): void {
  if (!("tables" in event)) return;
  // Invalidate the store on rule CRUD OR any mapping change (payee/category
  // merges re-project rule ids). The next getRules()/runRules() reloads from
  // the DB — makeRule re-runs migrateIds against the (by-then refreshed)
  // mappings, matching the original always-fresh semantics. A synchronous,
  // awaited reload avoids the stale-read race a fire-and-forget reload would
  // create, and it sidesteps listener-ordering vs the mappings module. Pure
  // transaction writes don't touch these tables, so bulk imports stay warm.
  if (event.tables.includes("rules") || event.tables.some((t) => t.includes("mapping"))) {
    allRules = null;
  }
}

// ═══ Schedule ↔ rule linkage ═══

export async function getRuleIdFromScheduleId(scheduleId: string): Promise<string | null> {
  const row = await first<{ rule: string | null }>("SELECT rule FROM schedules WHERE id = ?", [
    scheduleId,
  ]);
  return row?.rule || null;
}

export async function getAllRuleIdsFromSchedules(excluding: string): Promise<string[]> {
  const rows = await runQuery<{ rule: string | null }>("SELECT rule FROM schedules");
  return rows
    .map((r) => r.rule)
    .filter((ruleId): ruleId is string => !!ruleId && ruleId !== excluding);
}

// ═══ Rule running (former rules/engine.ts) ═══

/**
 * Narrow a given rule set to those that could apply to `transaction`, then rank
 * them. Pure helper used to apply an explicit, caller-provided rule set (form
 * bridging, previews); the stateful `runRules` below uses the module indexers.
 */
function getApplicableRankedRules(rules: Rule[], transaction: Record<string, unknown>): Rule[] {
  const fc = new RuleIndexer({ field: "imported_payee", method: "firstchar" });
  const pe = new RuleIndexer({ field: "payee" });
  for (const rule of rules) {
    fc.index(rule);
    pe.index(rule);
  }
  const applicable = fastSetMerge(
    fc.getApplicableRules(transaction),
    pe.getApplicableRules(transaction),
  );
  return rankRules([...applicable]);
}

/**
 * Apply an explicit, ranked rule set against a transaction. Split-aware (a
 * matching rule with `set-split-amount` actions produces `subtransactions`, via
 * rule.apply → rules/rule.ts::execActions). Pure — used by the form/preview
 * bridges; not the stateful entry point.
 */
export function applyRankedRules(
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
 * Run all active rules against a transaction using the in-memory store —
 * upstream `runRules(trans, accounts)`. Enriches, resolves schedule↔rule
 * linkage (a transaction's own schedule rule runs unconditionally; other
 * schedules' rules are skipped; unlinked rules run normally), prefetches
 * BALANCE_OF, applies in ranked order, then finalizes. Split-aware.
 *
 * `accounts` is accepted for signature parity; enrichment builds its own
 * account map internally (getAccountMap).
 */
export async function runRules(
  trans: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  accounts: Map<string, unknown> | null = null,
): Promise<Record<string, unknown>> {
  if (allRules == null) await loadRules();

  let finalTrans = await prepareTransactionForRules({ ...trans });

  let scheduleRuleID = "";
  if (trans.schedule != null) {
    scheduleRuleID = (await getRuleIdFromScheduleId(trans.schedule as string)) ?? "";
  }
  const ruleIdsLinkedToSchedules = await getAllRuleIdsFromSchedules(scheduleRuleID);

  const rules = rankRules(
    fastSetMerge(
      firstcharIndexer.getApplicableRules(trans),
      payeeIndexer.getApplicableRules(trans),
    ),
  );

  finalTrans._balanceOfPrefetched = await prefetchBalanceOfForTransaction(rules, finalTrans);

  for (const rule of rules) {
    const ruleId = rule.getId() ?? "";
    if (scheduleRuleID !== "") {
      if (ruleId === scheduleRuleID) {
        // The transaction's own schedule rule runs unconditionally.
        Object.assign(finalTrans, rule.execActions(finalTrans));
        continue;
      }
      if (ruleIdsLinkedToSchedules.includes(ruleId)) continue;
    }
    finalTrans = rule.apply(finalTrans);
  }

  return finalizeTransactionForRules(finalTrans);
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
export async function prefetchBalanceOfForTransaction(
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

/** Legacy name kept for internal callers. */
export const prefetchBalanceOf = prefetchBalanceOfForTransaction;

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

  const result = applyRankedRules(rules, txn);

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

  const result = applyRankedRules(rules, txn);
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
  const result = applyRankedRules(rules, enriched);
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
  const applied = applyRankedRules(rules, enriched);
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
 * Rules that are a single `<condField> oneOf [...]` condition setting
 * `<actionField>` — the shape of the payee-rename rule.
 */
function* getOneOfSetterRules(
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
      (actionValue == null || rule.actions[0].value === actionValue) &&
      rule.conditions.length === 1 &&
      rule.conditions[0].op === "oneOf" &&
      rule.conditions[0].field === condField &&
      (condValue == null || (rule.conditions[0].value as string[]).indexOf(condValue) !== -1)
    ) {
      yield rule;
    }
  }
}

/** All rules referencing `payeeId` in a payee condition/action, ranked. */
export async function getRulesForPayee(payeeId: string): Promise<Rule[]> {
  const rules = new Set<Rule>();
  iterateIds(await getRules(), "payee", (rule, id) => {
    if (id === payeeId) rules.add(rule);
  });
  return rankRules([...rules]);
}

/**
 * Find or create the `pre` payee-rename rule (`imported_payee oneOf [...] →
 * set payee <to>`), merging `fromNames` into its condition. Returns the rule id.
 * Faithful port of upstream updatePayeeRenameRule.
 */
export async function updatePayeeRenameRule(fromNames: string[], to: string): Promise<string> {
  const rules = await getRules();
  const renameRule = getOneOfSetterRules(rules, "pre", "imported_payee", "payee", {
    actionValue: to,
  }).next().value;

  if (renameRule) {
    const condition = renameRule.conditions[0];
    const newValue = [
      ...fastSetMerge(
        new Set(condition.value as string[]),
        new Set(fromNames.filter((n) => n !== "")),
      ),
    ];
    await updateRule(renameRule.getId()!, {
      conditions: [{ field: "imported_payee", op: "oneOf", value: newValue }],
    });
    return renameRule.getId()!;
  }

  return createRule({
    stage: "pre",
    conditionsOp: "and",
    conditions: [{ field: "imported_payee", op: "oneOf", value: fromNames }],
    actions: [{ op: "set", field: "payee", value: to }],
  });
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

// ═══ Apply rule actions to existing transactions (upstream applyActions) ═══

/**
 * Apply a set of rule actions to the given transactions and persist the result
 * (upstream `applyActions` / the `rule-apply-actions` handler). Enriches each
 * transaction, prefetches BALANCE_OF, runs the actions (split-aware), ungroups
 * to flat rows, finalizes, and writes via `batchUpdateTransactions`. Returns the
 * batch result, or `null` if any action failed to parse.
 */
export async function applyActions(
  transactions: Array<Record<string, unknown>>,
  actions: Array<Action | RuleAction>,
): Promise<unknown | null> {
  const parsedActions = actions
    .map((action) => {
      if (action instanceof Action) return action;
      try {
        const a = action as RuleAction;
        switch (a.op) {
          case "set-split-amount":
            return new Action(a.op, null, a.value, a.options);
          case "link-schedule":
            return new Action(a.op, null, a.value, undefined);
          case "prepend-notes":
          case "append-notes":
            return new Action(a.op, null, a.value, undefined);
          case "delete-transaction":
            return new Action(a.op, null, null, undefined);
          default:
            return new Action(a.op, a.field ?? null, a.value, a.options);
        }
      } catch {
        return null;
      }
    })
    .filter((a): a is Action => a != null);

  // A parse failure (bad op/field) aborts the whole apply — matches upstream.
  if (parsedActions.length !== actions.length) return null;

  const prepared = await Promise.all(transactions.map((t) => prepareTransactionForRules({ ...t })));
  for (const trans of prepared) {
    trans._balanceOfPrefetched = await prefetchBalanceOfForTransaction(
      [{ actions: parsedActions }],
      trans,
    );
  }

  const updated: Array<Record<string, unknown>> = [];
  for (const trans of prepared) {
    const flat = ungroupTransaction(
      execActions(parsedActions, trans) as unknown as TransactionWithSubtransactions,
    );
    for (const t of flat) {
      updated.push(await finalizeTransactionForRules(t as unknown as EnrichedTransaction));
    }
  }

  // Lazy import to avoid a static cycle (transactions/index imports this module).
  const { batchUpdateTransactions } = await import("./index");
  return batchUpdateTransactions({ updated: updated as never });
}

// ═══ conditions → AQL (former make-filters-from-conditions handler) ═══
//
// Faithful port of loot-core/src/server/transactions/transaction-rules.ts
// `conditionSpecialCases` + `conditionsToAQL`. Turns a rule/report's conditions
// into AQL filter objects so a query can find every matching transaction — the
// inverse of running a rule over one transaction.
//
// Differences from upstream are load-bearing, not stylistic:
//  - Dates stay strings end-to-end (this port's decision), so the date helpers
//    come from `monthUtils` (string-based) instead of date-fns.
//  - `$regexp` (matches / hasTags / hasAnyTag) is emitted verbatim; expo-sqlite
//    can't register the REGEXP function, so the DIALECT throws
//    `RegexpUnsupportedError` when such a query actually runs. Callers that may
//    hit these ops catch that at execution time and fall back per-widget.

/**
 * Some ops fan out into several conditions. Matching upstream: an `is category
 * null` also excludes transfers and parents; `isNot category null` excludes
 * parents. Everything else passes through unchanged.
 */
export function conditionSpecialCases(cond: Condition | null): Condition | null {
  if (!cond) {
    return cond;
  }

  // special cases that require multiple conditions
  if (cond.op === "is" && cond.field === "category" && cond.value === null) {
    return new Condition(
      "and",
      cond.field,
      [
        cond,
        new Condition("is", "transfer", false, undefined),
        new Condition("is", "parent", false, undefined),
      ],
      {},
    );
  } else if (cond.op === "isNot" && cond.field === "category" && cond.value === null) {
    return new Condition(
      "and",
      cond.field,
      [cond, new Condition("is", "parent", false, undefined)],
      {},
    );
  }
  return cond;
}

export type ConditionsToAQLOptions = {
  recurDateBounds?: number;
  applySpecialCases?: boolean;
};

export type ConditionsToAQLResult = {
  filters: ObjectExpression[];
  errors: string[];
};

// This does the inverse: finds all the transactions matching a rule
export function conditionsToAQL(
  conditions: Array<Condition | RuleCondition>,
  { recurDateBounds = 100, applySpecialCases = true }: ConditionsToAQLOptions = {},
): ConditionsToAQLResult {
  const errors: string[] = [];

  const parsed = conditions
    .map((cond) => {
      if (cond instanceof Condition) {
        return cond;
      }

      try {
        return new Condition(cond.op, cond.field, cond.value, cond.options);
      } catch (e) {
        errors.push((e as { type?: string }).type || "internal");
        return null;
      }
    })
    .map((cond) => (applySpecialCases ? conditionSpecialCases(cond) : cond))
    .filter(Boolean) as Condition[];

  // rule -> actualql
  const mapConditionToActualQL = (cond: Condition): ObjectExpression => {
    const { type, options } = cond as {
      type: string;
      options: Record<string, unknown> | undefined;
    };
    let { field, op, value } = cond as {
      field: string;
      op: string;
      value: unknown;
    };

    const getValue = (value: unknown): unknown => {
      if (type === "number") {
        return (value as { value: number }).value;
      }
      return value;
    };

    if (field === "transfer" && op === "is") {
      field = "transfer_id";
      if (value) {
        op = "isNot";
        value = null;
      } else {
        value = null;
      }
    } else if (field === "parent" && op === "is") {
      field = "is_parent";
      if (value) {
        op = "true";
      } else {
        op = "false";
      }
    } else if (field === "category_group") {
      field = "category.group";
    }

    const apply = (field: string, aqlOp: string, value: unknown): ObjectExpression => {
      if (type === "number") {
        if (options) {
          if (options.outflow) {
            return {
              $and: [{ amount: { $lt: 0 } }, { [field]: { $transform: "$neg", [aqlOp]: value } }],
            };
          } else if (options.inflow) {
            return {
              $and: [{ amount: { $gt: 0 } }, { [field]: { [aqlOp]: value } }],
            };
          }
        }

        return { amount: { [aqlOp]: value } };
      } else if (type === "string") {
        return {
          [field]: {
            $transform: !["hasTags", "hasAnyTag"].includes(op) ? "$lower" : undefined,
            [aqlOp]: value,
          },
        };
      } else if (type === "date") {
        return { [field]: { [aqlOp]: (value as { date: string }).date } };
      }
      return { [field]: { [aqlOp]: value } };
    };

    switch (op) {
      case "isapprox":
      case "is":
        if (type === "date") {
          const v = value as {
            type: string;
            date: string;
            // rSchedule Schedule — occurrences() exists at runtime.
            schedule?: {
              occurrences: (opts: { take: number }) => { toArray: () => { date: Date }[] };
            };
          };
          if (v.type === "recur") {
            const dates = v
              .schedule!.occurrences({ take: recurDateBounds })
              .toArray()
              .map((d) => monthUtils.dayFromDate(d.date));

            return {
              $or: dates.map((d) => {
                if (op === "isapprox") {
                  return {
                    $and: [
                      { date: { $gte: monthUtils.subDays(d, 2) } },
                      { date: { $lte: monthUtils.addDays(d, 2) } },
                    ],
                  };
                }
                return { date: d };
              }),
            };
          } else {
            if (op === "isapprox") {
              const fullDate = monthUtils.parseDate(v.date);
              const high = monthUtils.addDays(fullDate, 2);
              const low = monthUtils.subDays(fullDate, 2);

              return {
                $and: [{ date: { $gte: low } }, { date: { $lte: high } }],
              };
            } else {
              switch (v.type) {
                case "date":
                  return { date: v.date };
                case "month": {
                  const low = v.date + "-00";
                  const high = v.date + "-99";
                  return {
                    $and: [{ date: { $gte: low } }, { date: { $lte: high } }],
                  };
                }
                case "year": {
                  const low = v.date + "-00-00";
                  const high = v.date + "-99-99";
                  return {
                    $and: [{ date: { $gte: low } }, { date: { $lte: high } }],
                  };
                }
                default:
              }
            }
          }
        } else if (type === "number") {
          const number = (value as { value: number }).value;
          if (op === "isapprox") {
            const threshold = getApproxNumberThreshold(number);

            return {
              $and: [
                apply(field, "$gte", number - threshold),
                apply(field, "$lte", number + threshold),
              ],
            };
          }
          return apply(field, "$eq", number);
        } else if (type === "string") {
          if (value === "") {
            return {
              $or: [apply(field, "$eq", null), apply(field, "$eq", "")],
            };
          }
        }
        return apply(field, "$eq", value);
      case "isNot":
        return apply(field, "$ne", value);

      case "isbetween": {
        // This operator is only applicable to the specific `between`
        // number type so we don't use `apply`
        const { num1, num2 } = value as { num1: number; num2: number };
        const [low, high] = sortNumbers(num1, num2);
        return {
          [field]: [{ $gte: low }, { $lte: high }],
        };
      }
      case "contains":
        // Running contains with id will automatically reach into
        // the `name` of the referenced table and do a string match
        return apply(type === "id" ? field + ".name" : field, "$like", "%" + value + "%");
      case "matches":
        // Running contains with id will automatically reach into
        // the `name` of the referenced table and do a regex match
        return apply(type === "id" ? field + ".name" : field, "$regexp", value);
      case "doesNotContain":
        // Running contains with id will automatically reach into
        // the `name` of the referenced table and do a string match
        return apply(type === "id" ? field + ".name" : field, "$notlike", "%" + value + "%");
      case "oneOf": {
        const values = value as unknown[];
        if (values.length === 0) {
          // This forces it to match nothing
          return { id: null };
        }
        return { $or: values.map((v) => apply(field, "$eq", v)) };
      }

      case "hasTags": {
        const tagValues = extractTagsForFilter(value as string);

        if (tagValues.length === 0) {
          // No `#tag` patterns in the input — match nothing rather than
          // returning an empty `$and` (which would match every row).
          return { id: null };
        }

        return {
          $and: tagValues.map((v) => {
            const escapedTag = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\$/g, "[$]"); // Use '[$]' instead of '\$' so AQL string unescaping doesn't turn it into a bare '$' end-of-string anchor
            const pattern = `(?<!#)${escapedTag}([\\s#]|$)`;
            return apply(field, "$regexp", pattern);
          }),
        };
      }

      case "hasAnyTag": {
        const tagValues = extractTagsForFilter(value as string);
        if (tagValues.length === 0) {
          return { id: null };
        }
        return {
          $or: tagValues.map((v) => {
            const escapedTag = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\$/g, "[$]"); // Use '[$]' instead of '\$' so AQL string unescaping doesn't turn it into a bare '$' end-of-string anchor
            const pattern = `(?<!#)${escapedTag}([\\s#]|$)`;
            return apply(field, "$regexp", pattern);
          }),
        };
      }

      case "notOneOf": {
        const notValues = value as unknown[];
        if (notValues.length === 0) {
          // This forces it to match nothing
          return { id: null };
        }
        return { $and: notValues.map((v) => apply(field, "$ne", v)) };
      }
      case "gt":
        return apply(field, "$gt", getValue(value));
      case "gte":
        return apply(field, "$gte", getValue(value));
      case "lt":
        return apply(field, "$lt", getValue(value));
      case "lte":
        return apply(field, "$lte", getValue(value));
      case "true":
        return apply(field, "$eq", true);
      case "false":
        return apply(field, "$eq", false);
      case "and":
        return {
          $and: (getValue(value) as Condition[]).map((subExpr) => mapConditionToActualQL(subExpr)),
        };

      case "onBudget":
        return { "account.offbudget": false };
      case "offBudget":
        return { "account.offbudget": true };

      default:
        throw new Error("Unhandled operator: " + op);
    }
  };

  const filters = parsed.map(mapConditionToActualQL);
  return { filters, errors };
}
