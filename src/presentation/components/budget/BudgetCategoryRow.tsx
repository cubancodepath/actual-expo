import { memo } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ContextMenu } from "../atoms/ContextMenu";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "../atoms/Text";
import { Amount } from "../atoms/Amount";
import { formatPrivacyAware } from "../../../lib/format";
import { formatCents } from "../../../lib/currency";
import { getGoalProgress, getGoalProgressLabel } from "../../../goals/progress";
import { computeProgressBar, type BarStatus } from "../../../goals/progressBar";
import { ProgressBar } from "../atoms/ProgressBar";
import { useFeatureFlag } from "../../../hooks/useFeatureFlag";
import { useCursorBlink } from "../../hooks/useCursorBlink";
import { CurrencyAmountDisplay } from "../currency-input/CurrencyAmountDisplay";
import { useSheetValue, useSheetValueNumber } from "../../hooks/useSheetValue";
import { envelopeBudget } from "../../../spreadsheet/bindings";
import { inferGoalFromDef } from "../../../goals";
import type { BudgetCategoryData } from "../../../budgets/types";
import type { BudgetCategory } from "../../../budgets/types";

/** Shared column widths for table-style alignment across header, rows, and group headers. */
export const BUDGET_COLUMNS = {
  budgeted: 90,
  available: 80,
} as const;

interface BudgetCategoryRowProps {
  cat: BudgetCategoryData;
  sheet: string;
  month: string;
  isIncome: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onCategoryDetails?: (catId: string, catName: string) => void;
  onMoveMoney?: (catId: string, catName: string, balance: number) => void;
  onToggleCarryover?: (catId: string, carryover: boolean) => void;
  onViewTransactions?: (catId: string, catName: string) => void;
  onBudgetNotes?: (catName: string) => void;
  isEditing: boolean;
  editValue?: number;
  expressionMode?: boolean;
  expression?: string;
  onPress: (catId: string, budgeted: number, pageY: number) => void;
  showProgressBar?: boolean;
  showBudgetedColumn?: boolean;
}

