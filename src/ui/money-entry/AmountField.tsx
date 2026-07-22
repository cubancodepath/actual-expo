import { View } from "react-native";
import { cn, useThemeColor } from "heroui-native";
import { AmountKeyboard, useAmountKeyboardState } from "@/ui/amount-keyboard";
import { Money } from "@/ui/Money";
import { BlinkingCursor } from "@/ui/BlinkingCursor";

type AmountFieldProps = {
  /** Money tone (default "plain"). */
  tone?: "auto" | "plain";
  /** Extra classes merged onto the field container. */
  className?: string;
};

/**
 * Compact amount field: an Input-styled trigger that opens the in-app amount
 * keypad, carrying the blinking cursor and the same focus ring as a HeroUI
 * Input (driven by the keyboard's open state, since a plain View has no
 * `:focus`). Pairs with `<AmountKeyboard>` — it reads value/open from the
 * keyboard's context. The amount field USES the keyboard, not the other way
 * around, so this lives outside `amount-keyboard` and depends on it.
 */
export function AmountField({ tone = "plain", className }: AmountFieldProps) {
  const { value, isOpen } = useAmountKeyboardState();
  const accent = useThemeColor("accent");
  return (
    <AmountKeyboard.Trigger>
      <View
        className={cn(
          "min-h-12 flex-row items-center rounded-field border-field-width border-field-border bg-field px-3 ios:shadow-field android:shadow-sm ios:outline-2 ios:outline-transparent android:border-[1.5px] android:border-transparent",
          isOpen && "ios:outline-accent android:border-accent",
          className,
        )}
      >
        <Money cents={value} tone={tone} className="text-base font-normal text-foreground" />
        {isOpen ? <BlinkingCursor color={accent} /> : null}
      </View>
    </AmountKeyboard.Trigger>
  );
}
