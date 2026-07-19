/**
 * Account scoping + balances for the forecast. Port of loot-core
 * server/forecast/forecast-accounts.ts. `balance_current` = Σ of all
 * non-tombstone transaction amounts (reused from our getAccounts()).
 */
import { getAccounts as getAllAccounts } from "../accounts";
import type { RuleCondition } from "../rules/types";
import type { AccountWithComputedBalance } from "./types";

// getAccounts() returns offbudget/closed as booleans and balance as a number.
type AccountRow = {
  id: string;
  name: string;
  offbudget: boolean;
  closed: boolean;
  balance?: number;
};

export function matchesAccountCondition(
  account: { id: string; name: string; offbudget: boolean },
  condition: RuleCondition,
): boolean {
  const name = account.name.toLowerCase();
  const v = condition.value;
  switch (condition.op) {
    case "is":
      return account.id === v;
    case "isNot":
      return account.id !== v;
    case "oneOf":
      return Array.isArray(v) && v.includes(account.id);
    case "notOneOf":
      return Array.isArray(v) && !v.includes(account.id);
    case "contains":
      return name.includes(String(v).toLowerCase());
    case "doesNotContain":
      return !name.includes(String(v).toLowerCase());
    case "matches":
      try {
        return new RegExp(String(v)).test(name);
      } catch {
        return false;
      }
    case "onBudget":
      return account.offbudget === false;
    case "offBudget":
      return account.offbudget === true;
    default:
      return false;
  }
}

export function getAccountRestrictionMode(
  conditions: RuleCondition[],
  conditionsOp: "and" | "or",
): boolean {
  if (conditions.length === 0) return false;
  const accountConds = conditions.filter((c) => c.field === "account");
  if (accountConds.length === 0) return false;
  const hasNonAccount = conditions.some((c) => c.field !== "account");
  return !hasNonAccount || conditionsOp === "and";
}

export async function resolveAccountIdsFromConditions(
  conditions: RuleCondition[],
  conditionsOp: "and" | "or",
): Promise<string[] | undefined> {
  const accountConds = conditions.filter((c) => c.field === "account");
  if (accountConds.length === 0) return undefined;

  const accounts = (await getAllAccounts()) as unknown as AccountRow[];
  return accounts
    .filter((acc) => {
      const matches = accountConds.map((c) => matchesAccountCondition(acc, c));
      return conditionsOp === "or" ? matches.some(Boolean) : matches.every(Boolean);
    })
    .map((acc) => acc.id);
}

/** Load selected accounts with their computed balance_current (= Σ amounts). */
export async function getForecastAccounts(
  accountIds?: string[],
): Promise<AccountWithComputedBalance[]> {
  const accounts = (await getAllAccounts()) as unknown as AccountRow[];
  const selected =
    accountIds === undefined ? accounts : accounts.filter((a) => accountIds.includes(a.id));
  return selected.map((a) => ({
    id: a.id,
    name: a.name,
    closed: a.closed ? 1 : 0,
    offbudget: a.offbudget ? 1 : 0,
    balance_current: a.balance ?? 0,
  }));
}

export async function resolveForecastAccounts({
  accountIds,
  plainConditions,
  resolvedConditionsOp,
  canRestrictAccounts,
}: {
  accountIds: string[] | undefined;
  plainConditions: RuleCondition[];
  resolvedConditionsOp: "and" | "or";
  canRestrictAccounts: boolean;
}): Promise<AccountWithComputedBalance[]> {
  let resolved = accountIds;
  if (canRestrictAccounts && plainConditions.length > 0) {
    const fromConds = await resolveAccountIdsFromConditions(plainConditions, resolvedConditionsOp);
    if (fromConds !== undefined) {
      resolved =
        resolved !== undefined ? resolved.filter((id) => fromConds.includes(id)) : fromConds;
    }
  }
  return getForecastAccounts(resolved);
}
