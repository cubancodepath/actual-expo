import { memo, useRef } from "react";
import { View } from "react-native";
import { cn, PressableFeedback, Typography } from "heroui-native";
import { useSheetValue, useSheetValueNumber } from "@/hooks/useSheetValue";
import { envelopeBudget } from "@/core/domain/spreadsheet/bindings";
import { mediumHaptic } from "@/ui/haptics";
import { categoryChipStatus } from "../chipStatus";
import { AvailableChip } from "./AvailableChip";
import { BudgetAssignedField } from "./BudgetAssignedField";
import { COL_ASSIGNED, COL_AVAILABLE, NumericCell } from "./columns";
import type { RowRect } from "./CategoryRowMenu";

/**
 * Press feedback: a slow scale that's barely visible on a quick edit tap, but
 * reads as clearly "held" during the long press that opens the menu. Module
 * scope — a fresh object here would re-derive the worklet on every row render.
 */
const ROW_PRESS_ANIMATION = { scale: { value: 0.97, timingConfig: { duration: 450 } } };

interface BudgetCategoryRowProps {
  catId: string;
  catName: string;
  sheet: string;
  /** Whether this row's assigned amount is currently being edited. */
  isEditing: boolean;
  /** The live edited amount (only meaningful while `isEditing`). */
  draft: number;
  /**
   * Begin editing this row's assigned amount, seeded from its current value.
   * `pageY` is the touch's screen position, used to scroll the row above the keyboard.
   */
  onPressRow: (catId: string, budgeted: number, pageY: number) => void;
  /**
   * Open the category menu for this row. `rect` is the row's window frame, which
   * the screen uses to anchor the menu and float the lifted preview over it.
   */
  onLongPressRow: (catId: string, catName: string, balance: number, rect: RowRect) => void;
  /**
   * Whether the menu is open on this row AND its floating preview is up. The row
   * hides itself then, so the preview replaces it without a seam.
   */
  isLifted?: boolean;
  /** Whether goal templates are enabled (drives goal-aware chip colours). */
  goalsEnabled: boolean;
}

/**
 * An expense category row inside a group's card: name | Assigned | Available.
 * Tap anywhere on the row to edit the Assigned cell with the in-app keyboard;
 * long-press hands the row's frame to the screen, which owns the menu. Memoised —
 * inactive rows keep stable props (isEditing=false, draft=0), so only the row
 * being edited re-renders per keystroke. Income rows are the `IncomeCategoryRow`
 * variant.
 */
export const BudgetCategoryRow = memo(function BudgetCategoryRow({
  catId,
  catName,
  sheet,
  isEditing,
  draft,
  onPressRow,
  onLongPressRow,
  isLifted = false,
  goalsEnabled,
}: BudgetCategoryRowProps) {
  const budgeted = useSheetValueNumber(sheet, envelopeBudget.catBudgeted(catId));
  const balance = useSheetValueNumber(sheet, envelopeBudget.catBalance(catId));
  const goal = useSheetValueNumber(sheet, envelopeBudget.catGoal(catId));
  const longGoalRaw = useSheetValue(sheet, envelopeBudget.catLongGoal(catId));
  const rowViewRef = useRef<View>(null);

  return (
    <PressableFeedback
      animation={ROW_PRESS_ANIMATION}
      onPress={(e) => onPressRow(catId, budgeted, e.nativeEvent.pageY)}
      onLongPress={() => {
        mediumHaptic();
        // The screen anchors the menu to this frame, so it has to be measured
        // in window coordinates — the same space the menu's portal lives in.
        rowViewRef.current?.measureInWindow((x, y, width, height) => {
          onLongPressRow(catId, catName, balance, { x, y, width, height });
        });
      }}
    >
      <View
        ref={rowViewRef}
        className={cn(
          "w-full flex-row items-center gap-2 px-4 py-2.5",
          isEditing && "bg-accent/10",
          isLifted && "opacity-0",
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
