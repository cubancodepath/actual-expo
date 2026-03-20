import { Pressable, View } from "react-native";
import { EaseView } from "react-native-ease";
import { Icon } from "../atoms/Icon";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "../atoms/Text";
import { Amount } from "../atoms/Amount";
import { useSheetValueNumber } from "../../hooks/useSheetValue";
import { envelopeBudget } from "../../../spreadsheet/bindings";
import type { BudgetGroupData } from "../../../budgets/types";
import { BUDGET_COLUMNS } from "./BudgetCategoryRow";

interface BudgetGroupHeaderProps {
  group: BudgetGroupData;
  sheet: string;
  isCollapsed: boolean;
  onToggle: () => void;
  showBudgetedColumn?: boolean;
}

export function BudgetGroupHeader({
  group,
  sheet,
  isCollapsed,
  onToggle,
  showBudgetedColumn = true,
}: BudgetGroupHeaderProps) {
  const { t } = useTranslation("budget");
  const { colors, spacing } = useTheme();

  // Subscribe to this group's spreadsheet cells
  const budgeted = useSheetValueNumber(sheet, envelopeBudget.groupBudgeted(group.id));
  const spent = useSheetValueNumber(sheet, envelopeBudget.groupSpent(group.id));
  const balance = useSheetValueNumber(sheet, envelopeBudget.groupBalance(group.id));

  const balanceColor = group.is_income
    ? colors.positive
    : balance < 0
      ? colors.negative
      : balance > 0
        ? colors.positive
        : colors.textMuted;

  const balanceValue = group.is_income ? spent : balance;
  const paddingH = spacing.lg + spacing.lg;

  return (
    <View style={{ backgroundColor: colors.pageBackground }}>
      {/* Column labels */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: paddingH,
          paddingTop: spacing.lg,
        }}
      >
        <View style={{ flex: 1 }} />
        {(showBudgetedColumn || isCollapsed) && !group.is_income && (
          <Text
            variant="captionSm"
            color={colors.textMuted}
            style={{ width: BUDGET_COLUMNS.budgeted, textAlign: "right", fontWeight: "600" }}
          >
            {t("columnBudgeted")}
          </Text>
        )}
        <Text
          variant="captionSm"
          color={colors.textMuted}
          style={{
            width: BUDGET_COLUMNS.available,
            textAlign: "center",
            fontWeight: "600",
            paddingLeft: spacing.sm,
          }}
        >
          {t("columnAvailable")}
        </Text>
      </View>
      {/* Group info row */}
      <Pressable
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: paddingH,
          paddingTop: spacing.xs,
          paddingBottom: spacing.md,
          gap: 6,
        }}
        onPress={onToggle}
      >
        <EaseView
          animate={{ rotate: isCollapsed ? -90 : 0 }}
          transition={{ type: "timing", duration: 250, easing: "easeInOut" }}
        >
          <Icon name="chevronDown" size={14} color={colors.textMuted} />
        </EaseView>
        <Text
          variant="captionSm"
          color={colors.textSecondary}
          style={{ flex: 1, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700" }}
          numberOfLines={1}
        >
          {group.name}
        </Text>
        {(showBudgetedColumn || isCollapsed) && !group.is_income && (
          <EaseView
            animate={{ opacity: showBudgetedColumn || isCollapsed ? 1 : 0 }}
            transition={{ type: "timing", duration: 200, easing: "easeInOut" }}
            style={{ width: BUDGET_COLUMNS.budgeted, alignItems: "flex-end" }}
          >
            <Amount
              value={budgeted}
              variant="caption"
              color={budgeted !== 0 ? colors.textSecondary : colors.textMuted}
              weight="600"
            />
          </EaseView>
        )}
        <View style={{ width: BUDGET_COLUMNS.available, alignItems: "center" }}>
          <Amount value={balanceValue} variant="caption" color={balanceColor} weight="600" />
        </View>
      </Pressable>
    </View>
  );
}
