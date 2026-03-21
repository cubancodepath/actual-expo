import { View } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "../atoms/Text";
import { Amount } from "../atoms/Amount";
import { useSheetValueNumber } from "../../hooks/useSheetValue";
import { envelopeBudget } from "../../../spreadsheet/bindings";
import type { BudgetGroupData } from "../../../budgets/types";

interface BudgetGroupHeaderProps {
  group: BudgetGroupData;
  sheet: string;
  isCollapsed: boolean;
  onToggle: () => void;
  showBudgetedColumn?: boolean;
}

export function BudgetGroupHeader({ group, sheet }: BudgetGroupHeaderProps) {
  const { colors } = useTheme();

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

  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Text
        variant="captionSm"
        color={colors.textSecondary}
        style={{ flex: 1, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700" }}
        numberOfLines={1}
      >
        {group.name}
      </Text>
      <Amount
        value={balanceValue}
        variant="caption"
        color={balanceColor}
        weight="600"
        style={{ fontVariant: ["tabular-nums"] }}
      />
    </View>
  );
}