export const BudgetCategoryRow = memo(function BudgetCategoryRow({
  cat,
  sheet,
  month,
  isIncome,
  isFirst = false,
  isLast = false,
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

  // Subscribe to this category's spreadsheet cells
  const budgeted = useSheetValueNumber(sheet, envelopeBudget.catBudgeted(cat.id));
  const spent = useSheetValueNumber(sheet, envelopeBudget.catSpent(cat.id));
  const balance = useSheetValueNumber(sheet, envelopeBudget.catBalance(cat.id));
  const carryoverRaw = useSheetValue(sheet, envelopeBudget.catCarryover(cat.id));
  const carryover = carryoverRaw === true || carryoverRaw === 1;
  const carryIn = balance - budgeted - spent;

  // Compute goal info from goalDef
  const goalInfo = cat.goalDef ? inferGoalFromDef(cat.goalDef, month, carryIn) : null;

  // Build a BudgetCategory-compatible object for progress bar/goal utilities
  const goal = goalInfo?.goal ?? null;
  const longGoal = goalInfo?.longGoal ?? false;
  const fullCat: BudgetCategory = {
    id: cat.id,
    name: cat.name,
    budgeted,
    spent,
    balance,
    carryIn,
    carryover,
    goal,
    longGoal,
    goalDef: cat.goalDef,
    hidden: cat.hidden,
  };

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
          <Amount value={spent} variant="body" color={colors.positive} weight="500" />
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

  const hasGoal = goalsEnabled && fullCat.goal !== null && fullCat.goal > 0;

  // Centralized progress bar + pill computation
  const bar = goalsEnabled ? computeProgressBar(fullCat) : null;

  // Sign-based color for neutral status (no goal set) — matches BudgetGroupHeader pattern
  const neutralText =
    balance < 0 ? colors.negative : balance > 0 ? colors.positive : colors.textMuted;

  const STATUS_COLORS: Record<BarStatus, { bg: string; text: string; bar: string }> = {
    healthy: { bg: colors.budgetHealthyBg, text: colors.budgetHealthy, bar: colors.positive },
    caution: { bg: colors.budgetCautionBg, text: colors.budgetCaution, bar: colors.warning },
    overspent: { bg: colors.budgetOverspentBg, text: colors.budgetOverspent, bar: colors.negative },
    neutral: { bg: colors.cardBackground, text: neutralText, bar: colors.textMuted },
  };

  // Use pillStatus for both pill and bar so they always match visually
  const status = bar?.pillStatus ?? "neutral";
  const pillBg = STATUS_COLORS[status].bg;
  const pillText = STATUS_COLORS[status].text;
  const barColor = STATUS_COLORS[status].bar;

  const displayCents = isEditing ? (editValue ?? 0) : budgeted;
  const displayColor = isEditing
    ? colors.primary
    : budgeted !== 0
      ? colors.textPrimary
      : colors.textMuted;

  const pressableContent = (
    <Pressable
      style={{
        paddingHorizontal: spacing.lg,
        paddingTop: 12,
        paddingBottom: 10,
        minHeight: 44,
      }}
      onPress={(e) => onPress(cat.id, budgeted, e.nativeEvent.pageY)}
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
          {carryover && (
            <Text variant="caption" color={colors.primary} style={{ fontWeight: "700" }}>
              ↻
            </Text>
          )}
        </View>
        {showBudgetedColumn || isEditing ? (
          <View style={{ width: BUDGET_COLUMNS.budgeted, alignItems: "flex-end" }}>
            {isEditing && expressionMode ? (
              <>
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
                value={budgeted}
                variant="body"
                color={budgeted !== 0 ? colors.textPrimary : colors.textMuted}
                weight="600"
                style={{ fontVariant: ["tabular-nums"] }}
              />
            )}
          </View>
        ) : null}
        <View
          accessibilityLabel={`${formatPrivacyAware(balance)} available`}
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
              value={balance}
              variant="captionSm"
              color={pillText}
              weight="700"
              showSign
              numberOfLines={1}
              adjustsFontSizeToFit
            />
          </View>
        </View>
      </View>

      {/* Line 2: Progress bar */}
      {showProgressBar && goalsEnabled && (
        <ProgressBar
          spent={bar?.spent ?? 0}
          available={bar?.available ?? 0}
          color={barColor}
          overspent={bar?.overspent ?? false}
          striped={bar?.striped ?? true}
          style={{ marginTop: 6 }}
        />
      )}

      {/* Line 3: Progress text */}
      {showProgressBar && goalsEnabled && (
        <View
          accessible
          accessibilityLabel={getGoalProgressLabel(fullCat, t as (key: string) => string)}
          style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 3 }}
        >
          {getGoalProgress(fullCat).map((seg, i) =>
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

  const carryoverLabel = carryover ? t("removeOverspendingRollover") : t("rolloverOverspending");

  return (
    <ContextMenu style={insetStyle}>
      <ContextMenu.Trigger>{pressableContent}</ContextMenu.Trigger>
      <ContextMenu.Content>
        <ContextMenu.Item key="details" onSelect={() => onCategoryDetails?.(cat.id, cat.name)}>
          <ContextMenu.ItemTitle>{t("categoryDetails")}</ContextMenu.ItemTitle>
          <ContextMenu.ItemIcon ios={{ name: "info.circle" }} />
        </ContextMenu.Item>
        <ContextMenu.Item key="move" onSelect={() => onMoveMoney?.(cat.id, cat.name, balance)}>
          <ContextMenu.ItemTitle>{t("moveMoney")}</ContextMenu.ItemTitle>
          <ContextMenu.ItemIcon ios={{ name: "arrow.left.arrow.right" }} />
        </ContextMenu.Item>
        <ContextMenu.Item key="carryover" onSelect={() => onToggleCarryover?.(cat.id, carryover)}>
          <ContextMenu.ItemTitle>{carryoverLabel}</ContextMenu.ItemTitle>
          <ContextMenu.ItemIcon
            ios={{ name: carryover ? "arrow.uturn.backward" : "arrow.clockwise" }}
          />
        </ContextMenu.Item>
        <ContextMenu.Item
          key="transactions"
          onSelect={() => onViewTransactions?.(cat.id, cat.name)}
        >
          <ContextMenu.ItemTitle>{t("viewTransactions")}</ContextMenu.ItemTitle>
          <ContextMenu.ItemIcon ios={{ name: "chart.line.uptrend.xyaxis" }} />
        </ContextMenu.Item>
        <ContextMenu.Item key="notes" onSelect={() => onBudgetNotes?.(cat.name)}>
          <ContextMenu.ItemTitle>{t("budgetMovements")}</ContextMenu.ItemTitle>
          <ContextMenu.ItemIcon
            ios={{ name: "clock.arrow.trianglehead.counterclockwise.rotate.90" }}
          />
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu>
  );
});
