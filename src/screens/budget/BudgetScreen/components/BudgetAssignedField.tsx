import { View } from "react-native";
import { useThemeColor } from "heroui-native";
import { Money } from "@/ui/Money";
import { BlinkingCursor } from "@/ui/BlinkingCursor";

interface BudgetAssignedFieldProps {
  /** Persisted assigned amount in cents. */
  value: number;
  /** In-progress edited amount (only used while editing). */
  draft: number;
  isEditing: boolean;
  /**
   * Render the value in accent even when not editing — used to flag an
   * uncommitted (pending) change on the Assign Money screen.
   */
  highlight?: boolean;
}

/**
 * Display-only "Assigned" cell. Looks exactly like the read-only `Money` value;
 * while its row is being edited it shows the draft in primary (accent) with a
 * blinking caret. Input comes from the in-app AmountKeyboard, not a TextInput.
 */
export function BudgetAssignedField({
  value,
  draft,
  isEditing,
  highlight = false,
}: BudgetAssignedFieldProps) {
  const accent = useThemeColor("accent");
  const accented = isEditing || highlight;
  return (
    <View className="flex-row items-center">
      <Money
        cents={isEditing ? draft : value}
        tone="plain"
        mask={!isEditing}
        className={accented ? "text-sm text-accent" : "text-sm"}
      />
      {isEditing && <BlinkingCursor color={accent} />}
    </View>
  );
}
