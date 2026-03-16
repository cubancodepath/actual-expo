import { useEffect, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCategoriesStore } from "@/stores/categoriesStore";
import { usePickerStore } from "@/stores/pickerStore";
import { getCategoryBalancesForMonth } from "@/budgets";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import { Text } from "@/presentation/components/atoms/Text";
import { Amount } from "@/presentation/components/atoms/Amount";
import { GlassButton } from "@/presentation/components/atoms/GlassButton";
import { currentMonth } from "@/lib/date";
import type { Theme } from "@/theme";

export default function SplitCategoryPickerScreen() {
  const { splitLineId, selectedId } = useLocalSearchParams<{
    splitLineId: string;
    selectedId?: string;
  }>();
  const router = useRouter();
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { groups, categories, load } = useCategoriesStore();
  const setSplitCategorySelection = usePickerStore((s) => s.setSplitCategorySelection);
  const [balanceMap, setBalanceMap] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (groups.length === 0) load();
    getCategoryBalancesForMonth(currentMonth())
      .then(setBalanceMap)
      .catch(() => {});
  }, []);

  function select(id: string | null, name: string) {
    setSplitCategorySelection({
      lineId: splitLineId,
      categoryId: id,
      categoryName: name,
    });
    router.back();
  }

  const noneSelected = !selectedId;

  return (
    <View style={styles.container}>
      {/* Back button — top left */}
      <View style={{ position: "absolute", top: 12, left: spacing.md, zIndex: 11 }}>
        <GlassButton icon="chevron.left" onPress={() => router.back()} />
      </View>

      {/* Title — centered */}
      <View
        style={{
          position: "absolute",
          top: 12,
          left: 0,
          right: 0,
          height: 48,
          justifyContent: "center",
          alignItems: "center",
          zIndex: 11,
          pointerEvents: "none",
        }}
      >
        <Text variant="body" color={colors.textPrimary} style={{ fontWeight: "600" }}>
          Category
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list}>
        {/* No category */}
        <View style={styles.standaloneCard}>
          <Pressable
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            onPress={() => select(null, "")}
          >
            <Text variant="body" color={colors.textMuted} style={styles.catName}>
              No category
            </Text>
            {noneSelected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
          </Pressable>
        </View>

        {groups
          .filter((g) => !g.hidden && !g.tombstone)
          .sort((a, b) => {
            if (a.is_income !== b.is_income) return a.is_income ? 1 : -1;
            return (a.sort_order ?? 0) - (b.sort_order ?? 0);
          })
          .map((g) => {
            const cats = categories
              .filter((c) => c.cat_group === g.id && !c.hidden && !c.tombstone)
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
            if (cats.length === 0) return null;
            return (
              <View key={g.id}>
                <View style={styles.sectionHeader}>
                  <Text variant="captionSm" color={colors.textMuted} style={styles.sectionText}>
                    {g.name.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.groupCard}>
                  {cats.map((c, i) => {
                    const balance = balanceMap.get(c.id);
                    const balanceColor =
                      balance === undefined
                        ? colors.textMuted
                        : balance > 0
                          ? colors.positive
                          : balance < 0
                            ? colors.negative
                            : colors.textMuted;
                    const isSelected = c.id === selectedId;
                    const isLast = i === cats.length - 1;
                    return (
                      <Pressable
                        key={c.id}
                        style={({ pressed }) => [styles.item, pressed && styles.pressed]}
                        onPress={() => select(c.id, c.name)}
                      >
                        <Text variant="body" color={colors.textPrimary} style={styles.catName}>
                          {c.name}
                        </Text>
                        {balance !== undefined && (
                          <Amount
                            value={balance}
                            variant="caption"
                            color={balanceColor}
                            style={styles.balance}
                          />
                        )}
                        {isSelected && (
                          <Ionicons name="checkmark" size={20} color={colors.primary} />
                        )}
                        {!isLast && (
                          <View
                            style={{
                              position: "absolute",
                              bottom: 0,
                              left: spacing.lg,
                              right: spacing.lg,
                              height: bw.thin,
                              backgroundColor: colors.divider,
                            }}
                          />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
  },
  list: {
    paddingTop: 72,
    paddingBottom: 40,
  },
  sectionHeader: {
    paddingHorizontal: theme.spacing.lg + theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  sectionText: {
    fontWeight: "700" as const,
    letterSpacing: 0.8,
  },
  standaloneCard: {
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth.thin,
    borderColor: theme.colors.cardBorder,
    overflow: "hidden" as const,
  },
  groupCard: {
    marginHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth.thin,
    borderColor: theme.colors.cardBorder,
    overflow: "hidden" as const,
  },
  item: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    minHeight: 44,
  },
  pressed: {
    opacity: 0.7,
  },
  catName: {
    flex: 1,
  },
  balance: {
    marginRight: theme.spacing.sm,
  },
});
