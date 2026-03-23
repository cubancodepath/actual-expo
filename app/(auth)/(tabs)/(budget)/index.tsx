import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Alert, Keyboard, Pressable, TextInput, View, useColorScheme } from "react-native";
import { Icon } from "@/presentation/components/atoms/Icon";
import { Host, HStack, VStack, Spacer, ContextMenu, Button as SUIButton } from "@expo/ui/swift-ui";
import { Amount } from "@/presentation/components/atoms/Amount";
import {
  foregroundStyle,
  padding,
  listRowBackground,
  frame,
  onTapGesture,
  opacity,
  contentShape,
  refreshable,
} from "@expo/ui/swift-ui/modifiers";
import { shapes } from "@expo/ui/swift-ui/modifiers";
import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { useSharedValue } from "react-native-reanimated";
import { AddTransactionButton } from "@/presentation/components/molecules/AddTransactionButton";
import { SharedAmountInput } from "@/presentation/components/transaction/SharedAmountInput";
import type { CurrencyInputRef } from "@/presentation/components/currency-input/CurrencyInput";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { setCategoryCarryover, setBudgetAmount, holdForNextMonth } from "@/budgets";
import { computeGoalAllocations, persistGoalAllocations } from "@/goals/apply";
import * as Haptics from "expo-haptics";
import { useCategories } from "@/presentation/hooks/useCategories";
import {
  useSheetValue,
  useSheetValueNumber,
  useSpreadsheetVersion,
} from "@/presentation/hooks/useSheetValue";
import { sheetForMonth, envelopeBudget } from "@/spreadsheet/bindings";
import { getSpreadsheet } from "@/spreadsheet/instance";
import { useRefreshControl } from "@/presentation/hooks/useRefreshControl";
import { useKeyboardHeight } from "@/presentation/hooks/useKeyboardHeight";
import { useExpressionMode } from "@/presentation/hooks/useExpressionMode";
import { useKeyboardBlur } from "@/presentation/hooks/useKeyboardBlur";
import { MAX_CENTS } from "@/lib/currency";
import { formatBalance, formatPrivacyAware } from "@/lib/format";
import {
  StripedProgressBar,
  ActualList,
  ActualSection,
  ScalableText,
} from "../../../../modules/actual-ui";
import { usePrivacyStore } from "@/stores/privacyStore";
import { useUndoStore } from "@/stores/undoStore";
import { computeProgressBar } from "@/goals/progressBar";
import { ProgressBar } from "@/presentation/components/atoms/ProgressBar";
import { inferGoalFromDef } from "@/goals";
import { getGoalProgressLabel } from "@/goals/progress";
import type { BudgetCategoryData, BudgetGroupData } from "@/budgets/types";

const BUDGET_ACCESSORY_ID = "budgetSharedCalcToolbar";

import { BudgetGroupHeader } from "@/presentation/components/budget/BudgetGroupHeader";
import { BudgetCategoryRow } from "@/presentation/components/budget/BudgetCategoryRow";
import { SReadyToAssignPill } from "@/presentation/swift-ui/molecules";
import { OverspentPill } from "@/presentation/components/budget/OverspentPill";
import { UncategorizedPill } from "@/presentation/components/budget/UncategorizedPill";
import { useUncategorizedCount } from "@/presentation/hooks/useUncategorizedCount";
import { Text } from "@/presentation/components/atoms/Text";
import { SText, SAmount, SPill } from "@/presentation/swift-ui/atoms";
import { SSectionHeader } from "@/presentation/swift-ui/molecules";
import { usePrefsStore } from "@/stores/prefsStore";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { BudgetListSkeleton } from "@/presentation/components/skeletons/BudgetListSkeleton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// Column widths — minimumScaleFactor handles overflow
const COL_BUDGETED = 90;
const COL_AVAILABLE = 95;

// ---------------------------------------------------------------------------
// Category row — native SwiftUI (simple: name + available pill)
// ---------------------------------------------------------------------------

