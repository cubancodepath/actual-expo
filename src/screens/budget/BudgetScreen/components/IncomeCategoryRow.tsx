import { memo } from "react";
import { View } from "react-native";
import { Typography } from "heroui-native";
import { useSheetValue, useSheetValueNumber } from "@/hooks/useSheetValue";
import { envelopeBudget } from "@/core/server/spreadsheet/bindings";
import { Money } from "@/ui/Money";
import { LiftMenu, type RowRect } from "@/ui/lift-menu";
import { COL_AVAILABLE, NumericCell } from "./columns";
import type { LiftedCategory } from "./liftedCategory";

interface IncomeCategoryRowProps {
  catId: string;
  catName: string;
  sheet: string;
  /**
   * Open the income row's menu (auto hold). Same contract as the expense row so
   * the screen can lift and anchor it identically; `carryover` carries the
   * auto-hold flag, `balance` is unused (passed as 0).
   */
  onLongPressRow: (cat: LiftedCategory, rect: RowRect) => void;
  /** Hidden while its lifted preview floats above, exactly like expense rows. */
  isLifted?: boolean;
}

/**
 * An income category row: name | Received. Figures are read-only, but a
 * long-press lifts the row (the same gesture the expense rows use) and opens a
 * small menu to toggle "auto hold" — the automatic sibling of the manual To
 * Budget hold, carrying this income into next month.
 */
export const IncomeCategoryRow = memo(function IncomeCategoryRow({
  catId,
  catName,
  sheet,
  onLongPressRow,
  isLifted = false,
}: IncomeCategoryRowProps) {
  const spent = useSheetValueNumber(sheet, envelopeBudget.catSpent(catId));
  const carryover = useSheetValue(sheet, envelopeBudget.catCarryover(catId)) === true;

  return (
    <LiftMenu.Row
      onLongPress={(rect) =>
        onLongPressRow({ catId, catName, balance: 0, carryover, isIncome: true }, rect)
      }
      isLifted={isLifted}
      contentClassName="flex-row items-center gap-2 px-4 py-2.5"
    >
      <View className="flex-1">
        <Typography className="text-base text-foreground" numberOfLines={1}>
          {catName}
        </Typography>
      </View>
      <NumericCell width={COL_AVAILABLE}>
        <Money cents={spent} tone="plain" className="text-sm" />
      </NumericCell>
    </LiftMenu.Row>
  );
});
