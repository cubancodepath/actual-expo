import { memo } from "react";
import { View } from "react-native";
import { cn, PressableFeedback, Typography } from "heroui-native";
import { useSheetValue, useSheetValueNumber } from "@/hooks/useSheetValue";
import { envelopeBudget } from "@/core/domain/spreadsheet/bindings";
import { Money } from "@/ui/Money";
import { categoryChipStatus } from "../chipStatus";
import { AvailableChip } from "./AvailableChip";
import { BudgetAssignedField } from "./BudgetAssignedField";
import { COL_ASSIGNED, COL_AVAILABLE, NumericCell } from "./columns";

interface BudgetCategoryRowProps {
  catId: string;
  catName: string;
  sheet: string;
  isIncome: boolean;
  /** Whether this row's assigned amount is currently being edited. */
  isEditing: boolean;
  /** The live edited amount (only meaningful while `isEditing`). */
  draft: number;
  /**
   * Begin editing this row's assigned amount, seeded from its current value.
   * `pageY` is the touch's screen position, used to scroll the row above the keyboard.
   */
  onPressRow: (catId: string, budgeted: number, pageY: number) => void;
  /** Whether goal templates are enabled (drives goal-aware chip colours). */
  goalsEnabled: boolean;
}

/**
 * A single category row inside a group's card: name | Assigned | Available.
 * Expense rows have an editable Assigned cell (tap anywhere on the row to open
 * the in-app keyboard); income rows only show the amount received. Memoised —
 * inactive rows keep stable props (isEditing=false, draft=0), so only the row
 * being edited re-renders per keystroke.
 */
export const BudgetCategoryRow = memo(function BudgetCategoryRow({
  catId,
  catName,
  sheet,
  isIncome,
  isEditing,
  draft,
  onPressRow,
  goalsEnabled,
}: BudgetCategoryRowProps) {
  const budgeted = useSheetValueNumber(sheet, envelopeBudget.catBudgeted(catId));
  const spent = useSheetValueNumber(sheet, envelopeBudget.catSpent(catId));
  const balance = useSheetValueNumber(sheet, envelopeBudget.catBalance(catId));
  const goal = useSheetValueNumber(sheet, envelopeBudget.catGoal(catId));
  const longGoalRaw = useSheetValue(sheet, envelopeBudget.catLongGoal(catId));

  if (isIncome) {
    return (
      <View className="w-full flex-row items-center gap-2 px-4 py-2.5">
        <View className="flex-1">
          <Typography className="text-base text-foreground" numberOfLines={1}>
            {catName}
          </Typography>
        </View>
        <NumericCell width={COL_AVAILABLE}>
          <Money cents={spent} tone="plain" className="text-sm" />
        </NumericCell>
      </View>
    );
  }

  return (
    <PressableFeedback
      animation={false}
      onPress={(e) => onPressRow(catId, budgeted, e.nativeEvent.pageY)}
    >
      <View
        className={cn(
          "w-full flex-row items-center gap-2 px-4 py-2.5",
          isEditing && "bg-accent/10",
        )}
      >
        <View className="flex-1">
          <Typography className="text-base text-foreground" numberOfLines={1}>
            {catName}
          </Typography>
        </View>
        <NumericCell width={COL_ASSIGNED}>
          <BudgetAssignedField value={budgeted} draft={draft} isEditing={isEditing} />
        </NumericCell>
        <NumericCell width={COL_AVAILABLE}>
          <AvailableChip
            cents={balance}
            status={categoryChipStatus({
              balance,
              budgeted,
              goal,
              longGoal: longGoalRaw === true || longGoalRaw === 1,
              goalsEnabled,
            })}
          />
        </NumericCell>
      </View>
    </PressableFeedback>
  );
});