function CategoryRowNative({
  catId,
  catName,
  sheet,
  isIncome,
  isEditing,
  editValue,
  expressionMode,
  expression,
  operandCents,
  catGoalDef,
  month,
  showBar = false,
  anyEditing = false,
  onPress,
}: {
  catId: string;
  catName: string;
  sheet: string;
  isIncome: boolean;
  isEditing: boolean;
  editValue?: number;
  expressionMode?: boolean;
  expression?: string;
  operandCents?: number;
  catGoalDef?: string | null;
  month: string;
  showBar?: boolean;
  anyEditing?: boolean;
  onPress: (catId: string, budgeted: number) => void;
}) {
  const { colors } = useTheme();
  const { t: tBudget } = useTranslation("budget");
  usePrivacyStore(); // subscribe to re-render on privacy toggle
  const budgeted = useSheetValueNumber(sheet, envelopeBudget.catBudgeted(catId));
  const spent = useSheetValueNumber(sheet, envelopeBudget.catSpent(catId));
  const balance = useSheetValueNumber(sheet, envelopeBudget.catBalance(catId));
  const carryoverRaw = useSheetValue(sheet, envelopeBudget.catCarryover(catId));
  const carryover = carryoverRaw === true || carryoverRaw === 1;

  const balanceColor =
    balance < 0 ? colors.negative : balance > 0 ? colors.positive : colors.textMuted;
  const pillBg =
    balance < 0
      ? colors.negativeSubtle
      : balance > 0
        ? colors.positiveSubtle
        : colors.cardBackground;

  if (isIncome) {
    return (
      <HStack modifiers={[padding({ trailing: 16 }), listRowBackground(colors.cardBackground)]}>
        <SText variant="bodyMedium" lines={1}>
          {catName}
        </SText>
        <Spacer />
        <SAmount
          value={spent}
          variant="bodyMedium"
          color={colors.positive}
          lines={1}
          modifiers={[frame({ width: COL_AVAILABLE, alignment: "trailing" })]}
        />
      </HStack>
    );
  }

  // Progress bar computation
  const carryIn = balance - budgeted - spent;
  const goalInfo = catGoalDef ? inferGoalFromDef(catGoalDef, month, carryIn) : null;
  const fullCat = {
    id: catId,
    name: catName,
    budgeted,
    spent,
    balance,
    carryIn,
    carryover,
    goal: goalInfo?.goal ?? null,
    longGoal: goalInfo?.longGoal ?? false,
    goalDef: catGoalDef ?? null,
    hidden: false,
  };
  const bar = !isIncome ? computeProgressBar(fullCat) : null;
  const barColor = bar
    ? bar.barStatus === "overspent"
      ? colors.vibrantNegative
      : bar.barStatus === "caution"
        ? colors.vibrantWarning
        : bar.barStatus === "healthy"
          ? colors.vibrantPositive
          : colors.textMuted
    : colors.textMuted;
  const progressLabel = bar
    ? getGoalProgressLabel(fullCat, tBudget as unknown as (key: string) => string)
    : "";

  const displayBudgeted = isEditing ? (editValue ?? 0) : budgeted;
  const budgetedColor = isEditing
    ? colors.primary
    : budgeted !== 0
      ? colors.textPrimary
      : colors.textMuted;

  const showExpression = isEditing && expressionMode && expression;
  const baseText = showExpression
    ? formatBalance(parseFloat(expression.slice(0, -1)) * 100 || 0)
    : formatPrivacyAware(displayBudgeted);
  const op = showExpression ? expression.slice(-1) : "";
  const operandText = showExpression ? `${op}${formatBalance(operandCents ?? 0)}` : "";

  return (
    <VStack
      alignment="trailing"
      modifiers={[
        listRowBackground(colors.cardBackground),
        contentShape(shapes.rectangle()),
        onTapGesture(() => onPress(catId, budgeted)),
      ]}
    >
      <HStack spacing={8}>
        <SText variant="bodyMedium" lines={1}>
          {catName}
        </SText>
        <Spacer />
        {
          <VStack alignment="trailing" modifiers={[opacity(!showBar || anyEditing ? 1 : 0)]}>
            <ScalableText
              text={baseText}
              fontSize={12}
              fontWeight="semibold"
              color={showExpression ? colors.textMuted : budgetedColor}
              maxLines={1}
              minScale={0.5}
              monoDigits
              letterSpacing={-0.5}
              modifiers={[frame({ width: COL_BUDGETED, alignment: "trailing" })]}
            />
            {showExpression && (
              <ScalableText
                text={operandText}
                fontSize={12}
                fontWeight="semibold"
                color={colors.primary}
                monoDigits
              />
            )}
          </VStack>
        }
        <VStack modifiers={[frame({ width: COL_AVAILABLE, alignment: "trailing" })]}>
          <SPill
            value={balance}
            variant="caption"
            bgColor={bar && bar.barStatus !== "neutral" ? barColor : undefined}
            textColor={
              bar && bar.barStatus === "overspent"
                ? colors.vibrantPillTextNegative
                : bar && bar.barStatus !== "neutral"
                  ? colors.vibrantPillText
                  : undefined
            }
          />
        </VStack>
      </HStack>
      {showBar && bar && (
        <StripedProgressBar
          spent={bar.spent}
          available={bar.available}
          color={barColor}
          overspent={bar.overspent}
          striped={bar.striped}
          barHeight={6}
          modifiers={[padding({ top: 6 })]}
        />
      )}
      {showBar && bar && progressLabel !== "" && (
        <HStack>
          <SText variant="captionSm" color={colors.textMuted} modifiers={[padding({ top: 8 })]}>
            {progressLabel}
          </SText>
          <Spacer />
        </HStack>
      )}
    </VStack>
  );
}

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
  const colorScheme = useColorScheme();
  const { showProgressBars, toggleProgressBars } = usePrefsStore();
  const { privacyMode, toggle: togglePrivacy } = usePrivacyStore();
  const isLocalOnly = usePrefsStore((s) => s.isLocalOnly);
  const goalsEnabled = useFeatureFlag("goalTemplatesEnabled");
  const uncategorizedCount = useUncategorizedCount();

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

  const fabCollapsed = useSharedValue(false);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set([HIDDEN_GROUP_ID]));

  // -- Shared hidden input: editing state --
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState(0);
  const sharedInputRef = useRef<TextInput>(null);
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

  function handleRowPress(catId: string, budgeted: number) {
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

  // displaySections: use baseSections directly to avoid re-rendering the entire
  // SectionList on every spreadsheet change. Individual rows handle value updates
  // via useSheetValue, preventing keyboard focus loss during background sync.
  const displaySections = baseSections;

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

  function handleResetHold() {
    Alert.alert(t("resetHoldConfirmTitle"), t("resetHoldConfirmMessage"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("resetHold"),
        style: "destructive",
        onPress: () => holdForNextMonth(month, 0, toBudget),
      },
    ]);
  }

  async function handleAutoAssign() {
    try {
      const result = await computeGoalAllocations(month, true);
      if (result.applied === 0) {
        Alert.alert(t("noChangesTitle"), t("noChangesMessage"));
        return;
      }
      await persistGoalAllocations(month, result.allocations);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert(t("errorTitle"), t("autoAssignError"));
    }
  }

  const showBudgetedColumn = !goalsEnabled || !showProgressBars || editingCatId !== null;

  function dismissEdit() {
    sharedInputRef.current?.blur();
    Keyboard.dismiss();
  }

  return (
    <>
      <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
        {dataReady && (
          <View
            style={{
              paddingTop: spacing.sm,
              paddingBottom: spacing.xs,
              paddingHorizontal: spacing.lg,
              gap: spacing.sm,
            }}
          >
            <Host matchContents colorScheme={colorScheme === "dark" ? "dark" : "light"}>
              <SReadyToAssignPill
                amount={toBudget}
                buffered={buffered}
                goalsEnabled={goalsEnabled}
                onMoveToBudget={() =>
                  router.push({
                    pathname: "/(auth)/budget/move-money",
                    params: { source: "toBudget" },
                  })
                }
                onHold={() =>
                  router.push({
                    pathname: "/(auth)/budget/hold",
                    params: { current: String(buffered), maxAmount: String(toBudget + buffered) },
                  })
                }
                onAutoAssign={handleAutoAssign}
                onResetHold={handleResetHold}
              />
            </Host>
            {uncategorizedCount > 0 && (
              <UncategorizedPill
                count={uncategorizedCount}
                onPress={() =>
                  router.push({
                    pathname: "/(auth)/(tabs)/(spending)/search",
                    params: { initialFilter: "uncategorized" },
                  })
                }
              />
            )}
            {overspentCount > 0 && (
              <OverspentPill count={overspentCount} onPress={handleOverspentPress} />
            )}
          </View>
        )}

        {!dataReady ? (
          <BudgetListSkeleton />
        ) : (
          <Host style={{ flex: 1 }} colorScheme={colorScheme === "dark" ? "dark" : "light"}>
            <ActualList
              listStyleType="plain"
              sectionSpacing={0}
              modifiers={[
                refreshable(async () => {
                  await refreshControlProps.onRefresh();
                }),
              ]}
            >
              {/* Budget groups */}
              {displaySections.map((section) => (
                <ActualSection
                  key={section.key}
                  isExpanded={!collapsedGroups.has(section.group.id)}
                  headerBackground={colors.pageBackground}
                  onIsExpandedChange={(expanded) => {
                    dismissEdit();
                    if (expanded) {
                      setCollapsedGroups((prev) => {
                        const next = new Set(prev);
                        next.delete(section.group.id);
                        return next;
                      });
                    } else {
                      setCollapsedGroups((prev) => new Set(prev).add(section.group.id));
                    }
                  }}
                  header={
                    <SSectionHeader
                      group={section.group}
                      sheet={sheet}
                      showBar={goalsEnabled && showProgressBars}
                      anyEditing={editingCatId !== null}
                    />
                  }
                >
                  {section.data.map((cat, idx) => (
                    <ContextMenu key={cat.id}>
                      <ContextMenu.Trigger>
                        <CategoryRowNative
                          catId={cat.id}
                          catName={cat.name}
                          sheet={sheet}
                          isIncome={section.group.is_income}
                          isEditing={editingCatId === cat.id}
                          editValue={editingCatId === cat.id ? editValue : undefined}
                          expressionMode={editingCatId === cat.id && expr.expressionMode}
                          expression={editingCatId === cat.id ? expr.expression : ""}
                          operandCents={editingCatId === cat.id ? expr.operandCents : 0}
                          catGoalDef={cat.goalDef}
                          month={month}
                          showBar={goalsEnabled && showProgressBars}
                          anyEditing={editingCatId !== null}
                          onPress={handleRowPress}
                        />
                      </ContextMenu.Trigger>
                      <ContextMenu.Items>
                        <SUIButton
                          label="Details"
                          systemImage="info.circle"
                          onPress={() => handleCategoryDetails(cat.id)}
                        />
                        <SUIButton
                          label="Move Money"
                          systemImage="arrow.left.arrow.right"
                          onPress={() => {
                            const bal =
                              (getSpreadsheet().getValue(
                                sheet,
                                envelopeBudget.catBalance(cat.id),
                              ) as number) ?? 0;
                            handleMoveMoney(cat.id, cat.name, bal);
                          }}
                        />
                        <SUIButton
                          label="View Transactions"
                          systemImage="chart.line.uptrend.xyaxis"
                          onPress={() => handleViewTransactions(cat.id, cat.name)}
                        />
                        <SUIButton
                          label="Budget Movements"
                          systemImage="clock.arrow.trianglehead.counterclockwise.rotate.90"
                          onPress={() => handleBudgetNotes(cat.name)}
                        />
                      </ContextMenu.Items>
                    </ContextMenu>
                  ))}
                </ActualSection>
              ))}
            </ActualList>
          </Host>
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

      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          icon="slider.horizontal.3"
          onPress={() => router.push("/(auth)/budget/edit")}
        />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
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
          <Stack.Toolbar.MenuAction
            icon="arrow.uturn.backward"
            onPress={async () => {
              await useUndoStore.getState().undo();
            }}
          >
            Undo
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon={privacyMode ? "eye" : "eye.slash"}
            onPress={togglePrivacy}
          >
            {privacyMode ? "Show Amounts" : "Hide Amounts"}
          </Stack.Toolbar.MenuAction>
          {!isLocalOnly && (
            <Stack.Toolbar.MenuAction
              icon="arrow.2.squarepath"
              onPress={() => router.push("/(auth)/change-budget")}
            >
              Switch Budget
            </Stack.Toolbar.MenuAction>
          )}
          <Stack.Toolbar.MenuAction
            icon="gearshape"
            onPress={() => router.push("/(auth)/settings")}
          >
            Settings
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
    </>
  );
}
