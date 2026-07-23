import { useMemo } from "react";
import { useCategories } from "@/lib/hooks/useCategories";
import { envelopeBudget } from "@/core/server/spreadsheet/bindings";
import { getSpreadsheet } from "@/core/server/spreadsheet/globals";
import { useSpreadsheetVersionWhere } from "@/hooks/useSheetValue";

/**
 * Matches resolved cell names (`${sheet}!${localName}`) for the two cell
 * kinds this hook scans: category balance (`leftover-<id>`) and carryover
 * flag (`carryover-<id>`). Verified format via bindings.ts (`field("leftover")`,
 * `field("carryover")`) and spreadsheet.ts's `resolveName` (`${sheet}!${name}`).
 */
export function makeCategoryCellMatcher(sheet: string): (name: string) => boolean {
  const prefix = `${sheet}!`;
  return (name: string) => {
    if (!name.startsWith(prefix)) return false;
    const localName = name.slice(prefix.length);
    return localName.startsWith("leftover-") || localName.startsWith("carryover-");
  };
}

export interface OverspentCategory {
  id: string;
  name: string;
  /** Negative available balance in cents. */
  balance: number;
  groupName: string;
}

/**
 * The expense categories overspent this month — a negative available balance,
 * excluding categories set to carry the overspending forward. Ordered by group
 * then category sort order. Reads the spreadsheet imperatively (one pass) and
 * recomputes only when a `leftover-`/`carryover-` cell on this sheet changes
 * (see {@link makeCategoryCellMatcher}), instead of on every spreadsheet
 * computation.
 */
export function useOverspentCategories(sheet: string): OverspentCategory[] {
  const { categories, groups } = useCategories();
  const ssVersion = useSpreadsheetVersionWhere(
    useMemo(() => makeCategoryCellMatcher(sheet), [sheet]),
  );

  return useMemo(() => {
    const ss = getSpreadsheet();
    const result: OverspentCategory[] = [];
    const expenseGroups = groups
      .filter((g) => !g.is_income)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    for (const g of expenseGroups) {
      const groupCats = categories
        .filter((c) => c.cat_group === g.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

      for (const c of groupCats) {
        const balance = (ss.getValue(sheet, envelopeBudget.catBalance(c.id)) as number) ?? 0;
        const carryoverValue = ss.getValue(sheet, envelopeBudget.catCarryover(c.id));
        const carryover = carryoverValue === true || carryoverValue === 1;
        if (balance < 0 && !carryover) {
          result.push({ id: c.id, name: c.name, balance, groupName: g.name });
        }
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, groups, sheet, ssVersion]);
}
