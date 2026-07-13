import { memo } from "react";
import { View } from "react-native";
import { Typography } from "heroui-native";
import { useSheetValueNumber } from "@/hooks/useSheetValue";
import { envelopeBudget } from "@/core/domain/spreadsheet/bindings";
import { Money } from "@/ui/Money";
import { AvailableChip } from "./AvailableChip";
import { COL_ASSIGNED, COL_AVAILABLE, NumericCell } from "./columns";

interface BudgetCategoryRowProps {
  catId: string;
  catName: string;
  sheet: string;
  isIncome: boolean;
}

/**
 * A single category row inside a group's card: name | Assigned | Available.
 * Read-only for now (editing the assigned amount comes later). Income rows only
 * show the amount received. Memoised — props are stable primitives, so rows skip
 * re-render when the parent re-renders on accordion toggles.
 */
export const BudgetCategoryRow = memo(function BudgetCategoryRow({
  catId,
  catName,
  sheet,
  isIncome,
}: BudgetCategoryRowProps) {
  const budgeted = useSheetValueNumber(sheet, envelopeBudget.catBudgeted(catId));
  const spent = useSheetValueNumber(sheet, envelopeBudget.catSpent(catId));
  const balance = useSheetValueNumber(sheet, envelopeBudget.catBalance(catId));

  return (
    <View className="w-full flex-row items-center gap-2 px-4 py-2.5">
      <View className="flex-1">
        <Typography className="text-base text-foreground" numberOfLines={1}>
          {catName}
        </Typography>
      </View>
      {isIncome ? (
        <NumericCell width={COL_AVAILABLE}>
          <Money cents={spent} tone="plain" className="text-sm" />
        </NumericCell>
      ) : (
        <>
          <NumericCell width={COL_ASSIGNED}>
            <Money cents={budgeted} tone="plain" className="text-sm" />
          </NumericCell>
          <NumericCell width={COL_AVAILABLE}>
            <AvailableChip cents={balance} />
          </NumericCell>
        </>
      )}
    </View>
  );
});
