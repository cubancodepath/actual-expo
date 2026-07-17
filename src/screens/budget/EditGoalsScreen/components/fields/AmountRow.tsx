import { View } from "react-native";
import { useThemeColor } from "heroui-native";
import { Banknote } from "lucide-react-native";
import { AmountKeyboard, useAmountKeyboardState } from "@/ui/amount-keyboard";
import { Money } from "@/ui/Money";
import { BlinkingCursor } from "@/ui/BlinkingCursor";
import { FieldRow } from "./FieldRow";

/**
 * The amount, styled like the budget list's inline editor: the value grows a
 * caret while the in-app keypad is open — no color change. Must sit inside
 * the screen's AmountKeyboard provider; the whole row is the pad's trigger.
 */
export function AmountRow({ label, cents }: { label: string; cents: number }) {
  const accent = useThemeColor("accent");
  const { isOpen } = useAmountKeyboardState();
  return (
    <AmountKeyboard.Trigger>
      <FieldRow>
        <FieldRow.Icon icon={Banknote} />
        <FieldRow.Content>
          <FieldRow.Label>{label}</FieldRow.Label>
          {/* Money renders the text, so this is Value's styling by hand. */}
          <View className="flex-row items-center">
            <Money cents={cents} tone="plain" className="text-base" />
            {isOpen ? <BlinkingCursor color={accent} /> : null}
          </View>
        </FieldRow.Content>
      </FieldRow>
    </AmountKeyboard.Trigger>
  );
}
