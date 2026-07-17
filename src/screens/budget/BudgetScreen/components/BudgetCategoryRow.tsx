import { memo, useRef, useState } from "react";
import { View } from "react-native";
import * as Haptics from "expo-haptics";
import { cn, Menu, type MenuTriggerRef, PressableFeedback, Typography } from "heroui-native";
import { useSheetValue, useSheetValueNumber } from "@/hooks/useSheetValue";
import { envelopeBudget } from "@/core/domain/spreadsheet/bindings";
import { categoryChipStatus } from "../chipStatus";
import { AvailableChip } from "./AvailableChip";
import { BudgetAssignedField } from "./BudgetAssignedField";
import { CategoryRowMenu, type PreviewRect } from "./CategoryRowMenu";
import { COL_ASSIGNED, COL_AVAILABLE, NumericCell } from "./columns";

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
  /** Discard any in-progress amount edit (called before the long-press menu opens). */
  onCancelEditing: () => void;
  /** Whether goal templates are enabled (drives goal-aware chip colours). */
  goalsEnabled: boolean;
}

/**
 * An expense category row inside a group's card: name | Assigned | Available.
 * Tap anywhere on the row to edit the Assigned cell with the in-app keyboard;
 * long-press opens the category context menu (a clone of the row floats above
 * the dim overlay while it's open, iOS context-menu style). Memoised — inactive
 * rows keep stable props (isEditing=false, draft=0), so only the row being
 * edited re-renders per keystroke. Income rows are the `IncomeCategoryRow` variant.
 */
export const BudgetCategoryRow = memo(function BudgetCategoryRow({
  catId,
  catName,
  sheet,
  isEditing,
  draft,
  onPressRow,
  onCancelEditing,
  goalsEnabled,
}: BudgetCategoryRowProps) {
  const budgeted = useSheetValueNumber(sheet, envelopeBudget.catBudgeted(catId));
  const balance = useSheetValueNumber(sheet, envelopeBudget.catBalance(catId));
  const goal = useSheetValueNumber(sheet, envelopeBudget.catGoal(catId));
  const longGoalRaw = useSheetValue(sheet, envelopeBudget.catLongGoal(catId));
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [previewRect, setPreviewRect] = useState<PreviewRect | null>(null);
  // The live row hides only once the portal clone has laid out; hiding it
  // immediately on open leaves a couple of empty frames (visible blink).
  const [isPreviewShown, setPreviewShown] = useState(false);
  const menuTriggerRef = useRef<MenuTriggerRef>(null);
  // The trigger ref only exposes open()/close() reliably (heroui builds it by
  // spreading the node, which drops prototype methods like measureInWindow),
  // so the row measures itself through this inner-View ref instead.
  const rowViewRef = useRef<View>(null);

  // Shared between the live row and the floating preview clone in the menu portal.
  // Reusing the same element in both trees is fine — they render independently.
  const rowContent = (
    <View
      className={cn("w-full flex-row items-center gap-2 px-4 py-2.5", isEditing && "bg-accent/10")}
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
  );

  return (
    <Menu
      isOpen={isMenuOpen}
      onOpenChange={(open) => {
        if (!open) {
          setMenuOpen(false);
          setPreviewShown(false);
        }
      }}
    >
      {/* The popover can only position itself after the trigger's `open()` measures
          the row, so long-press goes through the trigger ref instead of plain state. */}
      <Menu.Trigger ref={menuTriggerRef} asChild>
        <PressableFeedback
          // Slow scale: barely visible on a quick edit tap, clearly "held" during
          // the long press that opens the menu.
          animation={{ scale: { value: 0.97, timingConfig: { duration: 450 } } }}
          onPress={(e) => onPressRow(catId, budgeted, e.nativeEvent.pageY)}
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onCancelEditing();
            // Snapshot the row's window position so the portal can float the
            // preview clone exactly on top of it, above the dim overlay. The menu
            // opens inside the callback so the rect (and the placement derived
            // from it) is committed before the popover positions itself.
            rowViewRef.current?.measureInWindow((x, y, width, height) => {
              setPreviewRect({ x, y, width, height });
              menuTriggerRef.current?.open();
              setMenuOpen(true);
            });
          }}
        >
          {/* Hide the live row while the menu is open — the portal clone replaces
              it visually, and hiding avoids double edges around the scaled clone. */}
          <View ref={rowViewRef} className={cn(isMenuOpen && isPreviewShown && "opacity-0")}>
            {rowContent}
          </View>
        </PressableFeedback>
      </Menu.Trigger>
      <CategoryRowMenu
        preview={rowContent}
        previewRect={previewRect}
        onPreviewLayout={() => setPreviewShown(true)}
      />
    </Menu>
  );
});
