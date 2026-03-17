import { memo } from "react";
import { Platform, Pressable, View } from "react-native";
import * as ContextMenu from "zeego/context-menu";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "../atoms/Text";
import { Amount } from "../atoms/Amount";
import { formatPrivacyAware } from "../../../lib/format";
import { formatCents } from "../../../lib/currency";
import { getGoalProgress, getGoalProgressLabel } from "../../../goals/progress";
import { parseGoalDef } from "../../../goals";
import { ProgressBar } from "../atoms/ProgressBar";
import { useFeatureFlag } from "../../../hooks/useFeatureFlag";
import { useCursorBlink } from "../../hooks/useCursorBlink";
import { CurrencyAmountDisplay } from "../currency-input/CurrencyAmountDisplay";
import type { BudgetCategory } from "../../../budgets/types";

/** Shared column widths for table-style alignment across header, rows, and group headers. */
export const BUDGET_COLUMNS = {
  budgeted: 90,
  available: 80,
} as const;

interface BudgetCategoryRowProps {
  cat: BudgetCategory;
  isIncome: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onLongPress: (cat: BudgetCategory) => void;
  onCategoryDetails?: (cat: BudgetCategory) => void;
  onMoveMoney?: (cat: BudgetCategory) => void;
  onToggleCarryover?: (cat: BudgetCategory) => void;
  onViewTransactions?: (cat: BudgetCategory) => void;
  onBudgetNotes?: (cat: BudgetCategory) => void;
  /** Whether this row is currently being edited via the shared input. */
  isEditing: boolean;
  /** The value while editing, passed from parent. */
  editValue?: number;
  /** Whether the shared input is in expression mode for this row. */
  expressionMode?: boolean;
  /** Expression string (left operand + operator, e.g. "56.00+"). */
  expression?: string;
  /** Called when the row is tapped (to start/toggle editing). */
  onPress: () => void;
  /** Whether to show progress bars and goal text (default true). */
  showProgressBar?: boolean;
  /** Whether to show the budgeted column (Amount or input). */
  showBudgetedColumn?: boolean;
}

