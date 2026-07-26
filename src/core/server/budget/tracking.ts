/**
 * Budget formula definitions for the tracking/report budgeting system.
 *
 * Ported from Actual Budget's server/budget/tracking.ts. Unlike envelope
 * budgeting, tracking mode has no to-budget/buffered/from-last-month pool —
 * each category just tracks budgeted vs. actual, and the summary reports
 * whether the month as a whole was "saved" (income minus spending).
 *
 * Same cell-creation contract as envelope.ts: `createBudgetCells` is called
 * once per month (idempotent — createDynamic no-ops if a cell already
 * exists), wrapped by the caller in startTransaction/endTransaction.
 */

import type { Spreadsheet } from "@/core/server/spreadsheet/spreadsheet";
import { sheetForMonth, trackingBudget } from "@/core/server/spreadsheet/bindings";
import { firstSync } from "@/core/server/db";
import { monthToInt, addMonths } from "@/core/shared/months";
import { getCategories, getCategoryGroups } from "@/core/server/budget";
import type { Category, CategoryGroup } from "@/core/types/models";
import { safeNumber } from "@/core/shared/util";
import { num, createSpentCells, getBudgetRange } from "@/core/server/budget/base";
import { warmReflectBudget } from "@/core/server/spreadsheet/warm-cache";

/**
 * The per-category cells of one month. Split out of the build loop so
 * `handleCategoryChange` can create exactly these for one new category instead
 * of rebuilding the month.
 */
export function createCategory(ss: Spreadsheet, cat: Category, month: string): void {
  const sheet = sheetForMonth(month);
  const prevSheet = sheetForMonth(addMonths(month, -1));
  const monthInt = monthToInt(month);

  ss.createDynamic(sheet, trackingBudget.catBudgeted(cat.id), {
    dependencies: [],
    run: () => {
      // Batch path during init/ensureMonthRange (see warm-cache.ts).
      const cached = warmReflectBudget(monthInt, cat.id);
      if (cached !== undefined) return cached?.amount ?? 0;

      const row = firstSync<{ amount: number }>(
        "SELECT amount FROM reflect_budgets WHERE month = ? AND category = ?",
        [monthInt, cat.id],
      );
      return row?.amount ?? 0;
    },
  });

  ss.createDynamic(sheet, trackingBudget.catCarryover(cat.id), {
    dependencies: [],
    run: () => {
      const cached = warmReflectBudget(monthInt, cat.id);
      if (cached !== undefined) return cached?.carryover === 1;

      const row = firstSync<{ carryover: number }>(
        "SELECT carryover FROM reflect_budgets WHERE month = ? AND category = ?",
        [monthInt, cat.id],
      );
      return row?.carryover === 1;
    },
  });

  ss.createDynamic(sheet, trackingBudget.catBalance(cat.id), {
    dependencies: [
      trackingBudget.catBudgeted(cat.id),
      trackingBudget.catSpent(cat.id),
      `${prevSheet}!${trackingBudget.catCarryover(cat.id)}`,
      `${prevSheet}!${trackingBudget.catBalance(cat.id)}`,
    ],
    run: (budgetedVal, spentVal, prevCarryoverVal, prevBalance) => {
      const budgeted = num(budgetedVal);
      const spent = num(spentVal);
      const prevCo = prevCarryoverVal === true || prevCarryoverVal === 1;
      const carryIn = prevCo ? num(prevBalance) : 0;
      return cat.is_income
        ? safeNumber(budgeted - spent + carryIn)
        : safeNumber(budgeted + spent + carryIn);
    },
  });

  ss.createDynamic(sheet, trackingBudget.spentWithCarryover(cat.id), {
    // Upstream forces this one to recompute rather than trust a restored
    // value (its own comment there asks why). Costs nothing to honour — it's
    // a pure formula over cells that are themselves restored — so keep the
    // parity rather than guess that upstream's caution is unfounded.
    refresh: true,
    dependencies: [
      trackingBudget.catBudgeted(cat.id),
      trackingBudget.catSpent(cat.id),
      trackingBudget.catCarryover(cat.id),
    ],
    run: (budgetedVal, spentVal, carryoverVal) => {
      const carryover = carryoverVal === true || carryoverVal === 1;
      const spent = num(spentVal);
      return carryover ? Math.max(0, safeNumber(num(budgetedVal) + spent)) : spent;
    },
  });
}

