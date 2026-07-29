import { memo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { cn, Typography } from "heroui-native";
import { useSheetValue, useSheetValueNumber } from "@/hooks/useSheetValue";
import { envelopeBudget } from "@/core/server/spreadsheet/bindings";
import { useFormat } from "@/lib/hooks/useFormat";
import { usePrivacyMode } from "@/lib/hooks/usePrivacyMode";
import { LiftMenu, type RowRect } from "@/ui/lift-menu";
import { moneyText } from "@/ui/moneyText";
import { categoryChipStatus } from "../chipStatus";
import { AvailableChip } from "./AvailableChip";
import { BudgetAssignedField } from "./BudgetAssignedField";
import { COL_ASSIGNED, COL_AVAILABLE, NumericCell } from "./columns";
import type { LiftedCategory } from "./liftedCategory";

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
   * Open the category menu for this row: the row bundles itself into a
   * `LiftedCategory` and hands it, with its measured window frame, to the
   * screen's `LiftMenu.Host`.
   */
  onLongPressRow: (cat: LiftedCategory, rect: RowRect) => void;
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
  const carryover = useSheetValue(sheet, envelopeBudget.catCarryover(catId)) === true;

  const status = categoryChipStatus({
    balance,
    budgeted,
    goal,
    longGoal: longGoalRaw === true || longGoalRaw === 1,
    goalsEnabled,
  });

  const { t } = useTranslation("budget");
  const format = useFormat();
  const [privacyMode] = usePrivacyMode();

  // The chip carries funding state in colour alone, which is exactly what a
  // screen reader cannot see — so the state joins the label as a word, but only
  // when it says something the figures don't. "success" without a goal just
  // means a positive balance, and announcing "funded" there would be a claim
  // the data doesn't support.
  const stateWord =
    status === "danger" ? t("a11y.overspent") : status === "warning" ? t("a11y.underfunded") : null;

  // Privacy mode redacts the figures visually; the row label has to redact them
  // too, or "Hide Amounts" would leak through the very label meant to describe
  // the hidden row.
  const spoken = (cents: number) =>
    privacyMode ? t("a11y.amountHidden") : moneyText(cents, format);

  const label = [
    t("a11y.categoryRow", {
      name: catName,
      assigned: spoken(budgeted),
      available: spoken(balance),
    }),
    stateWord,
    carryover ? t("a11y.rollsOver") : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <LiftMenu.Row
      onPress={(e) => onPressRow(catId, budgeted, e.nativeEvent.pageY)}
      onLongPress={(rect) =>
        onLongPressRow({ catId, catName, balance, carryover, isIncome: false }, rect)
      }
      isLifted={isLifted}
      contentClassName={cn("flex-row items-center gap-2 px-4 py-2.5", isEditing && "bg-accent/10")}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t("a11y.editAssignedHint")}
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
        <AvailableChip cents={balance} carryover={carryover} status={status} />
      </NumericCell>
    </LiftMenu.Row>
  );
});
