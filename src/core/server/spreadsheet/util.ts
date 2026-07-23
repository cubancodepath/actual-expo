/**
 * Helpers shared between the envelope (envelope.ts) and tracking/report
 * (tracking.ts) budget formula sets — the parts that don't differ between
 * budget types (upstream keeps this one in server/budget/base.ts).
 */

import type { Spreadsheet, CellValue } from "@/core/server/spreadsheet/spreadsheet";
import { sheetForMonth, envelopeBudget } from "@/core/server/spreadsheet/bindings";
import { firstSync, first } from "@/core/db";
import { monthToInt, currentMonth, intToStr, addMonths } from "@/core/shared/months";
import { ALIVE_TX_FILTER } from "@/core/db/filters";
import type { Category } from "@/core/types/models";

export function num(v: CellValue): number {
  return typeof v === "number" ? v : 0;
}

function monthRange(start: string, end: string): string[] {
  const months: string[] = [];
  let current = start;
  while (current <= end) {
    months.push(current);
    current = addMonths(current, 1);
  }
  return months;
}

/**
 * The [start, end] month range to build budget cells for, and the list of
 * months in between. Independent of budget type (envelope vs tracking) —
 * based purely on transaction history and today's date.
 */
export async function getBudgetRange(): Promise<{
  start: string;
  end: string;
  months: string[];
}> {
  const row = await first<{ d: number | null }>(
    "SELECT MIN(date) as d FROM transactions WHERE tombstone = 0",
  );

  const today = currentMonth();
  let startMonth: string;

  if (row?.d) {
    const dateStr = intToStr(row.d);
    startMonth = dateStr ? addMonths(dateStr.slice(0, 7), -3) : addMonths(today, -3);
  } else {
    startMonth = addMonths(today, -3);
  }

  // On mobile we default to a tighter initial range (3 before → 3 ahead)
  // to reduce startup time. Cells for earlier/later months are created
  // on demand via ensureMonthRange() when the user navigates to them.
  const endMonth = addMonths(today, 3);

  return {
    start: startMonth,
    end: endMonth,
    months: monthRange(startMonth, endMonth),
  };
}

/**
 * Per-category "sum-amount-<id>" SQL cell — total spent/received in the
 * month, for ALL categories (income + expense). Identical query and cell
 * name in both envelope and tracking mode (upstream: budget/base.ts
 * createCategory). Must stay a leaf cell (dependencies: []) — it's the one
 * triggerBudgetChanges marks dirty directly via the "sum-amount-" prefix
 * index entry (see spreadsheet.ts's QUERYABLE_PREFIXES).
 */
export function createSpentCells(ss: Spreadsheet, month: string, categories: Category[]): void {
  const sheet = sheetForMonth(month);
  const monthInt = monthToInt(month);
  const startDate = monthInt * 100 + 1;
  const endDate = monthInt * 100 + 31;

  for (const cat of categories) {
    ss.createDynamic(sheet, envelopeBudget.catSpent(cat.id), {
      dependencies: [],
      run: () => {
        const row = firstSync<{ total: number }>(
          `SELECT SUM(t.amount) AS total
           FROM transactions t
           LEFT JOIN category_mapping cm ON cm.id = t.category
           LEFT JOIN accounts a ON a.id = t.acct
           WHERE ${ALIVE_TX_FILTER} AND t.date >= ? AND t.date <= ? AND a.offbudget = 0
             AND COALESCE(cm.transferId, t.category) = ?`,
          [startDate, endDate, cat.id],
        );
        return row?.total ?? 0;
      },
    });
  }
}
