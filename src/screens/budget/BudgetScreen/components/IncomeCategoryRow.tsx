import { memo, useRef } from "react";
import { View } from "react-native";
import { cn, PressableFeedback, Typography } from "heroui-native";
import { useSheetValue, useSheetValueNumber } from "@/hooks/useSheetValue";
import { envelopeBudget } from "@/core/domain/spreadsheet/bindings";
import { mediumHaptic } from "@/ui/haptics";
import { Money } from "@/ui/Money";
import { COL_AVAILABLE, NumericCell } from "./columns";
import type { RowRect } from "./CategoryRowMenu";

/** Same barely-there hold scale the expense rows use so the lift reads alike. */
const ROW_PRESS_ANIMATION = { scale: { value: 0.97, timingConfig: { duration: 450 } } };

interface IncomeCategoryRowProps {
  catId: string;
  catName: string;
  sheet: string;
  /**
   * Open the income row's menu (auto hold). Same contract as the expense row so
   * the screen can lift and anchor it identically; `carryover` carries the
   * auto-hold flag, `balance` is unused (passed as 0).
   */
  onLongPressRow: (
    catId: string,
    catName: string,
    balance: number,
    carryover: boolean,
    rect: RowRect,
    isIncome: boolean,
  ) => void;
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
  const rowViewRef = useRef<View>(null);

  return (
    <PressableFeedback
      animation={ROW_PRESS_ANIMATION}
      onLongPress={() => {
        mediumHaptic();
        rowViewRef.current?.measureInWindow((x, y, width, height) => {
          onLongPressRow(catId, catName, 0, carryover, { x, y, width, height }, true);
        });
      }}
    >
      <View
        ref={rowViewRef}
        className={cn("w-full flex-row items-center gap-2 px-4 py-2.5", isLifted && "opacity-0")}
      >
        <View className="flex-1">
          <Typography className="text-base text-foreground" numberOfLines={1}>
            {catName}
          </Typography>
        </View>
        <NumericCell width={COL_AVAILABLE}>
          <Money cents={spent} tone="plain" className="text-sm" />
        </NumericCell>
      </View>
    </PressableFeedback>
  );
});
