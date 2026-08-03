import { useEffect, useMemo } from "react";
import { envelopeBudget, sheetForMonth } from "@/core/server/spreadsheet/bindings";
import type { Spreadsheet } from "@/core/server/spreadsheet/spreadsheet";
import { ensureMonthRange } from "@/core/server/sheet";
import { currentMonth } from "@/core/shared/months";
import { useSpreadsheet, useSpreadsheetVersionWhere } from "@/hooks/useSheetValue";

/** `date` is a YYYYMMDD int; anything else falls back to the current month. */
export function monthOf(date: number): string {
  const d = String(date);
  return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}` : currentMonth();
}

/**
 * Whether `month` has cells at all.
 *
 * Asked of the built range rather than of a cell, because an unbuilt cell reads
 * as 0 exactly like a real zero balance — the value can't tell you whether it
 * means anything.
 */
export function isMonthBuilt(ss: Spreadsheet, month: string): boolean {
  const { builtStart, builtEnd } = ss.meta();
  return builtStart !== null && builtEnd !== null && month >= builtStart && month <= builtEnd;
}

/** The `leftover` cell of every id, read straight out of the sheet. */
export function readCategoryBalances(
  ss: Spreadsheet,
  sheet: string,
  categoryIds: readonly string[],
): Map<string, number> {
  const balances = new Map<string, number>();
  for (const id of categoryIds) {
    const value = ss.getValue(sheet, envelopeBudget.catBalance(id));
    balances.set(id, typeof value === "number" ? value : 0);
  }
  return balances;
}

/**
 * Available balance per category, read straight out of the loaded spreadsheet.
 *
 * The values are already in memory — the budget screen reads the very same
 * cells with {@link useSheetValue} — so this returns them during the first
 * render and the picker's amounts paint in the same frame as its names. It used
 * to go through `getBudgetMonth`, which re-ran four queries and a month build
 * before answering, and that gap is what made the money arrive after the rows.
 *
 * `undefined` means "not known yet", never "zero": a month outside the built
 * range has no cells, and an unbuilt cell reads as 0 like any other empty one.
 * Callers must not render a figure until this resolves, or every row shows a
 * convincing $0.00 first. The build is kicked off here and the value arrives
 * through the subscription below.
 *
 * Both budget types are covered by the one cell name: tracking and envelope
 * budgets both call this `leftover` (see `bindings.ts`).
 */
export function useCategoryBalances(
  date: number,
  categoryIds: readonly string[],
): Map<string, number> | undefined {
  const month = useMemo(() => monthOf(date), [date]);
  const sheet = sheetForMonth(month);
  const ss = useSpreadsheet();

  // One subscription for every category balance, rather than one per row: this
  // is the case `useSpreadsheetVersionWhere` exists for.
  const prefix = `${sheet}!leftover-`;
  const version = useSpreadsheetVersionWhere(
    useMemo(() => (name: string) => name.startsWith(prefix), [prefix]),
  );

  const isBuilt = isMonthBuilt(ss, month);

  // A transaction dated outside the built range (an old one being edited, say)
  // needs its month built before it has any balances to show. Fire and forget:
  // the cells it creates notify through the subscription above.
  useEffect(() => {
    if (isBuilt) return;
    void ensureMonthRange(month).catch(() => {});
  }, [isBuilt, month, ss]);

  return useMemo(
    () => (isBuilt ? readCategoryBalances(ss, sheet, categoryIds) : undefined),
    // `version` is the subscription's signal that a cell changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ss, sheet, categoryIds, isBuilt, version],
  );
}