export async function createBudgetCells(
  ss: Spreadsheet,
  month: string,
  categories: Category[],
  groups: CategoryGroup[],
): Promise<void> {
  const sheet = sheetForMonth(month);

  const incomeGroup = groups.find((g) => g.is_income);
  const expenseGroups = groups.filter((g) => !g.is_income && !g.hidden);

  // ── Per-category: catSpent for ALL categories (shared with envelope) ──
  createSpentCells(ss, month, categories);

  // ── Per-category: budget/carryover/balance/spentWithCarryover for ALL categories ──
  for (const cat of categories) {
    createCategory(ss, cat, month);
  }

  // ── Per-group: groupSpent/groupBudgeted/groupBalance for ALL groups
  //    (non-hidden categories only, matches upstream) ──
  for (const group of groups) {
    const groupCats = categories.filter((c) => c.group === group.id && !c.hidden);

    ss.createDynamic(sheet, trackingBudget.groupSpent(group.id), {
      dependencies: groupCats.map((c) => trackingBudget.catSpent(c.id)),
      run: (...vals) => safeNumber(vals.reduce((sum: number, v) => sum + num(v), 0)),
    });

    ss.createDynamic(sheet, trackingBudget.groupBudgeted(group.id), {
      dependencies: groupCats.map((c) => trackingBudget.catBudgeted(c.id)),
      run: (...vals) => safeNumber(vals.reduce((sum: number, v) => sum + num(v), 0)),
    });

    ss.createDynamic(sheet, trackingBudget.groupBalance(group.id), {
      dependencies: groupCats.map((c) => trackingBudget.catBalance(c.id)),
      run: (...vals) => safeNumber(vals.reduce((sum: number, v) => sum + num(v), 0)),
    });
  }

  // ── Summary cells ──
  ss.createDynamic(sheet, trackingBudget.totalBudgeted, {
    dependencies: expenseGroups.map((g) => trackingBudget.groupBudgeted(g.id)),
    // NOT negated, unlike envelope's total-budgeted — tracking mode has no
    // to-budget pool to subtract from (upstream: budget/tracking.ts).
    run: (...vals) => safeNumber(vals.reduce((sum: number, v) => sum + num(v), 0)),
  });

  ss.createDynamic(sheet, trackingBudget.totalSpent, {
    refresh: true, // same upstream parity as spentWithCarryover above
    dependencies: expenseGroups.map((g) => trackingBudget.groupSpent(g.id)),
    run: (...vals) => safeNumber(vals.reduce((sum: number, v) => sum + num(v), 0)),
  });

  if (incomeGroup) {
    ss.createDynamic(sheet, trackingBudget.totalIncome, {
      dependencies: [trackingBudget.groupSpent(incomeGroup.id)],
      run: (amount) => num(amount),
    });
    ss.createDynamic(sheet, trackingBudget.totalBudgetIncome, {
      dependencies: [trackingBudget.groupBudgeted(incomeGroup.id)],
      run: (amount) => num(amount),
    });
  } else {
    ss.createStatic(sheet, trackingBudget.totalIncome, 0);
    ss.createStatic(sheet, trackingBudget.totalBudgetIncome, 0);
  }

  ss.createDynamic(sheet, trackingBudget.totalLeftover, {
    dependencies: expenseGroups.map((g) => trackingBudget.groupBalance(g.id)),
    run: (...vals) => safeNumber(vals.reduce((sum: number, v) => sum + num(v), 0)),
  });

  ss.createDynamic(sheet, trackingBudget.totalSaved, {
    dependencies: [trackingBudget.totalBudgetIncome, trackingBudget.totalBudgeted],
    // Not safeNumber-wrapped in upstream either — a plain difference of two
    // already-safe integer cells.
    run: (income, budgeted) => num(income) - num(budgeted),
  });

  ss.createDynamic(sheet, trackingBudget.realSaved, {
    dependencies: [trackingBudget.totalIncome, trackingBudget.totalSpent],
    run: (income, spent) => safeNumber(num(income) - -num(spent)),
  });
}

/**
 * Create tracking budget cells for ALL months in the budget range.
 * Mirrors envelope.ts's createAllBudgetCells.
 */
export async function createAllBudgetCells(
  ss: Spreadsheet,
): Promise<{ start: string; end: string }> {
  const { start, end, months } = await getBudgetRange();
  const [cats, groups] = await Promise.all([getCategories(), getCategoryGroups()]);

  ss.startTransaction();
  for (const month of months) {
    await createBudgetCells(ss, month, cats, groups);
  }
  ss.endTransaction();

  return { start, end };
}

/** The three group aggregates a category feeds, paired with its own input cell. */
function groupEdges(groupId: string, catId: string): [string, string][] {
  return [
    [trackingBudget.groupSpent(groupId), trackingBudget.catSpent(catId)],
    [trackingBudget.groupBudgeted(groupId), trackingBudget.catBudgeted(catId)],
    [trackingBudget.groupBalance(groupId), trackingBudget.catBalance(catId)],
  ];
}

