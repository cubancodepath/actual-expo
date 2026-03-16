import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Alert, Keyboard, RefreshControl, SectionList, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { useSharedValue } from "react-native-reanimated";
import { AddTransactionButton } from "@/presentation/components/molecules/AddTransactionButton";
import { KeyboardToolbar } from "@/presentation/components/molecules/KeyboardToolbar";
import { CalculatorToolbar } from "@/presentation/components/atoms/CalculatorToolbar";
import { GlassButton } from "@/presentation/components/atoms/GlassButton";
import type { CompactCurrencyInputRef } from "@/presentation/components/atoms/CompactCurrencyInput";
import { useBudgetStore } from "@/stores/budgetStore";
import { useCommonMenuActions } from "@/presentation/hooks/useCommonMenuItems";
import { useRefreshControl } from "@/presentation/hooks/useRefreshControl";
import { useKeyboardHeight } from "@/presentation/hooks/useKeyboardHeight";
import type { BudgetCategory, BudgetGroup } from "@/budgets/types";

import { BudgetGroupHeader } from "@/presentation/components/budget/BudgetGroupHeader";
import { BudgetCategoryRow } from "@/presentation/components/budget/BudgetCategoryRow";
import { ReadyToAssignPill } from "@/presentation/components/budget/ReadyToAssignPill";
import { OverspentPill } from "@/presentation/components/budget/OverspentPill";
import { UnclearedPill } from "@/presentation/components/transaction/UnclearedPill";
import { getUncategorizedStats } from "@/transactions";
import { Text } from "@/presentation/components/atoms/Text";
import { usePrefsStore } from "@/stores/prefsStore";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { BudgetListSkeleton } from "@/presentation/components/skeletons/BudgetListSkeleton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BudgetFilter = "all" | "underfunded" | "overfunded" | "has-money";

type BudgetSection = {
  key: string;
  title: string;
  group: BudgetGroup;
  data: BudgetCategory[];
};

// ---------------------------------------------------------------------------
// Filter logic
// ---------------------------------------------------------------------------

function matchesFilter(cat: BudgetCategory, filter: BudgetFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "underfunded": {
      if (cat.goal == null) return false;
      const funded = cat.longGoal ? cat.balance : cat.budgeted;
      return funded < cat.goal;
    }
    case "overfunded": {
      if (cat.goal != null) {
        const funded = cat.longGoal ? cat.balance : cat.budgeted;
        return funded > cat.goal;
      }
      return cat.balance > 0 && cat.budgeted > 0;
    }
    case "has-money":
      return cat.balance > 0;
  }
}

