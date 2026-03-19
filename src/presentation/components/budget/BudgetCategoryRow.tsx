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

  // Centralized progress bar + pill computation
  const bar = goalsEnabled ? computeProgressBar(cat) : null;

  const STATUS_COLORS: Record<BarStatus, { bg: string; text: string; bar: string }> = {
    healthy: { bg: colors.budgetHealthyBg, text: colors.budgetHealthy, bar: colors.positive },
    caution: { bg: colors.budgetCautionBg, text: colors.budgetCaution, bar: colors.warning },
    overspent: { bg: colors.budgetOverspentBg, text: colors.budgetOverspent, bar: colors.negative },
    neutral: { bg: colors.cardBackground, text: colors.textMuted, bar: colors.textMuted },
  };

  const pillBg = bar ? STATUS_COLORS[bar.pillStatus].bg : STATUS_COLORS.neutral.bg;
  const pillText = bar ? STATUS_COLORS[bar.pillStatus].text : STATUS_COLORS.neutral.text;
  const barColor = bar ? STATUS_COLORS[bar.barStatus].bar : colors.positive;

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
      }}
      onPress={onPress}
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
          spent={bar?.spent ?? 0}
          available={bar?.available ?? 0}
          color={barColor}
          overspent={bar?.overspent ?? false}
          striped={bar?.striped ?? true}
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

  const carryoverLabel = cat.carryover
    ? t("removeOverspendingRollover")
    : t("rolloverOverspending");

  return (
    <ContextMenu style={insetStyle}>
      <ContextMenu.Trigger>{pressableContent}</ContextMenu.Trigger>
      <ContextMenu.Content>
        <ContextMenu.Item key="details" onSelect={() => onCategoryDetails?.(cat)}>
          <ContextMenu.ItemTitle>{t("categoryDetails")}</ContextMenu.ItemTitle>
          <ContextMenu.ItemIcon ios={{ name: "info.circle" }} />
        </ContextMenu.Item>
        <ContextMenu.Item key="move" onSelect={() => onMoveMoney?.(cat)}>
          <ContextMenu.ItemTitle>{t("moveMoney")}</ContextMenu.ItemTitle>
          <ContextMenu.ItemIcon ios={{ name: "arrow.left.arrow.right" }} />
        </ContextMenu.Item>
        <ContextMenu.Item key="carryover" onSelect={() => onToggleCarryover?.(cat)}>
          <ContextMenu.ItemTitle>{carryoverLabel}</ContextMenu.ItemTitle>
          <ContextMenu.ItemIcon
            ios={{ name: cat.carryover ? "arrow.uturn.backward" : "arrow.clockwise" }}
          />
        </ContextMenu.Item>
        <ContextMenu.Item key="transactions" onSelect={() => onViewTransactions?.(cat)}>
          <ContextMenu.ItemTitle>{t("viewTransactions")}</ContextMenu.ItemTitle>
          <ContextMenu.ItemIcon ios={{ name: "chart.line.uptrend.xyaxis" }} />
        </ContextMenu.Item>
        <ContextMenu.Item key="notes" onSelect={() => onBudgetNotes?.(cat)}>
          <ContextMenu.ItemTitle>{t("budgetMovements")}</ContextMenu.ItemTitle>
          <ContextMenu.ItemIcon
            ios={{ name: "clock.arrow.trianglehead.counterclockwise.rotate.90" }}
          />
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu>
  );
});