function addDeps(ss: Spreadsheet, sheet: string, groupId: string, catId: string): void {
  for (const [aggregate, input] of groupEdges(groupId, catId)) {
    ss.addDependencies(sheet, aggregate, [input]);
  }
}

function removeDeps(ss: Spreadsheet, sheet: string, groupId: string, catId: string): void {
  for (const [aggregate, input] of groupEdges(groupId, catId)) {
    ss.removeDependencies(sheet, aggregate, [input]);
  }
}

/**
 * Tracking's version of the incremental category handler. Two differences from
 * envelope, both upstream's: there's no `bufferedAuto`/`lastMonthOverspent` to
 * wire, and hiding a category DOES take it out of its group's totals — tracking
 * builds its groups from non-hidden categories only.
 */
export function handleCategoryChange(
  ss: Spreadsheet,
  months: string[],
  oldValue: { cat_group?: unknown; tombstone?: unknown; hidden?: unknown } | undefined,
  newValue: Category & { tombstone?: boolean },
): void {
  const id = newValue.id;
  const wasAlive = oldValue ? oldValue.tombstone === 0 || oldValue.tombstone === false : false;
  const isAlive = !newValue.tombstone;
  const oldGroup = typeof oldValue?.cat_group === "string" ? oldValue.cat_group : null;
  const wasHidden = oldValue?.hidden === 1 || oldValue?.hidden === true;

  if (oldValue && wasAlive && !isAlive) {
    for (const month of months) {
      removeDeps(ss, sheetForMonth(month), newValue.group, id);
    }
    return;
  }

  if (isAlive && (!oldValue || !wasAlive)) {
    for (const month of months) {
      createCategory(ss, newValue, month);
      if (!newValue.hidden) addDeps(ss, sheetForMonth(month), newValue.group, id);
    }
    return;
  }

  if (oldGroup && oldGroup !== newValue.group) {
    for (const month of months) {
      const sheet = sheetForMonth(month);
      removeDeps(ss, sheet, oldGroup, id);
      addDeps(ss, sheet, newValue.group, id);
    }
    return;
  }

  if (oldValue && wasHidden !== Boolean(newValue.hidden)) {
    for (const month of months) {
      const sheet = sheetForMonth(month);
      if (newValue.hidden) removeDeps(ss, sheet, newValue.group, id);
      else addDeps(ss, sheet, newValue.group, id);
    }
  }
}

/** The month totals a group feeds, paired with the group cell that feeds each. */
function monthEdges(groupId: string): [string, string][] {
  return [
    [trackingBudget.totalBudgeted, trackingBudget.groupBudgeted(groupId)],
    [trackingBudget.totalSpent, trackingBudget.groupSpent(groupId)],
    [trackingBudget.totalLeftover, trackingBudget.groupBalance(groupId)],
  ];
}

/**
 * Tracking's group handler. Unlike envelope it also has a `hidden` branch —
 * tracking builds its totals from non-hidden groups only.
 */
export function handleCategoryGroupChange(
  ss: Spreadsheet,
  months: string[],
  oldValue: { tombstone?: unknown; hidden?: unknown } | undefined,
  newValue: CategoryGroup & { tombstone?: boolean },
): void {
  if (newValue.is_income) return;

  const wasAlive = oldValue ? oldValue.tombstone === 0 || oldValue.tombstone === false : false;
  const isAlive = !newValue.tombstone;
  const wasHidden = oldValue?.hidden === 1 || oldValue?.hidden === true;

  const wire = (month: string, add: boolean) => {
    const sheet = sheetForMonth(month);
    for (const [total, input] of monthEdges(newValue.id)) {
      if (add) ss.addDependencies(sheet, total, [input]);
      else ss.removeDependencies(sheet, total, [input]);
    }
  };

  if (oldValue && wasAlive && !isAlive) {
    for (const month of months) wire(month, false);
    return;
  }

  if (isAlive && (!oldValue || !wasAlive)) {
    for (const month of months) {
      const sheet = sheetForMonth(month);
      for (const cell of [
        trackingBudget.groupSpent(newValue.id),
        trackingBudget.groupBudgeted(newValue.id),
        trackingBudget.groupBalance(newValue.id),
      ]) {
        ss.createDynamic(sheet, cell, {
          dependencies: [],
          run: (...vals) => safeNumber(vals.reduce((sum: number, v) => sum + num(v), 0)),
        });
      }
      if (!newValue.hidden) wire(month, true);
    }
    return;
  }

  if (oldValue && wasHidden !== Boolean(newValue.hidden)) {
    for (const month of months) wire(month, !newValue.hidden);
  }
}