export const BudgetCategoryRow = memo(function BudgetCategoryRow({
  cat,
  isIncome,
  isFirst = false,
  isLast = false,
  onLongPress,
  onCategoryDetails,
  onMoveMoney,
  onToggleCarryover,
  onViewTransactions,
  onBudgetNotes,
  isEditing,
  editValue,
  expressionMode = false,
  expression = "",
  onPress,
  showProgressBar = true,
  showBudgetedColumn = true,
}: BudgetCategoryRowProps) {
  const { t } = useTranslation("budget");
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const goalsEnabled = useFeatureFlag("goalTemplatesEnabled");
  const { renderCursor } = useCursorBlink(isEditing);

  const insetStyle = {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.cardBackground,
    borderTopLeftRadius: isFirst ? br.lg : 0,
    borderTopRightRadius: isFirst ? br.lg : 0,
    borderBottomLeftRadius: isLast ? br.lg : 0,
    borderBottomRightRadius: isLast ? br.lg : 0,
  };

  // ── Income row (simple) ──
  if (isIncome) {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: spacing.lg,
          paddingVertical: 13,
          minHeight: 44,
          ...insetStyle,
        }}
      >
        <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
          {cat.name}
        </Text>
        <View style={{ width: BUDGET_COLUMNS.available, alignItems: "flex-end" }}>
          <Amount value={cat.spent} variant="body" color={colors.positive} weight="500" />
        </View>
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
      </View>
    );
  }

  // ── Expense row ──

  const hasGoal = goalsEnabled && cat.goal !== null && cat.goal > 0;
  const templates = hasGoal ? parseGoalDef(cat.goalDef) : [];
  const primaryTemplate = templates[0];

  // Detect limit-type goals (spending cap semantics)
  const isLimitGoal =
    hasGoal &&
    !!primaryTemplate &&
    (primaryTemplate.type === "limit" ||
      primaryTemplate.type === "refill" ||
      (primaryTemplate.type === "simple" &&
        primaryTemplate.monthly === 0 &&
        !!primaryTemplate.limit));

  // Detect sinking funds (by/spend) — need total target for cumulative bar
  const sinkingFundTotal =
    hasGoal &&
    !isLimitGoal &&
    !cat.longGoal &&
    primaryTemplate &&
    (primaryTemplate.type === "by" || primaryTemplate.type === "spend")
      ? Math.round(primaryTemplate.amount * 100)
      : 0;

  // Progress bar values (computed early for pill coloring)
  const spentAbs = Math.abs(cat.spent);
  const budgetedAbs = Math.abs(cat.budgeted);

  // Available badge colors — goal-aware
  let pillBg: string;
  let pillText: string;

  if (isLimitGoal) {
    // Limit goals: green = under limit, yellow = approaching, red = over
    const ratio = spentAbs / cat.goal!;
    pillBg =
      ratio >= 1
        ? colors.budgetOverspentBg
        : ratio >= 0.8
          ? colors.budgetCautionBg
          : colors.budgetHealthyBg;
    pillText =
      ratio >= 1
        ? colors.budgetOverspent
        : ratio >= 0.8
          ? colors.budgetCaution
          : colors.budgetHealthy;
  } else if (hasGoal) {
    const funded = cat.longGoal ? cat.balance >= cat.goal! : cat.budgeted >= cat.goal!;
    pillBg =
      cat.balance < 0
        ? colors.budgetOverspentBg
        : funded
          ? colors.budgetHealthyBg
          : colors.budgetCautionBg;
    pillText =
      cat.balance < 0
        ? colors.budgetOverspent
        : funded
          ? colors.budgetHealthy
          : colors.budgetCaution;
  } else {
    pillBg =
      cat.balance > 0
        ? colors.budgetHealthyBg
        : cat.balance < 0
          ? colors.budgetOverspentBg
          : colors.cardBackground;
    pillText =
      cat.balance > 0
        ? colors.budgetHealthy
        : cat.balance < 0
          ? colors.budgetOverspent
          : colors.textMuted;
  }

  // ── Progress bar values (YNAB-style) ──
  //
  // Two bar modes:
  //   1. Savings goals (longGoal) — bar = balance / goal (how much saved toward target)
  //   2. Spending (everything else) — bar = spent (dark) + available (light) vs budget
  //
  // ProgressBar props:
  //   spent    = darker portion (amount consumed or saved)
  //   available = total filled portion (spent + remaining)
  //   overspent = full bar red with pulse

  let barSpent = 0; // darker layer width 0–1
  let barAvailable = 0; // total filled width 0–1 (includes barSpent)
  let barColor = colors.positive;
  let barOverspent = false;

  if (isLimitGoal) {
    // Spending cap: spent vs limit
    const base = cat.goal!;
    const ratio = spentAbs / base;
    barSpent = Math.min(ratio, 1);
    barAvailable = 1; // full bar = the limit budget
    barOverspent = ratio >= 1;
    barColor = ratio >= 1 ? colors.negative : ratio >= 0.8 ? colors.warning : colors.positive;
  } else if (hasGoal && cat.longGoal) {
    // Long-term savings goal (#goal, refill): balance / goal
    // Single solid bar showing savings progress — no spent/available split
    const base = cat.goal!;
    const savedPct = Math.min(Math.max(cat.balance / base, 0), 1);
    barSpent = savedPct; // "spent" layer = saved amount (solid bar)
    barAvailable = savedPct; // same width — no lighter portion behind it
    barOverspent = cat.balance < 0;
    barColor = barOverspent ? colors.negative : colors.positive;
  } else if (hasGoal && sinkingFundTotal > 0) {
    // Sinking fund (by/spend): bar = cumulative balance / total target, color = on track status
    const savedPct = Math.min(Math.max(cat.balance / sinkingFundTotal, 0), 1);
    barSpent = savedPct;
    barAvailable = savedPct;
    barOverspent = cat.balance < 0;
    const funded = cat.budgeted >= cat.goal!;
    barColor = barOverspent ? colors.negative : funded ? colors.positive : colors.warning;
  } else if (hasGoal) {
    // Monthly goal (simple, periodic): spending progress vs goal
    const base = cat.goal!;
    barSpent = Math.min(spentAbs / base, 1);
    barAvailable = Math.min(Math.max((spentAbs + cat.balance) / base, 0), 1);
    barOverspent = cat.balance < 0;
    const funded = cat.budgeted >= base;
    barColor = barOverspent ? colors.negative : funded ? colors.positive : colors.warning;
  } else if (budgetedAbs > 0 || cat.balance !== 0) {
    // No goal: spending progress vs budgeted (or balance from carryover)
    const base = budgetedAbs > 0 ? budgetedAbs : Math.abs(cat.balance);
    barSpent = base > 0 ? Math.min(spentAbs / base, 1) : 0;
    barAvailable = base > 0 ? Math.min(Math.max((spentAbs + cat.balance) / base, 0), 1) : 0;
    barOverspent = cat.balance < 0;
    barColor = barOverspent
      ? colors.negative
      : cat.balance > 0
        ? colors.positive
        : colors.textMuted;
  }

  const displayCents = isEditing ? (editValue ?? 0) : cat.budgeted;
  const displayColor = isEditing
    ? colors.primary
    : cat.budgeted !== 0
      ? colors.textPrimary
      : colors.textMuted;

  const pressableContent = (
    <Pressable
      style={{
        paddingHorizontal: spacing.lg,
        paddingTop: 12,
        paddingBottom: 10,
        minHeight: 44,
        ...insetStyle,
      }}
      onPress={onPress}
      onLongPress={Platform.OS === "android" ? () => onLongPress(cat) : undefined}
      delayLongPress={400}
    >
      {/* Line 1: Name + Budget input + Available pill */}
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            overflow: "hidden",
          }}
        >
          <Text variant="body" numberOfLines={1} style={{ flexShrink: 1 }}>
            {cat.name}
          </Text>
          {cat.carryover && (
            <Text variant="caption" color={colors.primary} style={{ fontWeight: "700" }}>
              ↻
            </Text>
          )}
        </View>
        {showBudgetedColumn ? (
          <View style={{ width: BUDGET_COLUMNS.budgeted, alignItems: "flex-end" }}>
            {isEditing && expressionMode ? (
              <>
                {/* Line 1: left operand */}
                <Text
                  variant="body"
                  style={{
                    fontWeight: "600",
                    fontVariant: ["tabular-nums"],
                    color: colors.textMuted,
                  }}
                  numberOfLines={1}
                >
                  {formatCents(parseFloat(expression.slice(0, -1)) * 100 || 0)}
                </Text>
                {/* Line 2: operator + right operand (editValue) + cursor */}
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text
                    variant="body"
                    style={{
                      fontWeight: "600",
                      fontVariant: ["tabular-nums"],
                      color: colors.primary,
                    }}
                  >
                    {expression.slice(-1)}
                    {formatCents(Math.abs(editValue ?? 0))}
                  </Text>
                  {renderCursor(
                    { width: 1.5, height: 16, marginLeft: 1, borderRadius: 1 },
                    colors.primary,
                  )}
                </View>
              </>
            ) : isEditing ? (
              <CurrencyAmountDisplay
                amount={displayCents}
                isActive
                expressionMode={false}
                fullExpression=""
                color={displayColor}
                primaryColor={colors.primary}
              />
            ) : (
              <Amount
                value={cat.budgeted}
                variant="body"
                color={cat.budgeted !== 0 ? colors.textPrimary : colors.textMuted}
                weight="600"
                style={{ fontVariant: ["tabular-nums"] }}
              />
            )}
          </View>
        ) : null}
        <View
          accessibilityLabel={`${formatPrivacyAware(cat.balance)} available`}
          style={{
            width: BUDGET_COLUMNS.available,
            flexShrink: 0,
            justifyContent: "center",
            alignItems: "center",
            paddingLeft: spacing.sm,
          }}
        >
          <View
            style={{
              backgroundColor: pillBg,
              borderRadius: 100,
              paddingHorizontal: 10,
              paddingVertical: 3,
              alignItems: "center",
              flexDirection: "row",
              flexWrap: "nowrap",
            }}
          >
            <Amount
              value={cat.balance}
              variant="captionSm"
              color={pillText}
              weight="700"
              numberOfLines={1}
              adjustsFontSizeToFit
            />
          </View>
        </View>
      </View>

      {/* Line 2: Progress bar (YNAB-style spending progress) */}
      {showProgressBar && goalsEnabled && (
        <ProgressBar
          spent={barSpent}
          available={barAvailable}
          color={barColor}
          overspent={barOverspent}
          striped={!(cat.longGoal || sinkingFundTotal > 0)}
          style={{ marginTop: 6 }}
        />
      )}

      {/* Line 3: Progress text (informational) */}
      {showProgressBar && goalsEnabled && (
        <View
          accessible
          accessibilityLabel={getGoalProgressLabel(cat, t as (key: string) => string)}
          style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 3 }}
        >
          {getGoalProgress(cat).map((seg, i) =>
            "key" in seg ? (
              <Text key={i} variant="captionSm" color={colors.textMuted}>
                {t(seg.key as any)}
              </Text>
            ) : (
              <Amount
                key={i}
                value={seg.amount}
                variant="captionSm"
                color={colors.textMuted}
                colored={false}
              />
            ),
          )}
        </View>
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

  if (Platform.OS === "ios") {
    const carryoverLabel = cat.carryover
      ? t("removeOverspendingRollover")
      : t("rolloverOverspending");
    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger>{pressableContent}</ContextMenu.Trigger>
        <ContextMenu.Content>
          <ContextMenu.Item key="category-details" onSelect={() => onCategoryDetails?.(cat)}>
            <ContextMenu.ItemTitle>{t("categoryDetails")}</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: "info.circle" }} />
          </ContextMenu.Item>
          <ContextMenu.Item key="move-money" onSelect={() => onMoveMoney?.(cat)}>
            <ContextMenu.ItemTitle>{t("moveMoney")}</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: "arrow.left.arrow.right" }} />
          </ContextMenu.Item>
          <ContextMenu.Item key="toggle-carryover" onSelect={() => onToggleCarryover?.(cat)}>
            <ContextMenu.ItemTitle>{carryoverLabel}</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon
              ios={{ name: cat.carryover ? "arrow.uturn.backward" : "arrow.clockwise" }}
            />
          </ContextMenu.Item>
          <ContextMenu.Item key="view-transactions" onSelect={() => onViewTransactions?.(cat)}>
            <ContextMenu.ItemTitle>{t("viewTransactions")}</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: "chart.line.uptrend.xyaxis" }} />
          </ContextMenu.Item>
          <ContextMenu.Item key="budget-notes" onSelect={() => onBudgetNotes?.(cat)}>
            <ContextMenu.ItemTitle>{t("budgetMovements")}</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon
              ios={{ name: "clock.arrow.trianglehead.counterclockwise.rotate.90" }}
            />
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Root>
    );
  }

  return pressableContent;
});
