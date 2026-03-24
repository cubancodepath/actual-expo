import { useMemo } from "react";
import { q } from "@core/queries";
import { useLiveQuery } from "../useQuery";
import { useCategoryList } from "../useCategories";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { useTheme } from "@/presentation/providers/ThemeProvider";

/** Month boundaries as YYYYMMDD integers. */
function monthRange(month: string): { start: number; end: number } {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    start: y * 10000 + m * 100 + 1,
    end: y * 10000 + m * 100 + lastDay,
  };
}

type CategorySpend = {
  category: string;
  amount: number;
};

export type SpendingCategory = {
  id: string;
  name: string;
  amount: number;
  color: string;
  percent: number;
};

/**
 * Top spending categories for the selected month.
 * Returns sorted by absolute spend, top 5.
 */
export function useSpendingByCategory() {
  const month = useBudgetUIStore((s) => s.month);
  const categoryList = useCategoryList();
  const { colors } = useTheme();
  const chartColors = colors.chart;
  const { start, end } = useMemo(() => monthRange(month), [month]);

  const { data: spendData, isLoading } = useLiveQuery<CategorySpend>(
    () =>
      q("transactions")
        .filter({
          date: { $gte: start, $lte: end },
          amount: { $lt: 0 },
          transferred_id: null,
        })
        .groupBy("category")
        .select(["category", { amount: { $sum: "$amount" } }]),
    [start, end],
  );

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categoryList) {
      map.set(cat.id, cat.name);
    }
    return map;
  }, [categoryList]);

  const result = useMemo(() => {
    if (!spendData || spendData.length === 0) {
      return { categories: [] as SpendingCategory[], total: 0 };
    }

    const sorted = [...spendData]
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 5);

    const total = sorted.reduce((sum, s) => sum + Math.abs(s.amount), 0);

    const categories: SpendingCategory[] = sorted.map((s, i) => ({
      id: s.category,
      name: categoryMap.get(s.category) ?? "Uncategorized",
      amount: s.amount,
      color: chartColors[i % chartColors.length],
      percent: total > 0 ? Math.round((Math.abs(s.amount) / total) * 100) : 0,
    }));

    return { categories, total };
  }, [spendData, categoryMap, chartColors]);

  return { ...result, isLoading };
}
