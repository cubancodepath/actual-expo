/**
 * Pure core of `useScheduleForm`: mapping a stored `Schedule` row onto the
 * form's field shape (hydrate), and mapping the form's field shape onto the
 * rule conditions/actions `updateSchedule` persists (save).
 *
 * Split out so this glue is testable without TanStack Form/React Query/React
 * Native — the hook itself stays a thin wrapper around these plus the
 * mutation and picker-driven `form.setFieldValue` calls.
 */

import type { Account } from "@/core/types/models";
import type { Category } from "@/core/types/models";
import type { Payee } from "@/core/types/models";
import type { RecurConfig, RuleAction, RuleCondition, Schedule } from "@/core/types/models";
import { todayStr } from "@/lib/date";
import type { AmountOp, ScheduleFormValues, ScheduleType } from "./useScheduleForm";

/** The form's blank-slate values, before any schedule is hydrated into it. */
export function makeScheduleFormBaseline(): ScheduleFormValues {
  return {
    type: "expense",
    amountOp: "is",
    amount: 0,
    amountUpper: 0,
    name: "",
    accountId: null,
    accountName: "",
    payeeId: null,
    payeeName: "",
    categoryId: null,
    categoryName: "",
    recurConfig: null,
    oneTimeDate: null,
    postsTransaction: false,
  };
}

/**
 * Map a stored schedule row (+ reference data for display names) onto the
 * form's field shape. Sign is stripped from the amount into `type`
 * (expense/income); a recurring `_date` becomes `recurConfig`, a plain date
 * string becomes `oneTimeDate`.
 */
export function scheduleToFormValues(
  s: Schedule,
  {
    accounts,
    categories,
    payees,
  }: { accounts: Account[]; categories: Category[]; payees: Payee[] },
): ScheduleFormValues {
  const op: AmountOp =
    s._amountOp === "isbetween" || s._amountOp === "isapprox" ? s._amountOp : "is";
  let num1 = 0;
  let num2 = 0;
  if (s._amount && typeof s._amount === "object") {
    num1 = s._amount.num1;
    num2 = s._amount.num2;
  } else if (typeof s._amount === "number") {
    num1 = s._amount;
  }
  const type: ScheduleType = num1 < 0 || num2 < 0 ? "expense" : "income";

  const isRecur = !!s._date && typeof s._date === "object" && "frequency" in s._date;

  return {
    type,
    amountOp: op,
    amount: Math.abs(num1),
    amountUpper: Math.abs(num2),
    name: s.name ?? "",
    accountId: s._account ?? null,
    accountName: s._account ? (accounts.find((a) => a.id === s._account)?.name ?? "") : "",
    payeeId: s._payee ?? null,
    payeeName: s._payee ? (payees.find((p) => p.id === s._payee)?.name ?? "") : "",
    categoryId: s._category ?? null,
    categoryName: s._category ? (categories.find((c) => c.id === s._category)?.name ?? "") : "",
    recurConfig: isRecur ? (s._date as RecurConfig) : null,
    oneTimeDate: !isRecur && typeof s._date === "string" ? s._date : null,
    postsTransaction: s.posts_transaction,
  };
}

/**
 * Map the form's field shape onto the rule conditions/actions a save
 * persists. Recurring schedules get an approximate-date condition;
 * non-recurring ones default to today so a schedule always has a date.
 */
export function buildScheduleSaveRule(v: ScheduleFormValues): {
  conditions: RuleCondition[];
  actions: RuleAction[];
} {
  const sign = (cents: number) => (v.type === "expense" ? -Math.abs(cents) : Math.abs(cents));

  const conditions: RuleCondition[] = [];
  if (v.payeeId) conditions.push({ field: "payee", op: "is", value: v.payeeId });
  conditions.push({ field: "account", op: "is", value: v.accountId });
  conditions.push({
    field: "amount",
    op: v.amountOp,
    value:
      v.amountOp === "isbetween"
        ? { num1: sign(v.amount), num2: sign(v.amountUpper) }
        : sign(v.amount),
  });
  if (v.recurConfig) conditions.push({ field: "date", op: "isapprox", value: v.recurConfig });
  else conditions.push({ field: "date", op: "is", value: v.oneTimeDate ?? todayStr() });

  const actions: RuleAction[] = v.categoryId
    ? [{ op: "set", field: "category", value: v.categoryId }]
    : [];

  return { conditions, actions };
}
