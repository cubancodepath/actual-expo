/**
 * IncomeCategoryListItem — a row for an income category in the budget table.
 *
 * Mirrors the structure of desktop-client/src/components/mobile/budget/IncomeCategoryListItem.tsx
 * but implemented as a React Native component.
 *
 * Shows: category name | received amount
 * For envelope budgets, tapping the balance opens carryover options.
 * For tracking budgets, tapping shows the activity/transactions.
 */

import { memo } from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "@/design-system/providers/ThemeProvider";
import { Text } from "@/design-system/atoms/Text";
import { Amount } from "@/design-system/atoms/Amount";
import { Icon } from "@/design-system/atoms/Icon";
import { useSheetValueNumber } from "@/hooks/useSheetValue";
import { envelopeBudget } from "@/core/domain/spreadsheet/bindings";
import type { BudgetCategoryData } from "@/core/domain/budgets/types";
import { BUDGET_COLUMNS } from "./ExpenseCategoryListItem";

interface IncomeCategoryListItemProps {
  cat: BudgetCategoryData;
  sheet: string;
  month: string;
  isLast?: boolean;
  onViewTransactions?: (catId: string, catName: string) => void;
  onToggleCarryover?: (catId: string, carryover: boolean) => void;
}

export const IncomeCategoryListItem = memo(function IncomeCategoryListItem({
  cat,
  sheet,
  month: _month,
  isLast = false,
  onViewTransactions,
}: IncomeCategoryListItemProps) {
  const { colors, spacing, borderWidth: bw } = useTheme();

  const received = useSheetValueNumber(sheet, envelopeBudget.catSpent(cat.id));

  return (
    <Pressable
      onPress={() => onViewTransactions?.(cat.id, cat.name)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        backgroundColor: colors.cardBackground,
      }}
      accessibilityLabel={`${cat.name}: received ${received}`}
    >
      {/* Name */}
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Text
          variant="body"
          numberOfLines={1}
          style={{ flexShrink: 1, opacity: cat.hidden ? 0.4 : 1 }}
        >
          {cat.name}
        </Text>
        <Icon name="chevronForward" size={12} color={colors.textMuted} />
      </View>

      {/* Received amount */}
      <View style={{ width: BUDGET_COLUMNS.available, alignItems: "flex-end" }}>
        <Amount
          value={received}
          variant="body"
          color={received > 0 ? colors.positive : colors.textMuted}
          weight="500"
          numberOfLines={1}
          style={{ fontVariant: ["tabular-nums"] }}
        />
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
    </Pressable>
  );
});
