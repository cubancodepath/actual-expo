import { memo } from "react";
import { Pressable, View } from "react-native";
import { ListGroup, useThemeColor } from "heroui-native";
import { AvailableChip } from "@/screens/budget/BudgetScreen/components/AvailableChip";
import {
  COL_ASSIGNED,
  COL_AVAILABLE,
  NumericCell,
} from "@/screens/budget/BudgetScreen/components/columns";
import { BlinkingCursor } from "@/ui/BlinkingCursor";
import { Money } from "@/ui/Money";

interface SourceRowProps {
  id: string;
  name: string;
  /** The counterpart's available balance in cents (before this move). */
  balance: number;
  /** Cents moved to or from this counterpart. */
  amount: number;
  /**
   * Which way the money flows for this row — drives the projected balance chip.
   * `gives` (default): the row funds the target, so its balance goes down.
   * `receives`: the target funds the row, so its balance goes up.
   */
  flow?: "gives" | "receives";
  isEditing: boolean;
  /** Start editing this row's amount; `pageY` scrolls it above the pad. */
  onPressAmount: (id: string, pageY: number) => void;
}

/**
 * One transfer counterpart, laid out as budget-table columns (shared widths from
 * BudgetScreen's columns): name | editable amount | the balance it's left with.
 * The editable amount carries a dotted underline as its affordance; input comes
 * from the in-app pad (the amount Pressable is its own trigger). Memoised —
 * only the row being edited re-renders per keystroke.
 */
export const SourceRow = memo(function SourceRow({
  id,
  name,
  balance,
  amount,
  flow = "gives",
  isEditing,
  onPressAmount,
}: SourceRowProps) {
  const accent = useThemeColor("accent");
  const leftAfter = flow === "gives" ? balance - amount : balance + amount;

  return (
    <ListGroup.Item>
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle numberOfLines={1}>{name}</ListGroup.ItemTitle>
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix>
        <View className="flex-row items-center gap-2">
          <NumericCell width={COL_ASSIGNED}>
            <Pressable onPress={(e) => onPressAmount(id, e.nativeEvent.pageY)}>
              <View className="flex-row items-center border-b border-dotted border-muted pb-0.5">
                <Money
                  cents={amount}
                  tone="plain"
                  className={isEditing ? "text-base text-accent" : "text-base"}
                />
                {isEditing ? <BlinkingCursor color={accent} /> : null}
              </View>
            </Pressable>
          </NumericCell>
          <NumericCell width={COL_AVAILABLE}>
            <AvailableChip cents={leftAfter} />
          </NumericCell>
        </View>
      </ListGroup.ItemSuffix>
    </ListGroup.Item>
  );
});
