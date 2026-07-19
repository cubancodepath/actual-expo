/**
 * Category learning — "Actual learns your categorization".
 * Ported from loot-core/src/server/transactions/transaction-rules.ts
 * (getProbableCategory / updateCategoryRules / getIsSetterRules).
 *
 * When a user categorizes the same payee the same way repeatedly, a
 * payee→category rule is created (or an existing one updated) so future
 * transactions for that payee get categorized automatically. Only payees with
 * `learn_categories = 1` participate.
 */

import { subDays, addDays } from "date-fns";
import { runQuery } from "@/core/db";
import { batchMessages } from "@/core/sync";
import type { Rule } from "./rule";
import { getRules, createRule, updateRule } from "./index";

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
