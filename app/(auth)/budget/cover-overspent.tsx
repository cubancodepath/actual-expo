import { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { useCategories } from "@/presentation/hooks/useCategories";
import { sheetForMonth, envelopeBudget } from "@core/spreadsheet/bindings";
import { getSpreadsheet } from "@core/spreadsheet/instance";
import { useSpreadsheetVersion } from "@/presentation/hooks/useSheetValue";
import { Text } from "@/presentation/components/atoms/Text";
import { Amount } from "@/presentation/components/atoms/Amount";
import { Button } from "@/presentation/components/atoms/Button";

type OverspentCategory = {
  id: string;
  name: string;
  balance: number;
  groupName: string;
};

export default function CoverOverspentScreen() {
  const { t } = useTranslation("budget");
  const { colors, spacing, borderRadius: br } = useTheme();
  const router = useRouter();
  const month = useBudgetUIStore((s) => s.month);
  const { categories, groups } = useCategories();
  const sheet = sheetForMonth(month);
  const ssVersion = useSpreadsheetVersion();

  const overspentCategories = useMemo<OverspentCategory[]>(() => {
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
  }, [categories, groups, sheet, ssVersion]);

  const pillBg = colors.cardBackground;
  const pillBorder = colors.cardBorder;
  const amountBadgeBg = colors.budgetOverspentBg;
  const amountBadgeColor = colors.budgetOverspent;

  function handleSelect(cat: OverspentCategory) {
    router.push({
      pathname: "/(auth)/budget/cover-source",
      params: { catId: cat.id, catName: cat.name, balance: String(cat.balance) },
    });
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.pageBackground }}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Button
              icon="close"
              buttonStyle="borderless"
              color={colors.headerText}
              onPress={() => router.back()}
            />
          ),
        }}
      />

      <Text
        variant="bodySm"
        color={colors.textSecondary}
        style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}
      >
        {t("selectCategoryTocover")}
      </Text>

      <View
        style={{
          paddingHorizontal: spacing.lg,
          gap: spacing.sm,
        }}
      >
        {overspentCategories.map((cat) => (
          <Pressable
            key={cat.id}
            onPress={() => handleSelect(cat)}
            style={({ pressed }) => [
              {
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                minHeight: 44,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: br.full,
                backgroundColor: pillBg,
                borderWidth: 1,
                borderColor: pillBorder,
              },
              pressed && { opacity: 0.72 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t("coverOverspendingAccessibility", { name: cat.name })}
          >
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <Text variant="body" color={colors.textPrimary} numberOfLines={1}>
                {cat.name}
              </Text>
            </View>

            <View
              style={{
                backgroundColor: amountBadgeBg,
                borderRadius: br.full,
                paddingHorizontal: 10,
                paddingVertical: 3,
              }}
            >
              <Amount
                value={cat.balance}
                variant="captionSm"
                color={amountBadgeColor}
                weight="600"
              />
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
