import { useState } from "react";
import { View } from "react-native";
import { cn, Input, useThemeColor } from "heroui-native";
import { MAX_CENTS } from "@/lib/currency";
import { BlinkingCursor } from "@/ui/BlinkingCursor";
import { AmountText } from "./AmountText";

type AmountInputProps = {
  /** Magnitude in cents (always non-negative). Direction is `inflow`. */
  value: number;
  onChange: (cents: number) => void;
  /**
   * Whether this is money coming in. Drives both the colour (green when true,
   * even at 0.00) and the displayed sign (a "-" is shown when false). Set by the
   * expense/income toggle, not by the typed digits.
   */
  inflow?: boolean;
  /** Extra classes merged onto the field container (e.g. width). */
  className?: string;
};

/**
 * Currency field that looks like a HeroUI `Input` but avoids the caret-jump you
 * get from feeding a reformatted value back into a controlled TextInput. Instead
 * the real `Input` holds the raw digit buffer (its own text kept transparent) and
 * the formatted, coloured amount — plus a blinking caret — is drawn on top, the
 * same hidden-buffer + display split the big `Amount` uses.
 *
 * Entry is calculator-style (each digit fills cents from the right: 2·8·0·0 →
 * $28.00). The typed value is just a magnitude; `inflow` decides the direction:
 * inflow → green (including 0.00), outflow → normal colour with a "-" sign.
 */
export function AmountInput({ value, onChange, inflow = false, className }: AmountInputProps) {
  const [focused, setFocused] = useState(false);
  const accent = useThemeColor("accent");

  const handleChangeText = (text: string) => {
    const digits = text.replace(/\D/g, "");
    const magnitude = Math.min(parseInt(digits || "0", 10), MAX_CENTS);
    onChange(magnitude);
  };

  return (
    <View className={cn("relative", className)}>
      <Input
        value={value ? String(Math.abs(value)) : ""}
        onChangeText={handleChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        caretHidden
        contextMenuHidden
        className="w-full text-right text-transparent"
      />
      <View
        className="absolute inset-0 flex-row items-center justify-end px-3"
        pointerEvents="none"
      >
        <AmountText value={value} inflow={inflow} className="text-right text-base" />
        <BlinkingCursor color={accent} active={focused} />
      </View>
    </View>
  );
}
