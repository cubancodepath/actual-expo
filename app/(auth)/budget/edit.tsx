import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  SectionList,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import Animated, {
  interpolate,
  Extrapolation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { SymbolView } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../../src/presentation/providers/ThemeProvider";
import { useCategoriesStore } from "../../../src/stores/categoriesStore";
import { useBudgetStore } from "../../../src/stores/budgetStore";
import { useUndoStore } from "../../../src/stores/undoStore";
import { Text } from "../../../src/presentation/components/atoms/Text";
import { Amount } from "../../../src/presentation/components/atoms/Amount";
import { Button } from "../../../src/presentation/components/atoms/Button";
import { SwipeableRow } from "../../../src/presentation/components/molecules/SwipeableRow";
import { GlassButton } from "../../../src/presentation/components/atoms/GlassButton";
import { parseGoalDef } from "../../../src/goals";
import { describeTemplate } from "../../../src/goals/describe";
import type { Category, CategoryGroup } from "../../../src/categories/types";

// ---------- Section types ----------

type GroupSection = {
  key: string;
  groupId: string | null;
  group: CategoryGroup | null;
  isIncome: boolean;
  data: Category[];
};


// ---------- Comparative bars: Income vs Goals (parallel) ----------

function ComparativeBars({
  income,
  goals,
  goalColor,
  incomeColor,
  trackColor,
  textColor,
  subtextColor,
  monthLabel,
}: {
  income: number;
  goals: number;
  goalColor: string;
  incomeColor: string;
  trackColor: string;
  textColor: string;
  subtextColor: string;
  monthLabel: string;
}) {
  // Both bars share the same scale: max(income, goals)
  const max = Math.max(income, goals, 1);
  const goalPct = goals / max;
  const incomePct = income / max;

  const goalProgress = useSharedValue(0);
  const incomeProgress = useSharedValue(0);

  useEffect(() => {
    goalProgress.value = 0;
    incomeProgress.value = 0;
    goalProgress.value = withDelay(200, withTiming(goalPct, { duration: 800 }));
    incomeProgress.value = withDelay(
      400,
      withTiming(incomePct, { duration: 800 }),
    );
  }, [goalPct, incomePct]);

  const goalBarStyle = useAnimatedStyle(() => ({
    width: `${Math.round(goalProgress.value * 100)}%`,
    height: "100%",
    borderRadius: 7,
    backgroundColor: goalColor,
  }));

  const incomeBarStyle = useAnimatedStyle(() => ({
    width: `${Math.round(incomeProgress.value * 100)}%`,
    height: "100%",
    borderRadius: 7,
    backgroundColor: incomeColor,
  }));

  return (
    <View style={{ gap: 10 }}>
      {/* Goals bar */}
      <View style={{ gap: 4 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text
            variant="captionSm"
            color={textColor}
            style={{ fontWeight: "600" }}
          >
            {monthLabel} Goals
          </Text>
          <Amount
            value={goals}
            variant="captionSm"
            color={subtextColor}
            weight="600"
            colored={false}
          />
        </View>
        <View
          style={{
            height: 14,
            borderRadius: 7,
            backgroundColor: trackColor,
            overflow: "hidden",
          }}
        >
          <Animated.View style={goalBarStyle} />
        </View>
      </View>

      {/* Income bar */}
      <View style={{ gap: 4 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text
            variant="captionSm"
            color={textColor}
            style={{ fontWeight: "600" }}
          >
            Monthly Income
          </Text>
          <Amount
            value={income}
            variant="captionSm"
            color={subtextColor}
            weight="600"
            colored={false}
          />
        </View>
        <View
          style={{
            height: 14,
            borderRadius: 7,
            backgroundColor: trackColor,
            overflow: "hidden",
          }}
        >
          <Animated.View style={incomeBarStyle} />
        </View>
      </View>
    </View>
  );
}

// ---------- Main screen ----------

export default function EditBudgetScreen() {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { groups, categories, load } =
    useCategoriesStore();
  const budgetData = useBudgetStore((s) => s.data);
  const budgetMonth = useBudgetStore((s) => s.month);
  const monthName = useMemo(() => {
    const [y, m] = budgetMonth.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long' });
  }, [budgetMonth]);

  useEffect(() => {
    load();
  }, []);

  // ---------- Budget overview calculations ----------

  const { totalGoals, needed, income } = useMemo(() => {
    const budgetGroups = budgetData?.groups ?? [];
    let goals = 0;
    let underfunded = 0;
    for (const g of budgetGroups) {
      if (g.is_income) continue;
      for (const cat of g.categories) {
        if (cat.goal == null || cat.goal <= 0) continue;
        goals += cat.goal;
        // How much more this category needs to reach its goal
        const funded = cat.longGoal ? cat.balance : cat.budgeted;
        const shortfall = cat.goal - funded;
        if (shortfall > 0) underfunded += shortfall;
      }
    }
    return {
      totalGoals: goals,
      needed: underfunded,
      income: budgetData?.income ?? 0,
    };
  }, [budgetData]);

  // Split expense vs income groups
  const expenseGroups = useMemo(
    () =>
      groups
        .filter((g) => !g.hidden && !g.is_income)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [groups],
  );
  const incomeGroups = useMemo(
    () =>
      groups
        .filter((g) => !g.hidden && g.is_income)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [groups],
  );

  const categoriesByGroup = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const g of [...expenseGroups, ...incomeGroups]) {
      map.set(
        g.id,
        categories
          .filter((c) => c.cat_group === g.id && !c.hidden)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      );
    }
    return map;
  }, [expenseGroups, incomeGroups, categories]);

  // Build sections for SectionList
  const sections = useMemo<GroupSection[]>(() => {
    const out: GroupSection[] = [];
    if (expenseGroups.length > 0) {
      out.push({
        key: "__expenses__",
        groupId: null,
        group: null,
        isIncome: false,
        data: [],
      });
      for (const g of expenseGroups) {
        out.push({
          key: g.id,
          groupId: g.id,
          group: g,
          isIncome: false,
          data: categoriesByGroup.get(g.id) ?? [],
        });
      }
    }
    if (incomeGroups.length > 0) {
      out.push({
        key: "__income__",
        groupId: null,
        group: null,
        isIncome: true,
        data: [],
      });
      for (const g of incomeGroups) {
        out.push({
          key: g.id,
          groupId: g.id,
          group: g,
          isIncome: true,
          data: categoriesByGroup.get(g.id) ?? [],
        });
      }
    }
    return out;
  }, [expenseGroups, incomeGroups, categoriesByGroup]);

  // ---------- Group actions ----------

  function handleGroupLongPress(group: CategoryGroup) {
    const catCount = (categoriesByGroup.get(group.id) ?? []).length;
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: group.name,
          options: ["Rename Group", "Delete Group", "Cancel"],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
        },
        (idx) => {
          if (idx === 0) {
            router.push({
              pathname: "/(auth)/budget/edit-group",
              params: { groupId: group.id },
            });
          }
          if (idx === 1) confirmDeleteGroup(group, catCount);
        },
      );
    } else {
      Alert.alert(group.name, undefined, [
        {
          text: "Rename Group",
          onPress: () =>
            router.push({
              pathname: "/(auth)/budget/edit-group",
              params: { groupId: group.id },
            }),
        },
        {
          text: "Delete Group",
          style: "destructive",
          onPress: () => confirmDeleteGroup(group, catCount),
        },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  }

  function confirmDeleteGroup(group: CategoryGroup, catCount: number) {
    const message =
      catCount > 0
        ? `This will delete "${group.name}" and its ${catCount} categor${catCount === 1 ? "y" : "ies"}. This cannot be undone.`
        : `Are you sure you want to delete "${group.name}"?`;
    Alert.alert("Delete Group", message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await useCategoriesStore.getState().deleteCategoryGroup(group.id);
          await useCategoriesStore.getState().load();
          await useBudgetStore.getState().load();
          useUndoStore.getState().showUndo('Category group deleted');
        },
      },
    ]);
  }

  // ---------- Category delete ----------

  function handleDeleteCategory(cat: Category) {
    Alert.alert(
      "Delete Category",
      `Are you sure you want to delete "${cat.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await useCategoriesStore.getState().deleteCategory(cat.id);
            await useCategoriesStore.getState().load();
            await useBudgetStore.getState().load();
            useUndoStore.getState().showUndo('Category deleted');
          },
        },
      ],
    );
  }

  // ---------- Render: Normal mode ----------

  const renderSectionHeader = useCallback(
    ({ section }: { section: GroupSection }) => {
      // Super-headers (EXPENSES / INCOME labels)
      if (!section.group) {
        return (
          <View
            style={{
              paddingHorizontal: spacing.lg,
              paddingTop: section.isIncome ? spacing.xl : spacing.md,
              paddingBottom: spacing.sm,
            }}
          >
            <Text
              variant="captionSm"
              color={colors.textSecondary}
              style={{
                textTransform: "uppercase",
                letterSpacing: 0.8,
                fontWeight: "700",
              }}
            >
              {section.isIncome ? "Income" : "Expenses"}
            </Text>
          </View>
        );
      }

      // Group label (outside card) + action buttons
      const group = section.group;
      return (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: spacing.lg * 2,
            marginTop: spacing.md,
            paddingBottom: spacing.xs,
          }}
          accessibilityRole="header"
          accessibilityLabel={`${group.name} group, ${section.data.length} categories`}
        >
          <Pressable
            onLongPress={() => handleGroupLongPress(group)}
            delayLongPress={400}
            style={{ flex: 1 }}
          >
            <Text
              variant="captionSm"
              color={colors.textSecondary}
              style={{
                textTransform: "uppercase",
                letterSpacing: 0.5,
                fontWeight: "700",
              }}
            >
              {group.name}
            </Text>
          </Pressable>
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/(auth)/budget/new-category",
                params: { groupId: group.id },
              })
            }
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Add category to ${group.name}`}
          >
            <Ionicons name="add-circle" size={18} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/(auth)/budget/edit-group",
                params: { groupId: group.id },
              })
            }
            hitSlop={12}
            style={{ marginLeft: spacing.sm }}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${group.name}`}
          >
            <Ionicons name="ellipsis-horizontal-circle-outline" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      );
    },
    [colors, spacing, br, bw, router],
  );

  const renderNormalItem = useCallback(
    ({
      item,
      index,
      section,
    }: {
      item: Category;
      index: number;
      section: GroupSection;
    }) => {
      const isLast = index === section.data.length - 1;
      const isFirst = index === 0;

      // Goal info
      const templates = parseGoalDef(item.goal_def ?? null);
      const hasGoal = templates.length > 0;
      const goalDescription = hasGoal ? describeTemplate(templates[0]) : null;

      return (
        <View
          style={{
            marginHorizontal: spacing.lg,
            borderLeftWidth: bw.thin,
            borderRightWidth: bw.thin,
            borderTopWidth: isFirst ? bw.thin : 0,
            borderBottomWidth: bw.thin,
            borderColor: colors.cardBorder,
            borderTopLeftRadius: isFirst ? br.lg : 0,
            borderTopRightRadius: isFirst ? br.lg : 0,
            borderBottomLeftRadius: isLast ? br.lg : 0,
            borderBottomRightRadius: isLast ? br.lg : 0,
            overflow: "hidden",
          }}
        >
          <SwipeableRow
            onDelete={() => handleDeleteCategory(item)}
            isFirst={isFirst}
            isLast={isLast}
          >
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/(auth)/budget/edit-category",
                  params: { categoryId: item.id },
                })
              }
              style={({ pressed }) => ({
                paddingHorizontal: spacing.lg,
                paddingTop: 12,
                paddingBottom: hasGoal ? 10 : 12,
                minHeight: 44,
                backgroundColor: pressed
                  ? colors.cardBackground + "cc"
                  : colors.cardBackground,
                borderTopWidth: isFirst ? 0 : bw.thin,
                borderTopColor: colors.divider,
              })}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}${hasGoal ? `, Target: ${goalDescription}` : ""}`}
              accessibilityHint="Edit category"
            >
              {/* Line 1: Name + Goal description */}
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
                  {item.name}
                </Text>
                {hasGoal && goalDescription && (
                  <Text
                    variant="captionSm"
                    color={colors.textSecondary}
                    numberOfLines={1}
                    style={{ flexShrink: 1, marginLeft: spacing.sm }}
                  >
                    {goalDescription}
                  </Text>
                )}
              </View>
            </Pressable>
          </SwipeableRow>
        </View>
      );
    },
    [colors, spacing, br, bw, router],
  );

  // ---------- Header ----------

  const headerBg = colors.primary;
  const headerText = "#ffffff";

  // ---------- Sticky card scroll tracking ----------

  const scrollY = useSharedValue(0);
  const [headerHeight, setHeaderHeight] = useState(0);

  const stickyTop = insets.top + 8 + 36 + spacing.sm; // safe area + back button + gap

  // Fade out header text as it scrolls up
  const headerTextFade = useAnimatedStyle(() => {
    if (headerHeight === 0) return { opacity: 1 };
    const fadeStart = headerHeight * 0.25;
    const fadeEnd = headerHeight * 0.55;
    return {
      opacity: interpolate(
        scrollY.value,
        [fadeStart, fadeEnd],
        [1, 0],
        Extrapolation.CLAMP,
      ),
    };
  });

  const headerContent = (
    <View
      onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      style={{
        backgroundColor: headerBg,
        paddingTop: insets.top + 12,
        paddingBottom: spacing.xxxl + 20,
        paddingHorizontal: spacing.lg,
        borderBottomLeftRadius: br.xl,
        borderBottomRightRadius: br.xl,
        alignItems: "center",
        gap: spacing.xs,
      }}
    >
      {/* Title + amount — fades out on scroll */}
      <Animated.View style={[{ alignItems: "center", gap: spacing.xs }, headerTextFade]}>
        <Text
          variant="captionSm"
          color="rgba(255,255,255,0.7)"
          style={{ fontWeight: "600", marginTop: spacing.xl }}
        >
          Edit Budget
        </Text>

        {/* Big amount: needed to fund all goals */}
        {totalGoals > 0 ? (
          <>
            <Amount
              value={needed}
              variant="headingLg"
              color={headerText}
              weight="700"
              colored={false}
            />
            <Text variant="captionSm" color="rgba(255,255,255,0.6)">
              {needed > 0 ? "needed to fund all goals" : "all goals fully funded"}
            </Text>
          </>
        ) : (
          <Text
            variant="body"
            color="rgba(255,255,255,0.6)"
            style={{ marginTop: spacing.sm }}
          >
            No goals configured
          </Text>
        )}
      </Animated.View>
    </View>
  );

  // Goals bar: green when income covers all goals, primary/purple otherwise
  const goalsBarColor =
    income >= totalGoals && totalGoals > 0 ? colors.positive : colors.primary;

  // Card content (reused in both inline spacer and sticky overlay)
  const cardInner = (
    <View
      style={{
        marginHorizontal: spacing.lg,
        backgroundColor: colors.cardBackground,
        borderRadius: br.lg,
        borderWidth: bw.thin,
        borderColor: colors.cardBorder,
        padding: spacing.md,
      }}
    >
      <ComparativeBars
        income={income}
        goals={totalGoals}
        goalColor={goalsBarColor}
        incomeColor={colors.textMuted}
        trackColor={colors.divider}
        textColor={colors.textSecondary}
        subtextColor={colors.textMuted}
        monthLabel={monthName}
      />
    </View>
  );

  // Card is absolute, starts at headerHeight - 32 + spacing.sm (static top).
  // translateY moves it up with scroll, clamped so it never goes above stickyTop + spacing.sm.
  const stickyPoint = headerHeight > 0 ? headerHeight - 32 - stickyTop : 0;

  const cardTranslateStyle = useAnimatedStyle(() => {
    if (headerHeight === 0) return { opacity: 0 };
    // Move up with scroll, but clamp at -stickyPoint (the max we can move up)
    const ty = -Math.min(scrollY.value, stickyPoint);
    return {
      opacity: 1,
      transform: [{ translateY: ty }],
    };
  });

  // Purple bg behind sticky card — starts fading in before sticky point for seamless handoff
  const purpleBgFade = useAnimatedStyle(() => {
    if (headerHeight === 0) return { opacity: 0 };
    const sp = headerHeight - 32 - stickyTop;
    return {
      opacity: interpolate(
        scrollY.value,
        [sp - 30, sp],
        [0, 1],
        Extrapolation.CLAMP,
      ),
    };
  });

  const actionButtons = (
    <View
      style={{
        flexDirection: "row",
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.xs,
        gap: spacing.sm,
      }}
    >
      <View style={{ flex: 1 }}>
        <Button
          title="Reorder"
          icon="reorder-three-outline"
          variant="secondary"
          size="sm"
          onPress={() => router.push("/(auth)/budget/reorder")}
          style={{ borderRadius: br.full }}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Pressable
          onPress={() => router.push("/(auth)/budget/new-group")}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingVertical: 6,
            paddingHorizontal: 12,
            minHeight: 44,
            borderRadius: br.full,
            backgroundColor: colors.buttonSecondaryBackground,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <SymbolView name="folder.badge.plus" size={17} tintColor={colors.buttonSecondaryText} />
          <Text variant="bodyLg" color={colors.buttonSecondaryText} style={{ fontSize: 13, fontWeight: "600" }}>
            Add Group
          </Text>
        </Pressable>
      </View>
    </View>
  );

  // ---------- Layout ----------

  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      <Stack.Screen options={{ headerShown: false }} />

      <SectionList
          sections={sections}
          keyExtractor={(c) => c.id}
          renderItem={renderNormalItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => { scrollY.value = e.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: 80 }}
          ListHeaderComponent={
            <>
              {headerContent}
              {totalGoals > 0 && (
                <View style={{ marginTop: -32, paddingTop: spacing.sm, opacity: 0 }}>
                  {cardInner}
                </View>
              )}
              {actionButtons}
            </>
          }
          ListEmptyComponent={
            <View style={{ alignItems: "center", marginTop: 80, gap: 8 }}>
              <SymbolView
                name="folder.badge.questionmark"
                tintColor={colors.textMuted}
                size={48}
              />
              <Text variant="bodyLg" color={colors.textSecondary}>
                No category groups yet
              </Text>
              <Text variant="bodySm" color={colors.textMuted}>
                Organize your budget by creating groups
              </Text>
            </View>
          }
        />

      {/* Purple bg behind sticky card — zIndex 5 */}
      {totalGoals > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: stickyTop + spacing.sm + 32,
              backgroundColor: headerBg,
              borderBottomLeftRadius: br.xl,
              borderBottomRightRadius: br.xl,
              zIndex: 5,
            },
            purpleBgFade,
          ]}
        />
      )}

      {/* Card overlay — static top, animated translateY — zIndex 10 */}
      {totalGoals > 0 && headerHeight > 0 && (
        <Animated.View
          pointerEvents="box-none"
          style={[
            {
              position: "absolute",
              top: headerHeight - 32 + spacing.sm,
              left: 0,
              right: 0,
              zIndex: 10,
            },
            cardTranslateStyle,
          ]}
        >
          {cardInner}
        </Animated.View>
      )}

      {/* Back button — always visible — zIndex 20 */}
      <View
        style={{
          position: "absolute",
          top: insets.top + 8,
          left: spacing.md,
          zIndex: 20,
        }}
      >
        <GlassButton icon="chevron.left" iconSize={24} onPress={() => router.back()} color={headerText} />
      </View>
    </View>
  );
}
