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
}

/**
 * Display-only "Assigned" cell. Looks exactly like the read-only `Money` value;
 * while its row is being edited it shows the draft in primary (accent) with a
 * blinking caret. Input comes from the in-app AmountKeyboard, not a TextInput.
 */
export function BudgetAssignedField({ value, draft, isEditing }: BudgetAssignedFieldProps) {
  const accent = useThemeColor("accent");
  return (
    <View className="flex-row items-center">
      <Money
        cents={isEditing ? draft : value}
        tone="plain"
        className={isEditing ? "text-sm text-accent" : "text-sm"}
      />
      {isEditing && <BlinkingCursor active color={accent} />}
    </View>
  );
}
