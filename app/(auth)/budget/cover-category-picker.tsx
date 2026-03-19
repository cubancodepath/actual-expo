import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { useCategories } from "@/presentation/hooks/useCategories";
import { useSheetValueNumber } from "@/presentation/hooks/useSheetValue";
import { sheetForMonth, envelopeBudget } from "@/spreadsheet/bindings";
import { getSpreadsheet } from "@/spreadsheet/instance";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { Text } from "@/presentation/components/atoms/Text";
import { Amount } from "@/presentation/components/atoms/Amount";
import { CategoryPickerList, type GroupedCategory } from "@/presentation/components";

export const TO_BUDGET_ID = "__to_budget__";

export default function CoverCategoryPickerScreen() {
  const { t } = useTranslation("budget");
  const router = useRouter();
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const { excludeIds, overspentCatId } = useLocalSearchParams<{
    excludeIds: string;
    overspentCatId: string;
  }>();
  const month = useBudgetUIStore((s) => s.month);
  const setCoverTarget = useBudgetUIStore((s) => s.setCoverTarget);
  const { categories, groups } = useCategories();
  const sheet = sheetForMonth(month);
  const toBudget = useSheetValueNumber(sheet, envelopeBudget.toBudget);

  const excludeSet = useMemo(
    () => new Set([...(excludeIds?.split(",") ?? []), overspentCatId].filter(Boolean)),
    [excludeIds, overspentCatId],
  );

  const groupedCategories = useMemo<GroupedCategory[]>(() => {
    const ss = getSpreadsheet();
    const expenseGroups = groups
      .filter((g) => !g.is_income)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    return expenseGroups
      .map((g) => {
        const groupCats = categories
          .filter((c) => c.cat_group === g.id)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

        return {
          groupId: g.id,
          groupName: g.name,
          categories: groupCats
            .filter((c) => {
              if (excludeSet.has(c.id)) return false;
              const balance = (ss.getValue(sheet, envelopeBudget.catBalance(c.id)) as number) ?? 0;
              return balance > 0;
            })
            .map((c) => ({
              id: c.id,
              name: c.name,
              balance: (ss.getValue(sheet, envelopeBudget.catBalance(c.id)) as number) ?? 0,
            })),
        };
      })
      .filter((g) => g.categories.length > 0);
  }, [categories, groups, excludeSet, sheet]);

  const alreadyAdded = excludeIds?.split(",").includes(TO_BUDGET_ID) ?? false;

  function handleSelectToBudget() {
    setCoverTarget({ catId: TO_BUDGET_ID, catName: t("readyToAssignLabel"), balance: toBudget });
    router.back();
  }

  const toBudgetCard =
    toBudget > 0 && !alreadyAdded ? (
      <View style={{ marginHorizontal: spacing.lg, marginTop: spacing.sm }}>
        <Pressable
          onPress={handleSelectToBudget}
          style={({ pressed }) => ({
            backgroundColor: colors.cardBackground,
            borderRadius: br.lg,
            borderWidth: bw.thin,
            borderColor: colors.cardBorder,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            minHeight: 48,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text variant="body" color={colors.textPrimary} style={{ flex: 1, fontWeight: "600" }}>
            {t("readyToAssignLabel")}
          </Text>
          <Amount value={toBudget} variant="bodySm" weight="600" />
        </Pressable>
      </View>
    ) : null;

  return (
    <CategoryPickerList
      title={t("coverOverspendingFrom")}
      groups={groupedCategories}
      onSelect={(cat) => {
        setCoverTarget({ catId: cat.id, catName: cat.name, balance: cat.balance });
        router.back();
      }}
      renderRight={(cat) => <Amount value={cat.balance} variant="bodySm" weight="600" />}
      emptyMessage={t("noCategoriesWithBalance")}
      listHeaderExtra={toBudgetCard}
    />
  );
}
