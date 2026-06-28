import { useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { useCategories } from "@/features/budget/hooks/useCategories";
import { sheetForMonth, envelopeBudget } from "@/core/domain/spreadsheet/bindings";
import { getSpreadsheet } from "@/core/domain/spreadsheet/instance";
import { Amount } from "@/design-system/atoms/Amount";
import { CategoryPickerList, type GroupedCategory } from "@/design-system";

export default function MoveCategoryPickerScreen() {
  const { t } = useTranslation("budget");
  const router = useRouter();
  const { excludeIds, moveCatId, direction } = useLocalSearchParams<{
    excludeIds: string;
    moveCatId: string;
    direction: string;
  }>();
  const month = useBudgetUIStore((s) => s.month);
  const setCoverTarget = useBudgetUIStore((s) => s.setCoverTarget);
  const { categories, groups } = useCategories();
  const sheet = sheetForMonth(month);

  const excludeSet = useMemo(
    () => new Set([...(excludeIds?.split(",") ?? []), moveCatId].filter(Boolean)),
    [excludeIds, moveCatId],
  );

  const groupedCategories = useMemo<GroupedCategory[]>(() => {
    const ss = getSpreadsheet();
    const expenseGroups = groups
      .filter((g) => !g.is_income)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    return expenseGroups
      .map((g) => {
        const groupCats = categories
          .filter((c) => c.cat_group === g.id && !excludeSet.has(c.id))
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

        return {
          groupId: g.id,
          groupName: g.name,
          categories: groupCats.map((c) => ({
            id: c.id,
            name: c.name,
            balance: (ss.getValue(sheet, envelopeBudget.catBalance(c.id)) as number) ?? 0,
          })),
        };
      })
      .filter((g) => g.categories.length > 0);
  }, [categories, groups, excludeSet, sheet]);

  return (
    <CategoryPickerList
      title={direction === "to" ? t("moveFrom") : t("moveTo")}
      groups={groupedCategories}
      onSelect={(cat) => {
        setCoverTarget({ catId: cat.id, catName: cat.name, balance: cat.balance });
        router.back();
      }}
      renderRight={(cat) => <Amount value={cat.balance} variant="bodySm" weight="600" />}
    />
  );
}
