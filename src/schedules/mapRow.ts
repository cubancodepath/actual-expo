/**
 * Map a raw schedule row (from AQL liveQuery) to a Schedule domain object.
 *
 * The liveQuery output has:
 * - `next_date`: integer (YYYYMMDD) from COALESCE(snd.local_next_date, snd.base_next_date)
 * - `conditions`: parsed JSON array (RuleCondition[]) — parsed by AQL executor
 * - `actions`: parsed JSON array (RuleAction[]) — parsed by AQL executor
 * - Boolean fields already converted (completed, posts_transaction, tombstone)
 */

import { extractScheduleConds } from "./helpers";
import { intToStr } from "../lib/date";
import type { Schedule, RecurConfig } from "./types";
import type { RuleCondition, RuleAction } from "../rules/types";

export function mapScheduleRow(row: Record<string, unknown>): Schedule {
  const conditions: RuleCondition[] = Array.isArray(row.conditions)
    ? row.conditions
    : typeof row.conditions === "string"
      ? JSON.parse(row.conditions)
      : [];
  const actions: RuleAction[] = Array.isArray(row.actions)
    ? row.actions
    : typeof row.actions === "string"
      ? JSON.parse(row.actions)
      : [];

  const conds = extractScheduleConds(conditions);
  const categoryAction = actions.find((a) => a.op === "set" && a.field === "category");

  const nextDateRaw = row.next_date;
  const nextDate =
    typeof nextDateRaw === "number" ? intToStr(nextDateRaw) : (nextDateRaw as string | null);

  return {
    id: row.id as string,
    name: (row.name as string) ?? null,
    rule: (row.rule as string) ?? "",
    completed: row.completed === true || row.completed === 1,
    posts_transaction: row.posts_transaction === true || row.posts_transaction === 1,
    tombstone: row.tombstone === true || row.tombstone === 1,
    next_date: nextDate,
    _payee: (conds.payee?.value as string) ?? null,
    _account: (conds.account?.value as string) ?? null,
    _amount: (conds.amount?.value as number | { num1: number; num2: number }) ?? null,
    _amountOp: conds.amount?.op ?? null,
    _date: (conds.date?.value as RecurConfig | string) ?? null,
    _category: (categoryAction?.value as string) ?? null,
    _conditions: conditions,
  };
}
