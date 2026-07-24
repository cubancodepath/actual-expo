/**
 * Category-condition helpers for report spreadsheets — port of desktop-client
 * `reports/spreadsheets/budgetDataQuery.ts` (the pure parts). Used by Spending
 * (and later Budget analysis) to narrow the budgeted categories by a widget's
 * `category` / `category_group` conditions in memory. `fetchBudgetData` (the
 * budget-endpoint fan-out) is intentionally not ported — Spending reads the
 * budget table directly via AQL.
 */
import type { Category, CategoryGroup, RuleCondition } from "@/core/types/models";

type BudgetDataConditionsOp = "and" | "or";

/** A category/category_group condition we know how to evaluate in memory. */
type CategoryCondition = RuleCondition & { field: "category" | "category_group" };

export function isSupportedCategoryCondition(condition: RuleCondition): boolean {
  if (condition.field !== "category" && condition.field !== "category_group") {
    return false;
  }

  if (condition.op === "is" || condition.op === "isNot") {
    return typeof condition.value === "string";
  }

  if (condition.op === "oneOf" || condition.op === "notOneOf") {
    return Array.isArray(condition.value) && condition.value.every((id) => typeof id === "string");
  }

  if (
    condition.op === "contains" ||
    condition.op === "doesNotContain" ||
    condition.op === "matches"
  ) {
    return typeof condition.value === "string";
  }

  return false;
}

export function filterCategoriesByConditions(
  categories: Category[],
  categoryGroups: CategoryGroup[],
  conditions: RuleCondition[] | undefined,
  conditionsOp: BudgetDataConditionsOp | undefined,
): Category[] {
  if (!conditions || conditions.length === 0) {
    return categories;
  }

  const categoryConditions = conditions.filter(
    (cond): cond is CategoryCondition =>
      !(cond as { customName?: unknown }).customName &&
      (cond.field === "category" || cond.field === "category_group"),
  );

  if (categoryConditions.length === 0) {
    return categories;
  }

  const categoryGroupNameById = new Map(categoryGroups.map((group) => [group.id, group.name]));

  // If we can't safely interpret any category condition, do not attempt to
  // filter categories (better to be broad than silently exclude data).
  if (!categoryConditions.every(isSupportedCategoryCondition)) {
    return categories;
  }

  const evaluateCondition = (category: Category, condition: CategoryCondition): boolean => {
    const key = condition.field === "category_group" ? (category.group ?? "") : category.id;
    const textValue =
      condition.field === "category_group"
        ? (categoryGroupNameById.get(key) ?? key)
        : category.name;
    const value = condition.value;

    if (condition.op === "is") {
      return key === value;
    }
    if (condition.op === "isNot") {
      return key !== value;
    }
    if (condition.op === "oneOf") {
      return (value as string[]).includes(key);
    }
    if (condition.op === "notOneOf") {
      return !(value as string[]).includes(key);
    }
    if (condition.op === "contains") {
      return typeof value === "string" && textValue.toLowerCase().includes(value.toLowerCase());
    }
    if (condition.op === "doesNotContain") {
      return typeof value === "string" && !textValue.toLowerCase().includes(value.toLowerCase());
    }
    if (condition.op === "matches" && typeof value === "string" && value.length <= 256) {
      try {
        return new RegExp(value, "i").test(textValue);
      } catch {
        return false;
      }
    }

    return true;
  };

  const op: BudgetDataConditionsOp = conditionsOp === "or" ? "or" : "and";

  return categories.filter((cat) =>
    op === "or"
      ? categoryConditions.some((cond) => evaluateCondition(cat, cond))
      : categoryConditions.every((cond) => evaluateCondition(cat, cond)),
  );
}
