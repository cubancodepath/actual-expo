import { useMemo } from "react";
import { Alert, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { useCategories } from "@/presentation/hooks/useCategories";
import { sheetForMonth, envelopeBudget } from "@core/spreadsheet/bindings";
import { getSpreadsheet } from "@core/spreadsheet/instance";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { Amount } from "@/presentation/components/atoms/Amount";
import { Text } from "@/presentation/components/atoms/Text";
import { GlassButton } from "@/presentation/components/atoms/GlassButton";
import { CategoryPickerList, type GroupedCategory } from "@/presentation/components";

export default function DeleteCategoryPickerScreen() {
  const { t } = useTranslation("budget");
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { excludeIds, moveCatId } = useLocalSearchParams<{
    excludeIds: string;
    moveCatId: string;
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
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={{ paddingTop: 12, paddingBottom: spacing.sm }}>
        <View
          style={{
            height: 48,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: spacing.md,
          }}
        >
          <GlassButton icon="close" onPress={() => router.back()} />
          <View style={{ flex: 1, alignItems: "center", marginRight: 48 }}>
            <Text variant="body" color={colors.textPrimary} style={{ fontWeight: "600" }}>
              {t("moveTransactionsTo")}
            </Text>
          </View>
        </View>
      </View>

      {/* Picker list */}
      <CategoryPickerList
        groups={groupedCategories}
        autoFocusSearch
        onSelect={(cat) => {
          Alert.alert(t("confirmDeleteTitle"), t("confirmDeleteMessage", { name: cat.name }), [
            { text: t("cancel"), style: "cancel" },
            {
              text: t("delete"),
              style: "destructive",
              onPress: () => {
                setCoverTarget({ catId: cat.id, catName: cat.name, balance: cat.balance });
                router.back();
              },
            },
          ]);
        }}
        renderRight={(cat) => <Amount value={cat.balance} variant="bodySm" weight="600" />}
      />
    </View>
  );
}
