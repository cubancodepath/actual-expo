import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionSheetIOS, Alert, Platform, Pressable, SectionList, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Animated, {
  interpolate,
  Extrapolation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { SymbolView } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { useCategoriesStore } from "@/stores/categoriesStore";
import { useBudgetStore } from "@/stores/budgetStore";
import { useUndoStore } from "@/stores/undoStore";
import { Text } from "@/presentation/components/atoms/Text";
import { Amount } from "@/presentation/components/atoms/Amount";
import { Button } from "@/presentation/components/atoms/Button";
import { SwipeableRow } from "@/presentation/components/molecules/SwipeableRow";
import { GlassButton } from "@/presentation/components/atoms/GlassButton";
import { RowSeparator } from "@/presentation/components/atoms/RowSeparator";
import { parseGoalDef } from "@/goals";
import { describeTemplate, translateDescription } from "@/goals/describe";
import i18n from "@/i18n/config";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import type { Category, CategoryGroup } from "@/categories/types";

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
  goalsLabel,
  incomeLabel,
}: {
  income: number;
  goals: number;
  goalColor: string;
  incomeColor: string;
  trackColor: string;
  textColor: string;
  subtextColor: string;
  monthLabel: string;
  goalsLabel: string;
  incomeLabel: string;
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
    incomeProgress.value = withDelay(400, withTiming(incomePct, { duration: 800 }));
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
          <Text variant="captionSm" color={textColor} style={{ fontWeight: "600" }}>
            {goalsLabel}
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
          <Text variant="captionSm" color={textColor} style={{ fontWeight: "600" }}>
            {incomeLabel}
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
  const { t } = useTranslation("budget");
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const goalsEnabled = useFeatureFlag("goalTemplatesEnabled");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { groups, categories, load } = useCategoriesStore();
  const budgetData = useBudgetStore((s) => s.data);
  const budgetMonth = useBudgetStore((s) => s.month);
  const monthName = useMemo(() => {
    const [y, m] = budgetMonth.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(i18n.language, { month: "long" });
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

  const { categoriesByGroup, hiddenCategories } = useMemo(() => {
    const map = new Map<string, Category[]>();
    const hidden: Category[] = [];
    for (const g of [...expenseGroups, ...incomeGroups]) {
      const visible: Category[] = [];
      for (const c of categories.filter((c) => c.cat_group === g.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
        if (c.hidden) {
          hidden.push(c);
        } else {
          visible.push(c);
        }
      }
      map.set(g.id, visible);
    }
    // Also collect from hidden groups
    for (const g of groups.filter((g) => g.hidden)) {
      for (const c of categories.filter((c) => c.cat_group === g.id)) {
        hidden.push(c);
      }
    }
    return { categoriesByGroup: map, hiddenCategories: hidden };
  }, [expenseGroups, incomeGroups, categories, groups]);

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
    // Income groups — no super-header, just the group directly
    for (const g of incomeGroups) {
      out.push({
        key: g.id,
        groupId: g.id,
        group: g,
        isIncome: true,
        data: categoriesByGroup.get(g.id) ?? [],
      });
    }
    // Hidden categories group at the bottom
    if (hiddenCategories.length > 0) {
      out.push({
        key: "__hidden__",
        groupId: null,
        group: null,
        isIncome: false,
        data: hiddenCategories,
      });
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
          options: [t("renameGroup"), t("deleteGroup"), t("cancel")],
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
          text: t("renameGroup"),
          onPress: () =>
            router.push({
              pathname: "/(auth)/budget/edit-group",
              params: { groupId: group.id },
            }),
        },
        {
          text: t("deleteGroup"),
          style: "destructive",
          onPress: () => confirmDeleteGroup(group, catCount),
        },
        { text: t("cancel"), style: "cancel" },
      ]);
    }
  }

  function confirmDeleteGroup(group: CategoryGroup, catCount: number) {
    const message =
      catCount > 0
        ? t("deleteGroupMessageWithCategories", {
            name: group.name,
            count: catCount,
            suffix: catCount === 1 ? "y" : "ies",
          })
        : t("deleteGroupMessageEmpty", { name: group.name });
    Alert.alert(t("deleteGroupTitle"), message, [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: async () => {
          await useCategoriesStore.getState().deleteCategoryGroup(group.id);
          useUndoStore.getState().showUndo(t("categoryGroupDeleted"));
        },
      },
    ]);
  }

  // ---------- Category delete ----------

  function handleDeleteCategory(cat: Category) {
    Alert.alert(t("deleteCategory"), t("deleteCategoryMessage", { name: cat.name }), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: async () => {
          await useCategoriesStore.getState().deleteCategory(cat.id);
          useUndoStore.getState().showUndo(t("categoryDeleted"));
        },
      },
    ]);
  }

  // ---------- Render: Normal mode ----------

  const renderSectionHeader = useCallback(
    ({ section }: { section: GroupSection }) => {
      // Super-headers (EXPENSES label) or Hidden Categories
      if (!section.group) {
        const label = section.key === "__hidden__" ? t("hiddenCategories") : t("expenses");
        return (
          <View
            style={{
              paddingHorizontal: spacing.lg,
              paddingTop: section.key === "__expenses__" ? spacing.md : spacing.xl,
              paddingBottom: spacing.sm,
              opacity: section.key === "__hidden__" ? 0.5 : 1,
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
              {label}
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
          accessibilityLabel={`${group.name}, ${section.data.length}`}
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
          <Button
            icon="addCircle"
            buttonStyle="borderless"
            size="sm"
            onPress={() =>
              router.push({
                pathname: "/(auth)/budget/new-category",
                params: { groupId: group.id },
              })
            }
            accessibilityLabel={t("addGroupAccessibility", { name: group.name })}
          />
          <Button
            icon="ellipsisHorizontalCircleOutline"
            buttonStyle="borderless"
            size="sm"
            color={colors.textMuted}
            onPress={() =>
              router.push({
                pathname: "/(auth)/budget/edit-group",
                params: { groupId: group.id },
              })
            }
            accessibilityLabel={t("editGroupAccessibility", { name: group.name })}
          />
        </View>
      );
    },
    [colors, spacing, br, bw, router],
  );

  const renderNormalItem = useCallback(
    ({ item, index, section }: { item: Category; index: number; section: GroupSection }) => {
      const isLast = index === section.data.length - 1;
      const isFirst = index === 0;

      // Goal info
      const templates = goalsEnabled ? parseGoalDef(item.goal_def ?? null) : [];
      const hasGoal = templates.length > 0;
      const goalDesc = hasGoal ? describeTemplate(templates[0], i18n.language) : null;
      const goalDescription = goalDesc ? translateDescription(goalDesc, t) : null;
      const isHiddenSection = section.key === "__hidden__";

      return (
        <SwipeableRow
          onDelete={() => handleDeleteCategory(item)}
          isFirst={isFirst}
          isLast={isLast}
          style={{ marginHorizontal: spacing.lg, opacity: isHiddenSection ? 0.5 : 1 }}
        >
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/(auth)/budget/quick-edit-category",
                params: { categoryId: item.id },
              })
            }
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              minHeight: 44,
              backgroundColor: pressed ? colors.elevatedBackground : colors.cardBackground,
              borderTopLeftRadius: isFirst ? br.lg : 0,
              borderTopRightRadius: isFirst ? br.lg : 0,
              borderBottomLeftRadius: isLast ? br.lg : 0,
              borderBottomRightRadius: isLast ? br.lg : 0,
            })}
          >
            <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
              {item.name}
            </Text>
            {!section.isIncome && hasGoal && goalDescription ? (
              <Text
                variant="captionSm"
                color={colors.textSecondary}
                numberOfLines={1}
                style={{ flexShrink: 1, marginLeft: spacing.sm }}
              >
                {goalDescription}
              </Text>
            ) : !section.isIncome && goalsEnabled ? (
              <Button
                title={t("addTarget")}
                icon="addCircle"
                buttonStyle="borderless"
                size="sm"
                onPress={() => {
                  router.push({
                    pathname: "/(auth)/budget/goal",
                    params: { categoryId: item.id },
                  });
                }}
              />
            ) : null}
            {!isLast && <RowSeparator insetLeft={spacing.lg} />}
          </Pressable>
        </SwipeableRow>
      );
    },
    [colors, spacing, br, bw, router],
  );

  // ---------- Header ----------

  const headerBg = colors.primary;
  const headerText = colors.primaryText;

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
      opacity: interpolate(scrollY.value, [fadeStart, fadeEnd], [1, 0], Extrapolation.CLAMP),
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
          {t("editBudget")}
        </Text>

        {/* Big amount: needed to fund all goals */}
        {goalsEnabled && totalGoals > 0 ? (
          <>
            <Amount
              value={needed}
              variant="headingLg"
              color={headerText}
              weight="700"
              colored={false}
            />
            <Text variant="captionSm" color="rgba(255,255,255,0.6)">
              {needed > 0 ? t("neededToFundGoals") : t("allGoalsFunded")}
            </Text>
          </>
        ) : (
          <Text variant="body" color="rgba(255,255,255,0.6)" style={{ marginTop: spacing.sm }}>
            {t("noGoalsConfigured")}
          </Text>
        )}
      </Animated.View>
    </View>
  );

  // Goals bar: green when income covers all goals, primary/purple otherwise
  const goalsBarColor = income >= totalGoals && totalGoals > 0 ? colors.positive : colors.primary;

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
        goalsLabel={t("monthGoals", { month: monthName })}
        incomeLabel={t("monthlyIncome")}
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
      opacity: interpolate(scrollY.value, [sp - 30, sp], [0, 1], Extrapolation.CLAMP),
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
          title={t("reorder")}
          icon="reorderThreeOutline"
          buttonStyle="borderedSecondary"
          size="lg"
          onPress={() => router.push("/(auth)/budget/reorder")}
          style={{ borderRadius: br.full }}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Button
          title={t("addGroup")}
          icon="folderOutline"
          buttonStyle="borderedSecondary"
          size="lg"
          onPress={() => router.push("/(auth)/budget/new-group")}
          style={{ borderRadius: br.full }}
        />
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
        onScroll={(e) => {
          scrollY.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 80 }}
        ListHeaderComponent={
          <>
            {headerContent}
            {goalsEnabled && totalGoals > 0 && (
              <View style={{ marginTop: -32, paddingTop: spacing.sm, opacity: 0 }}>
                {cardInner}
              </View>
            )}
            {actionButtons}
          </>
        }
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: 80, gap: 8 }}>
            <SymbolView name="folder.badge.questionmark" tintColor={colors.textMuted} size={48} />
            <Text variant="bodyLg" color={colors.textSecondary}>
              {t("noCategoryGroupsYet")}
            </Text>
            <Text variant="bodySm" color={colors.textMuted}>
              {t("organizeByCreating")}
            </Text>
          </View>
        }
      />

      {/* Purple bg behind sticky card — zIndex 5 */}
      {goalsEnabled && totalGoals > 0 && (
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
      {goalsEnabled && totalGoals > 0 && headerHeight > 0 && (
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
        <GlassButton
          icon="chevronBack"
          iconSize={24}
          onPress={() => router.back()}
          color={headerText}
        />
      </View>
    </View>
  );
}