function filterBudgetGroups(
  groups: BudgetGroup[],
  filter: BudgetFilter,
  showHidden: boolean,
): BudgetGroup[] {
  return groups
    .filter((g) => showHidden || !g.hidden)
    .map((g) => ({
      ...g,
      categories: g.categories.filter((c) => (showHidden || !c.hidden) && matchesFilter(c, filter)),
    }))
    .filter((g) => filter === "all" || g.categories.length > 0);
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function BudgetScreen() {
  const { t } = useTranslation("budget");
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { month, data, loading, load, setAmount, setCarryover, resetHold } = useBudgetStore();
  const { refreshControlProps } = useRefreshControl();
  const { showProgressBars, toggleProgressBars, showHiddenCategories, toggleShowHiddenCategories } =
    usePrefsStore();
  const goalsEnabled = useFeatureFlag("goalTemplatesEnabled");
  const commonActions = useCommonMenuActions();
  const [uncategorizedCount, setUncategorizedCount] = useState(0);

  // Load uncategorized stats when data changes
  useEffect(() => {
    getUncategorizedStats().then(({ count }) => setUncategorizedCount(count));
  }, [data]);

  const fabCollapsed = useSharedValue(false);
  const COLLAPSE_THRESHOLD = 100;
  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    fabCollapsed.value = e.nativeEvent.contentOffset.y > COLLAPSE_THRESHOLD;
  }, []);

  const [filter, setFilter] = useState<BudgetFilter>("all");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // -- Calculator: track the currently focused input ref --
  const focusedInputRef = useRef<CompactCurrencyInputRef | null>(null);
  const [anyRowEditing, setAnyRowEditing] = useState(false);

  // -- Collapsible groups --
  function toggleGroup(groupId: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  // -- Keyboard tracking --
  const { visible: keyboardVisible } = useKeyboardHeight();

  // -- Dismiss keyboard when leaving screen --
  useFocusEffect(
    useCallback(() => {
      return () => {
        focusedInputRef.current?.blur();
        Keyboard.dismiss();
      };
    }, []),
  );

  // -- Reset filter on month change --
  useEffect(() => {
    setFilter("all");
    Keyboard.dismiss();
  }, [month]);

  // -- Sections (filtered) --
  const filteredGroups = useMemo(
    () => filterBudgetGroups(data?.groups ?? [], filter, showHiddenCategories),
    [data?.groups, filter, showHiddenCategories],
  );
  const sections: BudgetSection[] = filteredGroups.map((g) => ({
    key: g.id,
    title: g.name,
    group: g,
    data: collapsedGroups.has(g.id) ? [] : g.categories,
  }));

  // -- Move money --
  function handleMoveMoney(cat: BudgetCategory) {
    router.push({
      pathname: "/(auth)/budget/move-money",
      params: { catId: cat.id, catName: cat.name, balance: String(cat.balance) },
    });
  }

  function handleToggleCarryover(cat: BudgetCategory) {
    setCarryover(cat.id, !cat.carryover);
  }

  function handleCategoryDetails(cat: BudgetCategory) {
    router.push({
      pathname: "/(auth)/budget/edit-category",
      params: { categoryId: cat.id },
    });
  }

  function handleViewTransactions(cat: BudgetCategory) {
    router.push({
      pathname: "/(auth)/budget/category-transactions",
      params: { categoryId: cat.id, categoryName: cat.name },
    });
  }

  function handleBudgetNotes(cat: BudgetCategory) {
    router.push({
      pathname: "/(auth)/budget/notes",
      params: { categoryName: cat.name },
    });
  }

  function handleCategoryLongPress(cat: BudgetCategory) {
    // Android fallback — iOS uses zeego context menu in BudgetCategoryRow
    const toggleLabel = cat.carryover ? t("removeOverspendingRollover") : t("rolloverOverspending");
    Alert.alert(cat.name, undefined, [
      { text: t("categoryDetails"), onPress: () => handleCategoryDetails(cat) },
      { text: t("moveMoney"), onPress: () => handleMoveMoney(cat) },
      { text: toggleLabel, onPress: () => handleToggleCarryover(cat) },
      { text: t("viewTransactions"), onPress: () => handleViewTransactions(cat) },
      { text: t("budgetMovements"), onPress: () => handleBudgetNotes(cat) },
      { text: t("cancel"), style: "cancel" },
    ]);
  }

  // -- Save individual budget amount --
  function handleCommit(catId: string, cents: number) {
    setAmount(catId, cents);
  }

  // -- Budget assignment balance --
  const toBudget = data?.toBudget ?? 0;

  // -- Overspent categories --
  const overspentCategories = useMemo(() => {
    if (!data) return [];
    return data.groups
      .filter((g) => !g.is_income)
      .flatMap((g) =>
        g.categories
          .filter((c) => c.balance < 0 && !c.carryover)
          .map((c) => ({ id: c.id, name: c.name, balance: c.balance, groupName: g.name })),
      );
  }, [data]);
  const overspentCount = overspentCategories.length;

  function handleOverspentPress() {
    router.push("/(auth)/budget/cover-overspent");
  }

  // -- Column header visibility --
  const showBudgetedColumn = !goalsEnabled || anyRowEditing || !showProgressBars;

  // -- Render helpers --
  function dismissEdit() {
    focusedInputRef.current?.blur();
    Keyboard.dismiss();
    setAnyRowEditing(false);
  }

  function renderSectionHeader({ section }: { section: BudgetSection }) {
    return (
      <View style={section.group.hidden ? { opacity: 0.5 } : undefined}>
        <BudgetGroupHeader
          group={section.group}
          isCollapsed={collapsedGroups.has(section.group.id)}
          onToggle={() => {
            dismissEdit();
            toggleGroup(section.group.id);
          }}
          showBudgetedColumn={showBudgetedColumn}
        />
      </View>
    );
  }

  function renderItem({
    item: cat,
    index,
    section,
  }: {
    item: BudgetCategory;
    index: number;
    section: BudgetSection;
  }) {
    return (
      <View style={cat.hidden ? { opacity: 0.5 } : undefined}>
        <BudgetCategoryRow
          cat={cat}
          isIncome={section.group.is_income}
          isFirst={index === 0}
          isLast={index === section.data.length - 1}
          onLongPress={handleCategoryLongPress}
          onCategoryDetails={handleCategoryDetails}
          onMoveMoney={handleMoveMoney}
          onToggleCarryover={handleToggleCarryover}
          onViewTransactions={handleViewTransactions}
          onBudgetNotes={handleBudgetNotes}
          onCommit={handleCommit}
          onInputFocus={(ref) => {
            focusedInputRef.current = ref;
            setAnyRowEditing(true);
          }}
          onInputBlur={() => setAnyRowEditing(false)}
          showProgressBar={goalsEnabled && showProgressBars}
          showBudgetedColumn={!goalsEnabled || anyRowEditing || !showProgressBars}
        />
      </View>
    );
  }

  return (
    <>
      <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
        {/* Sticky status area — stays fixed above the list */}
        {data && (toBudget !== 0 || data.buffered > 0) && (
          <View style={{ paddingTop: spacing.sm, paddingBottom: spacing.xs }}>
            <ReadyToAssignPill
              amount={toBudget}
              onPress={() => router.push("/(auth)/budget/assign")}
              holdAmount={data.buffered}
              onEditHold={() =>
                router.push({
                  pathname: "/(auth)/budget/hold",
                  params: {
                    current: String(data.buffered),
                    maxAmount: String((data.toBudget ?? 0) + (data.buffered ?? 0)),
                  },
                })
              }
              onClearHold={() =>
                Alert.alert(t("releaseHoldTitle"), t("releaseHoldMessage"), [
                  { text: t("cancel"), style: "cancel" },
                  { text: t("release"), style: "destructive", onPress: () => resetHold() },
                ])
              }
            />
          </View>
        )}

        {/* Budget list */}
        {loading && !data ? (
          <BudgetListSkeleton />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(c) => c.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets
            renderItem={renderItem}
            renderSectionHeader={renderSectionHeader}
            stickySectionHeadersEnabled
            onScroll={handleScroll}
            onScrollBeginDrag={() => Keyboard.dismiss()}
            scrollEventThrottle={16}
            extraData={`${collapsedGroups.size}-${anyRowEditing}`}
            ListHeaderComponent={
              data && (overspentCount > 0 || uncategorizedCount > 0) ? (
                <View
                  style={{ paddingTop: spacing.xs, paddingBottom: spacing.xs, gap: spacing.xs }}
                >
                  {overspentCount > 0 && (
                    <OverspentPill count={overspentCount} onPress={handleOverspentPress} />
                  )}
                  {uncategorizedCount > 0 && (
                    <UnclearedPill
                      count={uncategorizedCount}
                      label={t("uncategorized")}
                      variant="danger"
                      onPress={() =>
                        router.push({
                          pathname: "/(auth)/(tabs)/(spending)/search",
                          params: { initialFilter: "uncategorized" },
                        })
                      }
                    />
                  )}
                </View>
              ) : null
            }
            refreshControl={<RefreshControl {...refreshControlProps} />}
            ListEmptyComponent={
              filter !== "all" ? (
                <View style={{ alignItems: "center", marginTop: 80, gap: 8 }}>
                  <Ionicons name="funnel-outline" size={32} color={colors.textMuted} />
                  <Text variant="bodyLg" color={colors.textSecondary}>
                    {t("noMatchingCategories")}
                  </Text>
                  <Text variant="bodySm" color={colors.textMuted}>
                    {t("tryDifferentFilter")}
                  </Text>
                </View>
              ) : (
                <View style={{ alignItems: "center", marginTop: 80, gap: 8 }}>
                  <Text variant="bodyLg" color={colors.textSecondary}>
                    {t("noCategoriesYet")}
                  </Text>
                  <Text variant="bodySm" color={colors.textMuted}>
                    {t("syncToLoad")}
                  </Text>
                </View>
              )
            }
            contentContainerStyle={{ paddingBottom: 80 }}
          />
        )}

        {!keyboardVisible && <AddTransactionButton collapsed={fabCollapsed} />}
      </View>

      {/* Calculator toolbar — floats above keyboard */}
      <KeyboardToolbar>
        <CalculatorToolbar
          onOperator={(op) => focusedInputRef.current?.injectOperator(op)}
          onEvaluate={() => focusedInputRef.current?.evaluate()}
        />
        <View style={{ flex: 1 }} />
        <GlassButton
          icon="checkmark"
          iconSize={16}
          variant="tinted"
          tintColor={colors.primary}
          onPress={dismissEdit}
        />
      </KeyboardToolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu
          icon={
            filter === "all"
              ? "line.3.horizontal.decrease"
              : "line.3.horizontal.decrease.circle.fill"
          }
          tintColor={filter !== "all" ? colors.primary : undefined}
          title={t("filter")}
        >
          <Stack.Toolbar.MenuAction
            isOn={filter === "all"}
            icon="list.bullet"
            onPress={() => setFilter("all")}
          >
            {t("filterAll")}
          </Stack.Toolbar.MenuAction>
          {goalsEnabled && (
            <Stack.Toolbar.MenuAction
              isOn={filter === "underfunded"}
              icon="arrow.down.circle"
              onPress={() => setFilter("underfunded")}
            >
              {t("filterUnderfunded")}
            </Stack.Toolbar.MenuAction>
          )}
          <Stack.Toolbar.MenuAction
            isOn={filter === "overfunded"}
            icon="arrow.up.circle"
            onPress={() => setFilter("overfunded")}
          >
            {t("filterOverfunded")}
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            isOn={filter === "has-money"}
            icon="banknote"
            onPress={() => setFilter("has-money")}
          >
            {t("filterMoneyAvailable")}
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
        <Stack.Toolbar.Menu icon="ellipsis">
          {goalsEnabled && (
            <Stack.Toolbar.MenuAction
              icon={showProgressBars ? "line.3.horizontal" : "line.3.horizontal"}
              onPress={toggleProgressBars}
            >
              {showProgressBars ? t("hideProgress") : t("showProgress")}
            </Stack.Toolbar.MenuAction>
          )}
          <Stack.Toolbar.MenuAction
            icon={showHiddenCategories ? "square.stack.3d.up.slash" : "square.stack.3d.up"}
            onPress={toggleShowHiddenCategories}
          >
            {showHiddenCategories ? t("hideHiddenCategories") : t("showHiddenCategories")}
          </Stack.Toolbar.MenuAction>
          {commonActions}
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
    </>
  );
}
