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
  /** The source's available balance in cents (before this cover). */
  balance: number;
  /** Cents taken from this source. */
  amount: number;
  isEditing: boolean;
  /** Start editing this row's amount; `pageY` scrolls it above the pad. */
  onPressAmount: (id: string, pageY: number) => void;
}

/**
 * One funding source, laid out as budget-table columns (shared widths from
 * BudgetScreen's columns): name | editable amount | what's left of the source.
 * The editable amount carries a dotted underline as its affordance; input comes
 * from the in-app pad (the amount Pressable is its own trigger). Memoised —
 * only the row being edited re-renders per keystroke.
 */
export const SourceRow = memo(function SourceRow({
  id,
  name,
  balance,
  amount,
  isEditing,
  onPressAmount,
}: SourceRowProps) {
  const accent = useThemeColor("accent");
  const leftAfter = balance - amount;

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
