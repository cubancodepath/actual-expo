import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCategories } from "@/presentation/hooks/useCategories";
import { Icon } from "@/presentation/components/atoms/Icon";
import { AnimatedCheckmark } from "@/presentation/components/atoms/AnimatedCheckmark";
import { usePickerStore } from "@/stores/pickerStore";
import { getCategoryBalancesForMonth } from "@/budgets";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { Text } from "@/presentation/components/atoms/Text";
import { Amount } from "@/presentation/components/atoms/Amount";
import { GlassButton } from "@/presentation/components/atoms/GlassButton";
import { CategoryPickerList, type GroupedCategory } from "@/presentation/components";
import { currentMonth } from "@/lib/date";

export default function CategoryPickerScreen() {
  const { month, selectedId, amount, payeeId, payeeName, transactionId, hideSplit } =
    useLocalSearchParams<{
      month?: string;
      selectedId?: string;
      amount?: string;
      payeeId?: string;
      payeeName?: string;
      transactionId?: string;
      hideSplit?: string;
    }>();
  const router = useRouter();
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const { groups, categories } = useCategories();
  const setCategory = usePickerStore((s) => s.setCategory);
  const [balanceMap, setBalanceMap] = useState<Map<string, number>>(new Map());

  const displayMonth = month || currentMonth();

  useEffect(() => {
    getCategoryBalancesForMonth(displayMonth)
      .then(setBalanceMap)
      .catch(() => {});
  }, [displayMonth]);

  function select(id: string | null, name: string) {
    setCategory({ id, name });
    router.back();
  }

  const noneSelected = !selectedId;

  const groupedCategories = useMemo<GroupedCategory[]>(() => {
    return groups
      .filter((g) => !g.hidden && !g.tombstone)
      .sort((a, b) => {
        if (a.is_income !== b.is_income) return a.is_income ? 1 : -1;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      })
      .map((g) => {
        const cats = categories
          .filter((c) => c.cat_group === g.id && !c.hidden && !c.tombstone)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((c) => ({ id: c.id, name: c.name, balance: balanceMap.get(c.id) ?? 0 }));
        return { groupId: g.id, groupName: g.name, categories: cats };
      })
      .filter((g) => g.categories.length > 0);
  }, [groups, categories, balanceMap]);

  function handleSplit() {
    router.push({
      pathname: "./split",
      params: {
        amount: amount ?? "0",
        payeeId: payeeId ?? "",
        payeeName: payeeName ?? "",
        transactionId: transactionId ?? "",
        fromCategoryPicker: "1",
      },
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      {/* Custom header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.lg,
          paddingBottom: spacing.sm,
          backgroundColor: colors.pageBackground,
        }}
      >
        <GlassButton icon="chevronBack" onPress={() => router.back()} />
        <Text variant="headingSm" color={colors.headerText}>
          Category
        </Text>
        {hideSplit === "1" ? (
          <View style={{ width: 48 }} />
        ) : (
          <GlassButton label="Split" onPress={handleSplit} />
        )}
      </View>
      <CategoryPickerList
        groups={groupedCategories}
        onSelect={(cat) => select(cat.id, cat.name)}
        autoFocusSearch
        searchPlaceholder="Search categories…"
        listHeaderExtra={
          <View
            style={{
              marginHorizontal: spacing.lg,
              marginTop: spacing.lg,
              backgroundColor: colors.cardBackground,
              borderRadius: br.lg,
              borderWidth: bw.thin,
              borderColor: colors.cardBorder,
              overflow: "hidden",
            }}
          >
            <Pressable
              style={({ pressed }) => [
                {
                  flexDirection: "row" as const,
                  alignItems: "center" as const,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                  minHeight: 44,
                },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => select(null, "")}
            >
              <Text variant="body" color={colors.textMuted} style={{ flex: 1 }}>
                No category
              </Text>
              <View style={{ width: 20, alignItems: "center" }}>
                {noneSelected && <AnimatedCheckmark color={colors.primary} />}
              </View>
            </Pressable>
          </View>
        }
        renderRight={(cat) => {
          const balance = balanceMap.get(cat.id);
          const balanceColor =
            balance === undefined
              ? colors.textMuted
              : balance > 0
                ? colors.positive
                : balance < 0
                  ? colors.negative
                  : colors.textMuted;
          const isSelected = cat.id === selectedId;
          return (
            <>
              {balance !== undefined && (
                <Amount
                  value={balance}
                  variant="caption"
                  color={balanceColor}
                  style={{ marginRight: spacing.sm }}
                />
              )}
              <View style={{ width: 20, alignItems: "center" }}>
                {isSelected && <AnimatedCheckmark color={colors.primary} />}
              </View>
            </>
          );
        }}
      />
    </View>
  );
}
