/**
 * IncomeGroup — collapsible income group header + category list for the budget table.
 *
 * Mirrors desktop-client/src/components/mobile/budget/IncomeGroup.tsx.
 * Shows the group name, total received this month, and a collapse chevron.
 */

import { memo } from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "@/design-system/providers/ThemeProvider";
import { Text } from "@/design-system/atoms/Text";
import { Amount } from "@/design-system/atoms/Amount";
import { Icon } from "@/design-system/atoms/Icon";
import { useSheetValueNumber } from "@/hooks/useSheetValue";
import { envelopeBudget } from "@/core/domain/spreadsheet/bindings";
import type { BudgetGroupData, BudgetCategoryData } from "@/core/domain/budgets/types";
import { BUDGET_COLUMNS } from "./ExpenseCategoryListItem";
import { IncomeCategoryListItem } from "./IncomeCategoryListItem";

interface IncomeGroupProps {
  group: BudgetGroupData;
  categories: BudgetCategoryData[];
  sheet: string;
  month: string;
  isCollapsed: boolean;
  onToggleCollapse: (groupId: string) => void;
  onViewTransactions?: (catId: string, catName: string) => void;
  onToggleCarryover?: (catId: string, carryover: boolean) => void;
}

export const IncomeGroup = memo(function IncomeGroup({
  group,
  categories,
  sheet,
  month,
  isCollapsed,
  onToggleCollapse,
  onViewTransactions,
  onToggleCarryover,
}: IncomeGroupProps) {
  const { colors, spacing, borderWidth: bw, borderRadius: br } = useTheme();
  const totalReceived = useSheetValueNumber(sheet, envelopeBudget.groupSpent(group.id));

  return (
    <View style={{ marginTop: spacing.xl }}>
      {/* Column label row */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          paddingRight: spacing.md,
          paddingBottom: spacing.xs,
        }}
      >
        <Text
          variant="captionSm"
          color={colors.textMuted}
          style={{
            width: BUDGET_COLUMNS.available,
            textAlign: "right",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Received
        </Text>
      </View>

      {/* Group header */}
      <Pressable
        onPress={() => onToggleCollapse(group.id)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          backgroundColor: colors.headerBackground,
          borderRadius: br.sm,
          marginHorizontal: 0,
          opacity: group.hidden ? 0.5 : 1,
        }}
        accessibilityRole="button"
        accessibilityLabel={`Income group: ${group.name}`}
      >
        {/* Collapse chevron */}
        <View style={{ marginRight: spacing.xs }}>
          <Icon
            name={isCollapsed ? "chevronForward" : "chevronDown"}
            size={14}
            color={colors.textSecondary}
          />
        </View>

        {/* Group name */}
        <Text
          variant="captionSm"
          style={{
            flex: 1,
            textTransform: "uppercase",
            letterSpacing: 0.8,
            fontWeight: "700",
            color: colors.textSecondary,
          }}
          numberOfLines={1}
        >
          {group.name}
        </Text>

        {/* Total received */}
        <Amount
          value={totalReceived}
          variant="caption"
          color={totalReceived > 0 ? colors.positive : colors.textMuted}
          weight="600"
          style={{ fontVariant: ["tabular-nums"] }}
        />
      </Pressable>

      {/* Divider */}
      <View
        style={{
          height: bw.thin,
          backgroundColor: colors.divider,
          marginHorizontal: spacing.md,
        }}
      />

      {/* Category rows */}
      {!isCollapsed &&
        categories.map((cat, i) => (
          <View key={cat.id} style={{ paddingHorizontal: spacing.md }}>
            <IncomeCategoryListItem
              cat={cat}
              sheet={sheet}
              month={month}
              isLast={i === categories.length - 1}
              onViewTransactions={onViewTransactions}
              onToggleCarryover={onToggleCarryover}
            />
          </View>
        ))}

      {/* Bottom divider after group */}
      <View
        style={{
          height: bw.thin,
          backgroundColor: colors.divider,
          marginTop: spacing.sm,
        }}
      />
    </View>
  );
});
