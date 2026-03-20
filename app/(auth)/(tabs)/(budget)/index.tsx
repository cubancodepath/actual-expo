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
import { useSheetValueNumber, useSpreadsheetVersion } from "@/presentation/hooks/useSheetValue";
import { sheetForMonth, envelopeBudget } from "@/spreadsheet/bindings";
import { getSpreadsheet } from "@/spreadsheet/instance";
import { inferGoalFromDef } from "@/goals";
import { useCommonMenuActions } from "@/presentation/hooks/useCommonMenuItems";
import { useRefreshControl } from "@/presentation/hooks/useRefreshControl";
import { useKeyboardHeight } from "@/presentation/hooks/useKeyboardHeight";
import { useExpressionMode } from "@/presentation/hooks/useExpressionMode";
import { useKeyboardBlur } from "@/presentation/hooks/useKeyboardBlur";
import { MAX_CENTS } from "@/lib/currency";
import type { BudgetCategoryData, BudgetGroupData } from "@/budgets/types";

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
import { CollapsibleRow } from "@/presentation/components/atoms/CollapsibleRow";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BudgetFilter = "all" | "underfunded" | "overfunded" | "has-money";

type BudgetSection = {
  key: string;
  title: string;
  group: BudgetGroupData;
  data: BudgetCategoryData[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HIDDEN_GROUP_ID = "__hidden__";

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function BudgetScreen() {
  const { t } = useTranslation("budget");
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const month = useBudgetUIStore((s) => s.month);
  const sheet = sheetForMonth(month);
  const { categories, groups: rawGroups, isLoading: categoriesLoading } = useCategories();
  const toBudget = useSheetValueNumber(sheet, envelopeBudget.toBudget);
  const buffered = useSheetValueNumber(sheet, envelopeBudget.buffered);
  // ssVersion still needed for overspent count (reads balance from spreadsheet)
  const ssVersion = useSpreadsheetVersion();
  const { refreshControlProps } = useRefreshControl();
  const { showProgressBars, toggleProgressBars } = usePrefsStore();
  const goalsEnabled = useFeatureFlag("goalTemplatesEnabled");
  const commonActions = useCommonMenuActions();
  const [uncategorizedCount, setUncategorizedCount] = useState(0);

  // Build structural BudgetGroupData[] — NO spreadsheet reads
  const budgetGroups = useMemo<BudgetGroupData[]>(() => {
    if (rawGroups.length === 0) return [];

    const sortedGroups = [...rawGroups].sort((a, b) => {
      if (a.is_income !== b.is_income) return a.is_income ? 1 : -1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

    return sortedGroups.map((g) => {
      const groupCats = categories
        .filter((c) => c.cat_group === g.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

      return {
        id: g.id,
        name: g.name,
        is_income: g.is_income,
        hidden: g.hidden,
        categories: groupCats.map((c) => ({
          id: c.id,
          name: c.name,
          hidden: c.hidden,
          goalDef: c.goal_def,
        })),
      };
    });
  }, [categories, rawGroups]);

  const dataReady = budgetGroups.length > 0 || (!categoriesLoading && rawGroups.length === 0);

  // Load uncategorized stats
  useEffect(() => {
    getUncategorizedStats().then(({ count }) => setUncategorizedCount(count));
  }, [ssVersion]);

  const fabCollapsed = useSharedValue(false);
  const COLLAPSE_THRESHOLD = 100;

  const [filter, setFilter] = useState<BudgetFilter>("all");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set([HIDDEN_GROUP_ID]));

  // -- Shared hidden input: editing state --
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState(0);
  const sharedInputRef = useRef<TextInput>(null);
  const sectionListRef = useRef<SectionList<BudgetCategoryData, BudgetSection>>(null);
  const expr = useExpressionMode({
    value: editValue,
    onChangeValue: setEditValue,
  });

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

  const scrollOffsetRef = useRef(0);
  const handleScrollForOffset = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
      fabCollapsed.value = e.nativeEvent.contentOffset.y > COLLAPSE_THRESHOLD;
    },
    [],
  );

  function handleRowPress(catId: string, budgeted: number, pageY: number) {
    if (editingCatId === catId) {
      sharedInputRef.current?.blur();
      return;
    }
    if (editingCatId) {
      commitEdit();
    }
    setEditingCatId(catId);
    setEditValue(budgeted);
    sharedInputRef.current?.focus();

    const screenHeight = Dimensions.get("window").height;
    const keyboardTop = screenHeight - 340;
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

  function toggleGroup(groupId: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  const { visible: keyboardVisible } = useKeyboardHeight();

  useFocusEffect(
    useCallback(() => {
      return () => {
        sharedInputRef.current?.blur();
        Keyboard.dismiss();
      };
    }, []),
  );

  useEffect(() => {
    setFilter("all");
    Keyboard.dismiss();
  }, [month]);

  // -- Base sections (structural — always include all items for animation) --
  const baseSections: BudgetSection[] = useMemo(() => {
    const hiddenCats: BudgetCategoryData[] = [];
    const visible = budgetGroups
      .filter((g) => !g.hidden)
      .map((g) => {
        const visibleCats: BudgetCategoryData[] = [];
        for (const c of g.categories) {
          if (c.hidden) hiddenCats.push(c);
          else visibleCats.push(c);
        }
        return { ...g, categories: visibleCats };
      });

    const result: BudgetSection[] = visible.map((g) => ({
      key: g.id,
      title: g.name,
      group: g,
      data: g.categories,
    }));

    for (const g of budgetGroups) {
      if (!g.hidden) continue;
      for (const c of g.categories) hiddenCats.push(c);
    }

    if (hiddenCats.length > 0) {
      const hiddenGroup: BudgetGroupData = {
        id: HIDDEN_GROUP_ID,
        name: t("hiddenCategories"),
        is_income: false,
        hidden: false,
        categories: hiddenCats,
      };
      result.push({
        key: HIDDEN_GROUP_ID,
        title: t("hiddenCategories"),
        group: hiddenGroup,
        data: hiddenCats,
      });
    }

    return result;
  }, [budgetGroups, t]);

  // -- Filtered sections (reads spreadsheet only when filter is active) --
  const sections: BudgetSection[] = useMemo(() => {
    if (filter === "all") return baseSections;

    const ss = getSpreadsheet();

    function matchesFilter(c: BudgetCategoryData, groupIsIncome: boolean) {
      if (groupIsIncome) return true;
      const balance = (ss.getValue(sheet, envelopeBudget.catBalance(c.id)) as number) ?? 0;
      const budgeted = (ss.getValue(sheet, envelopeBudget.catBudgeted(c.id)) as number) ?? 0;
      const goalInfo = c.goalDef ? inferGoalFromDef(c.goalDef) : null;
      const goal = goalInfo?.goal ?? null;
      const longGoal = goalInfo?.longGoal ?? false;

      switch (filter) {
        case "underfunded": {
          if (goal == null) return false;
          const funded = longGoal ? balance : budgeted;
          return funded < goal;
        }
        case "overfunded": {
          if (goal == null || balance < 0) return false;
          const funded = longGoal ? balance : budgeted;
          return funded > goal;
        }
        case "has-money":
          return balance > 0;
      }
    }

    return baseSections
      .map((section) => ({
        ...section,
        data: section.data.filter((c) => matchesFilter(c, section.group.is_income)),
      }))
      .filter((section) => section.data.length > 0);
  }, [baseSections, filter, sheet, ssVersion]);

  // -- Callbacks (accept IDs, not full objects) --
  function handleMoveMoney(catId: string, catName: string, balance: number) {
    router.push({
      pathname: "/(auth)/budget/move-money",
      params: { catId, catName, balance: String(balance) },
    });
  }

  function handleToggleCarryover(catId: string, carryover: boolean) {
    setCategoryCarryover(month, catId, !carryover);
  }

  function handleCategoryDetails(catId: string) {
    router.push({
      pathname: "/(auth)/budget/edit-category",
      params: { categoryId: catId },
    });
  }

  function handleViewTransactions(catId: string, catName: string) {
    router.push({
      pathname: "/(auth)/budget/category-transactions",
      params: { categoryId: catId, categoryName: catName },
    });
  }

  function handleBudgetNotes(catName: string) {
    router.push({
      pathname: "/(auth)/budget/notes",
      params: { categoryName: catName },
    });
  }

  // -- Overspent count (uses ssVersion since it reads spreadsheet) --
  const overspentCount = useMemo(() => {
    const ss = getSpreadsheet();
    let count = 0;
    for (const g of budgetGroups) {
      if (g.is_income) continue;
      for (const c of g.categories) {
        const balance = (ss.getValue(sheet, envelopeBudget.catBalance(c.id)) as number) ?? 0;
        const carryover =
          ss.getValue(sheet, envelopeBudget.catCarryover(c.id)) === true ||
          ss.getValue(sheet, envelopeBudget.catCarryover(c.id)) === 1;
        if (balance < 0 && !carryover) count++;
      }
    }
    return count;
  }, [budgetGroups, sheet, ssVersion]);

  function handleOverspentPress() {
    router.push("/(auth)/budget/cover-overspent");
  }

  const showBudgetedColumn = !goalsEnabled || !showProgressBars || editingCatId !== null;

  function dismissEdit() {
    sharedInputRef.current?.blur();
    Keyboard.dismiss();
  }

  function renderSectionHeader({ section }: { section: BudgetSection }) {
    return (
      <View style={section.group.hidden ? { opacity: 0.5 } : undefined}>
        <BudgetGroupHeader
          group={section.group}
          sheet={sheet}
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
    item: BudgetCategoryData;
    index: number;
    section: BudgetSection;
  }) {
    const isCollapsed = collapsedGroups.has(section.group.id);
    return (
      <CollapsibleRow collapsed={isCollapsed}>
        <View style={cat.hidden ? { opacity: 0.5 } : undefined}>
          <BudgetCategoryRow
            cat={cat}
            sheet={sheet}
            month={month}
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
            onPress={handleRowPress}
            showProgressBar={goalsEnabled && showProgressBars}
            showBudgetedColumn={showBudgetedColumn}
          />
        </View>
      </CollapsibleRow>
    );
  }

  return (
    <>
      <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
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
