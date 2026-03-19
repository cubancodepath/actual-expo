import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  Alert,
  Dimensions,
  Keyboard,
  RefreshControl,
  SectionList,
  TextInput,
  View,
} from "react-native";
import { Icon } from "@/presentation/components/atoms/Icon";
import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { useSharedValue } from "react-native-reanimated";
import { AddTransactionButton } from "@/presentation/components/molecules/AddTransactionButton";
import { SharedAmountInput } from "@/presentation/components/transaction/SharedAmountInput";
import type { CurrencyInputRef } from "@/presentation/components/currency-input/CurrencyInput";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { setCategoryCarryover, resetHold as resetHoldFn, setBudgetAmount } from "@/budgets";
import { useCategories } from "@/presentation/hooks/useCategories";
import { useSheetValueNumber } from "@/presentation/hooks/useSheetValue";
import { sheetForMonth, envelopeBudget } from "@/spreadsheet/bindings";
import { getSpreadsheet } from "@/spreadsheet/instance";
import { inferGoalFromDef } from "@/goals";
import { useCommonMenuActions } from "@/presentation/hooks/useCommonMenuItems";
import { useRefreshControl } from "@/presentation/hooks/useRefreshControl";
import { useKeyboardHeight } from "@/presentation/hooks/useKeyboardHeight";
import { useExpressionMode } from "@/presentation/hooks/useExpressionMode";
import { useKeyboardBlur } from "@/presentation/hooks/useKeyboardBlur";
import { MAX_CENTS } from "@/lib/currency";
import type { BudgetCategory, BudgetGroup } from "@/budgets/types";

const BUDGET_ACCESSORY_ID = "budgetSharedCalcToolbar";

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

const HIDDEN_GROUP_ID = "__hidden__";

