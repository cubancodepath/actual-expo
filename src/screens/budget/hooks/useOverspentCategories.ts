import { useMemo } from "react";
import { useCategories } from "@/hooks/useCategories";
import { envelopeBudget } from "@/core/domain/spreadsheet/bindings";
import { getSpreadsheet } from "@/core/domain/spreadsheet/instance";
import { useSpreadsheetVersion } from "@/hooks/useSheetValue";

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
 * recomputes on any cell change via {@link useSpreadsheetVersion}.
 */
export function useOverspentCategories(sheet: string): OverspentCategory[] {
  const { categories, groups } = useCategories();
  const ssVersion = useSpreadsheetVersion();

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
        const carryover =
          ss.getValue(sheet, envelopeBudget.catCarryover(c.id)) === true ||
          ss.getValue(sheet, envelopeBudget.catCarryover(c.id)) === 1;
        if (balance < 0 && !carryover) {
          result.push({ id: c.id, name: c.name, balance, groupName: g.name });
        }
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, groups, sheet, ssVersion]);
}
