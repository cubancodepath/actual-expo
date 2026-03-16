import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useBudgetStore } from "../../../src/stores/budgetStore";
import { useTheme } from "../../../src/presentation/providers/ThemeProvider";
import { Text } from "../../../src/presentation/components/atoms/Text";
import { Amount } from "../../../src/presentation/components/atoms/Amount";
import { CategoryPickerList, type GroupedCategory } from "../../../src/presentation/components";

export const TO_BUDGET_ID = "__to_budget__";

export default function CoverCategoryPickerScreen() {
  const { t } = useTranslation("budget");
  const router = useRouter();
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const { excludeIds, overspentCatId } = useLocalSearchParams<{
    excludeIds: string;
    overspentCatId: string;
  }>();
  const data = useBudgetStore((s) => s.data);
  const setCoverTarget = useBudgetStore((s) => s.setCoverTarget);

  const toBudget = data?.toBudget ?? 0;

  const excludeSet = useMemo(
    () => new Set([...(excludeIds?.split(",") ?? []), overspentCatId].filter(Boolean)),
    [excludeIds, overspentCatId],
  );

  const groups = useMemo<GroupedCategory[]>(() => {
    if (!data) return [];
    return data.groups
      .filter((g) => !g.is_income)
      .map((g) => ({
        groupId: g.id,
        groupName: g.name,
        categories: g.categories
          .filter((c) => !excludeSet.has(c.id) && c.balance > 0)
          .map((c) => ({ id: c.id, name: c.name, balance: c.balance })),
      }))
      .filter((g) => g.categories.length > 0);
  }, [data, excludeSet]);

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
      groups={groups}
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