function filterBudgetGroups(
  groups: BudgetGroup[],
  filter: BudgetFilter,
): { visible: BudgetGroup[]; hidden: BudgetCategory[] } {
  const hiddenCats: BudgetCategory[] = [];

  const visible = groups
    .filter((g) => !g.hidden)
    .map((g) => {
      const visibleCats: BudgetCategory[] = [];
      for (const c of g.categories) {
        if (c.hidden) {
          hiddenCats.push(c);
        } else if (matchesFilter(c, filter)) {
          visibleCats.push(c);
        }
      }
      return { ...g, categories: visibleCats };
    })
    .filter((g) => filter === "all" || g.categories.length > 0);

  // Also collect categories from hidden groups
  for (const g of groups) {
    if (!g.hidden) continue;
    for (const c of g.categories) {
      hiddenCats.push(c);
    }
  }

  return { visible, hidden: hiddenCats };
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function BudgetScreen() {
  const { t } = useTranslation("budget");
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const month = useBudgetUIStore((s) => s.month);
  const sheet = sheetForMonth(month);
  const { categories, groups: rawGroups, isLoading: categoriesLoading } = useCategories();
  const toBudget = useSheetValueNumber(sheet, envelopeBudget.toBudget);
  const buffered = useSheetValueNumber(sheet, envelopeBudget.buffered);
  const { refreshControlProps } = useRefreshControl();
  const { showProgressBars, toggleProgressBars } = usePrefsStore();
  const goalsEnabled = useFeatureFlag("goalTemplatesEnabled");
  const commonActions = useCommonMenuActions();
  const [uncategorizedCount, setUncategorizedCount] = useState(0);

  // Build BudgetGroup[] from categories + spreadsheet data
  const budgetGroups = useMemo<BudgetGroup[]>(() => {
    if (rawGroups.length === 0) return [];
    const ss = getSpreadsheet();
    const num = (v: unknown) => (typeof v === "number" ? v : 0);

    const sortedGroups = [...rawGroups].sort((a, b) => {
      if (a.is_income !== b.is_income) return a.is_income ? 1 : -1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

    return sortedGroups.map((g) => {
      const groupCats = categories
        .filter((c) => c.cat_group === g.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

      const budgetCats: BudgetCategory[] = groupCats.map((c) => {
        const budgeted = num(ss.getValue(sheet, envelopeBudget.catBudgeted(c.id)));
        const spent = num(ss.getValue(sheet, envelopeBudget.catSpent(c.id)));
        const balance = num(ss.getValue(sheet, envelopeBudget.catBalance(c.id)));
        const carryIn = balance - budgeted - spent;
        const goalInfo = c.goal_def ? inferGoalFromDef(c.goal_def, month, carryIn) : null;
        return {
          id: c.id,
          name: c.name,
          budgeted,
          spent,
          balance,
          carryIn,
          carryover:
            ss.getValue(sheet, envelopeBudget.catCarryover(c.id)) === true ||
            ss.getValue(sheet, envelopeBudget.catCarryover(c.id)) === 1,
          goal: goalInfo?.goal ?? null,
          longGoal: goalInfo?.longGoal ?? false,
          goalDef: c.goal_def,
          hidden: c.hidden,
        };
      });

      return {
        id: g.id,
        name: g.name,
        is_income: g.is_income,
        hidden: g.hidden,
        budgeted: num(ss.getValue(sheet, envelopeBudget.groupBudgeted(g.id))),
        spent: num(ss.getValue(sheet, envelopeBudget.groupSpent(g.id))),
        balance: num(ss.getValue(sheet, envelopeBudget.groupBalance(g.id))),
        categories: budgetCats,
      };
    });
  }, [categories, rawGroups, sheet]);

  const dataReady = budgetGroups.length > 0 || (!categoriesLoading && rawGroups.length === 0);

  // Load uncategorized stats when data changes
  useEffect(() => {
    getUncategorizedStats().then(({ count }) => setUncategorizedCount(count));
  }, [budgetGroups]);

  const fabCollapsed = useSharedValue(false);
  const COLLAPSE_THRESHOLD = 100;

  const [filter, setFilter] = useState<BudgetFilter>("all");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set([HIDDEN_GROUP_ID]));

  // -- Shared hidden input: editing state --
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState(0);
  const sharedInputRef = useRef<TextInput>(null);
  const sectionListRef = useRef<SectionList<BudgetCategory, BudgetSection>>(null);
  const expr = useExpressionMode({
    value: editValue,
    onChangeValue: setEditValue,
  });

  // Imperative ref for the calculator pill (conforms to CurrencyInputRef)
  const selfRef = useRef<CurrencyInputRef>(null);
  useImperativeHandle(selfRef, () => ({
    focus: () => sharedInputRef.current?.focus(),
    injectOperator: (op: string) => expr.injectOperator(op, () => sharedInputRef.current?.focus()),
    evaluate: () => expr.evaluate(),
    deleteBackward: () => {
      if (expr.expressionMode) {
        expr.handleKeyPress({ nativeEvent: { key: "Backspace" } });
      } else {
        setEditValue(0);
      }
    },
  }));

  // Track scroll offset for smart keyboard scrolling
  const scrollOffsetRef = useRef(0);
  const handleScrollForOffset = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
      fabCollapsed.value = e.nativeEvent.contentOffset.y > COLLAPSE_THRESHOLD;
    },
    [],
  );

  function handleRowPress(cat: BudgetCategory, pageY: number) {
    if (editingCatId === cat.id) {
      sharedInputRef.current?.blur();
      return;
    }
    if (editingCatId) {
      commitEdit();
    }
    setEditingCatId(cat.id);
    setEditValue(cat.budgeted);
    sharedInputRef.current?.focus();

    // If the tapped cell is in the lower half of the screen, it'll be behind
    // the keyboard (~340pt). Scroll just enough to keep it visible.
    const screenHeight = Dimensions.get("window").height;
    const keyboardTop = screenHeight - 340; // approximate
    if (pageY > keyboardTop - 60) {
      const scrollBy = pageY - keyboardTop + 100;
      setTimeout(() => {
        (sectionListRef.current as any)?.getScrollResponder()?.scrollTo({
          y: scrollOffsetRef.current + scrollBy,
          animated: true,
        });
      }, 50);
    }
  }

  function commitEdit() {
    if (editingCatId !== null) {
      expr.handleBlurExpression();
      // Optimistic update + persist
      const ss = getSpreadsheet();
      ss.setByName(sheet, envelopeBudget.catBudgeted(editingCatId), editValue);
      setBudgetAmount(month, editingCatId, editValue);
    }
  }

  function handleBlur() {
    commitEdit();
    setEditingCatId(null);
    setEditValue(0);
  }

  useKeyboardBlur(editingCatId !== null, handleBlur);

  const currentInputValue = expr.expressionMode
    ? expr.expressionInputValue
    : String(Math.abs(editValue));

  function handleChangeText(text: string) {
    if (!editingCatId) return;
    if (expr.expressionMode) {
      expr.handleChangeTextOperand(text);
    } else {
      const digits = text.replace(/\D/g, "");
      const newCents = Math.min(parseInt(digits || "0", 10), MAX_CENTS);
      setEditValue(newCents);
    }
  }

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
        sharedInputRef.current?.blur();
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
  const { visible: filteredGroups, hidden: hiddenCategories } = useMemo(
    () => filterBudgetGroups(budgetGroups, filter),
    [budgetGroups, filter],
  );
  const sections: BudgetSection[] = filteredGroups.map((g) => ({
    key: g.id,
    title: g.name,
    group: g,
    data: collapsedGroups.has(g.id) ? [] : g.categories,
  }));

  // Append hidden categories as a virtual group at the bottom
  if (hiddenCategories.length > 0) {
    sections.push({
      key: HIDDEN_GROUP_ID,
      title: t("hiddenCategories"),
      group: {
        id: HIDDEN_GROUP_ID,
        name: t("hiddenCategories"),
        is_income: false,
        hidden: false,
        budgeted: 0,
        spent: 0,
        balance: 0,
        categories: hiddenCategories,
      },
      data: collapsedGroups.has(HIDDEN_GROUP_ID) ? [] : hiddenCategories,
    });
  }

  // -- Move money --
  function handleMoveMoney(cat: BudgetCategory) {
    router.push({
      pathname: "/(auth)/budget/move-money",
      params: {
        catId: cat.id,
        catName: cat.name,
        balance: String(cat.balance),
      },
    });
  }

  function handleToggleCarryover(cat: BudgetCategory) {
    setCategoryCarryover(month, cat.id, !cat.carryover);
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

  // -- Overspent categories --
  const overspentCategories = useMemo(() => {
    return budgetGroups
      .filter((g) => !g.is_income)
      .flatMap((g) =>
        g.categories
          .filter((c) => c.balance < 0 && !c.carryover)
          .map((c) => ({
            id: c.id,
            name: c.name,
            balance: c.balance,
            groupName: g.name,
          })),
      );
  }, [budgetGroups]);
  const overspentCount = overspentCategories.length;

  function handleOverspentPress() {
    router.push("/(auth)/budget/cover-overspent");
  }

  // -- Column header visibility --
  const showBudgetedColumn = !goalsEnabled || !showProgressBars;

  // -- Render helpers --
  function dismissEdit() {
    sharedInputRef.current?.blur();
    Keyboard.dismiss();
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
          onCategoryDetails={handleCategoryDetails}
          onMoveMoney={handleMoveMoney}
          onToggleCarryover={handleToggleCarryover}
          onViewTransactions={handleViewTransactions}
          onBudgetNotes={handleBudgetNotes}
          isEditing={editingCatId === cat.id}
          editValue={editingCatId === cat.id ? editValue : undefined}
          expressionMode={editingCatId === cat.id && expr.expressionMode}
          expression={editingCatId === cat.id ? expr.expression : ""}
          onPress={(pageY) => handleRowPress(cat, pageY)}
          showProgressBar={goalsEnabled && showProgressBars}
          showBudgetedColumn={showBudgetedColumn}
        />
      </View>
    );
  }

  return (
    <>
      <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
        {/* Sticky status area — stays fixed above the list */}
        {dataReady && (toBudget !== 0 || buffered > 0) && (
          <View style={{ paddingTop: spacing.sm, paddingBottom: spacing.xs }}>
            <ReadyToAssignPill
              amount={toBudget}
              onPress={() => router.push("/(auth)/budget/assign")}
              holdAmount={buffered}
              onEditHold={() =>
                router.push({
                  pathname: "/(auth)/budget/hold",
                  params: {
                    current: String(buffered),
                    maxAmount: String(toBudget + buffered),
                  },
                })
              }
              onClearHold={() =>
                Alert.alert(t("releaseHoldTitle"), t("releaseHoldMessage"), [
                  { text: t("cancel"), style: "cancel" },
                  {
                    text: t("release"),
                    style: "destructive",
                    onPress: () => resetHoldFn(month),
                  },
                ])
              }
            />
          </View>
        )}

        {/* Budget list */}
        {!dataReady ? (
          <BudgetListSkeleton />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(c) => c.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ref={sectionListRef}
            renderItem={renderItem}
            renderSectionHeader={renderSectionHeader}
            stickySectionHeadersEnabled
            onScroll={handleScrollForOffset}
            onScrollBeginDrag={() => Keyboard.dismiss()}
            scrollEventThrottle={16}
            extraData={collapsedGroups.size}
            ListHeaderComponent={
              dataReady && (overspentCount > 0 || uncategorizedCount > 0) ? (
                <View
                  style={{
                    paddingTop: spacing.xs,
                    paddingBottom: spacing.xs,
                    gap: spacing.xs,
                  }}
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
                  <Icon name="funnelOutline" size={32} color={colors.textMuted} />
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
            contentContainerStyle={{ paddingBottom: 200 }}
          />
        )}

        {!keyboardVisible && <AddTransactionButton collapsed={fabCollapsed} />}
      </View>

      {/* Shared hidden TextInput — one for all budget rows */}
      <SharedAmountInput
        accessoryID={BUDGET_ACCESSORY_ID}
        sharedInputRef={sharedInputRef}
        selfRef={selfRef}
        value={currentInputValue}
        onChangeText={handleChangeText}
        onBlur={handleBlur}
      />

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
              icon={
                showProgressBars ? "chart.line.text.clipboard.fill" : "chart.line.text.clipboard"
              }
              onPress={toggleProgressBars}
            >
              {showProgressBars ? t("hideProgress") : t("showProgress")}
            </Stack.Toolbar.MenuAction>
          )}
          {commonActions}
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
    </>
  );
}
