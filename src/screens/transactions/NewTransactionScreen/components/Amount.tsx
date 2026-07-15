import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useThemeColor } from "heroui-native";
import { formatCents } from "@/lib/currency";
import { Money } from "@/ui/Money";
import { BlinkingCursor } from "@/ui/BlinkingCursor";

const AMOUNT_BASE_FONT_SIZE = 56;
const AMOUNT_LINE_HEIGHT = 72;
const AMOUNT_SCALE_PER_CHAR = 0.035;
const AMOUNT_MIN_SCALE = 0.45;

/** Shrink the font as the number grows so long amounts stay on one line. */
const computeAmountFontSize = (chars: number): number => {
  const scale = Math.max(AMOUNT_MIN_SCALE, 1 - chars * AMOUNT_SCALE_PER_CHAR);
  return AMOUNT_BASE_FONT_SIZE * scale;
};

const styles = StyleSheet.create({
  row: {
    height: AMOUNT_LINE_HEIGHT,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
});

type AmountProps = {
  /** Positive cents. */
  value: number;
  /** Whether the in-app amount keyboard is currently editing this field. */
  isEditing: boolean;
};

/**
 * Big hero amount display, rendered with `Money` so it carries the currency
 * symbol like every other amount in the app. Pure view — input comes from the
 * in-app AmountKeyboard; wrap it in `AmountKeyboard.Trigger` to open the pad on
 * press. Shows a blinking caret while editing.
 */
export function Amount({ value, isEditing }: AmountProps) {
  const accent = useThemeColor("accent");

  // +1 approximates the currency symbol Money adds to the formatted number.
  const fontSize = useMemo(() => computeAmountFontSize(formatCents(value).length + 1), [value]);

  return (
    <View style={styles.row} accessibilityLabel="Amount">
      <Money
        cents={value}
        tone="plain"
        className="shrink"
        valueStyle={{
          fontSize,
          fontWeight: "700",
          fontFamily: "Nunito_700Bold",
          lineHeight: AMOUNT_LINE_HEIGHT,
          textAlign: "center",
        }}
      />
      {isEditing && <BlinkingCursor color={accent} height={46} width={3} />}
    </View>
  );
}
