import { memo } from "react";
import { View } from "react-native";
import { cn, PressableFeedback, Typography } from "heroui-native";
import { useSheetValueNumber } from "@/hooks/useSheetValue";
import { envelopeBudget } from "@/core/server/spreadsheet/bindings";
import { BudgetAssignedField } from "@/screens/budget/BudgetScreen/components/BudgetAssignedField";
import { COL_ASSIGNED, NumericCell } from "@/screens/budget/BudgetScreen/components/columns";

interface AssignCategoryRowProps {
  catId: string;
  catName: string;
  sheet: string;
  /** Whether this row's assigned amount is currently being edited. */
  isEditing: boolean;
  /** The live edited amount (only meaningful while `isEditing`). */
  draft: number;
  /** Pending (uncommitted) assigned amount for this row, or undefined if clean. */
  pendingValue?: number;
  /**
   * Begin editing this row, seeded from the value it currently shows (pending if
   * dirty, otherwise the live committed amount). `pageY` positions the scroll.
   */
  onPressRow: (catId: string, seed: number, pageY: number) => void;
}

/**
 * A single category row on the Assign Money screen: name | Assigned. Same visual
 * language as the budget row but one editable column, and edits are staged (not
 * committed). Memoised — clean rows keep stable primitive props (pendingValue
 * undefined, isEditing false), so only the edited/dirty row re-renders.
 */
export const AssignCategoryRow = memo(function AssignCategoryRow({
  catId,
  catName,
  sheet,
  isEditing,
  draft,
  pendingValue,
  onPressRow,
}: AssignCategoryRowProps) {
  const live = useSheetValueNumber(sheet, envelopeBudget.catBudgeted(catId));
  const shown = pendingValue ?? live;
  const isDirty = pendingValue !== undefined;

  return (
    <PressableFeedback
      animation={false}
      onPress={(e) => onPressRow(catId, shown, e.nativeEvent.pageY)}
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
          <BudgetAssignedField
            value={shown}
            draft={draft}
            isEditing={isEditing}
            highlight={isDirty}
          />
        </NumericCell>
      </View>
    </PressableFeedback>
  );
});
