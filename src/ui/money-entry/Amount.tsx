import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useThemeColor } from "heroui-native";
import { formatCents } from "@/lib/currency";
import { Money } from "@/ui/Money";
import { BlinkingCursor } from "@/ui/BlinkingCursor";

const AMOUNT_BASE_FONT_SIZE = 56;
const AMOUNT_SCALE_PER_CHAR = 0.035;
const AMOUNT_MIN_SCALE = 0.45;
// Line height and caret track the base font size at the hero's default ratios.
const LINE_HEIGHT_RATIO = 72 / AMOUNT_BASE_FONT_SIZE;
const CARET_RATIO = 46 / AMOUNT_BASE_FONT_SIZE;

/** Shrink the font as the number grows so long amounts stay on one line. */
const computeAmountFontSize = (chars: number, base: number): number => {
  const scale = Math.max(AMOUNT_MIN_SCALE, 1 - chars * AMOUNT_SCALE_PER_CHAR);
  return base * scale;
};

const styles = StyleSheet.create({
  row: {
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
  /** Hero font size before length-based shrinking (default 56). Smaller for
   *  side-by-side displays like a range's From/To. */
  baseFontSize?: number;
};

/**
 * Big hero amount display, rendered with `Money` so it carries the currency
 * symbol like every other amount in the app. Pure view — input comes from the
 * in-app AmountKeyboard; wrap it in `AmountKeyboard.Trigger` to open the pad on
 * press. Shows a blinking caret while editing.
 */
export function Amount({ value, isEditing, baseFontSize = AMOUNT_BASE_FONT_SIZE }: AmountProps) {
  const accent = useThemeColor("accent");

  const lineHeight = baseFontSize * LINE_HEIGHT_RATIO;
  // +1 approximates the currency symbol Money adds to the formatted number.
  const fontSize = useMemo(
    () => computeAmountFontSize(formatCents(value).length + 1, baseFontSize),
    [value, baseFontSize],
  );

  return (
    <View style={[styles.row, { height: lineHeight }]} accessibilityLabel="Amount">
      <Money
        cents={value}
        tone="plain"
        className="shrink"
        valueStyle={{
          fontSize,
          fontWeight: "700",
          fontFamily: "Nunito_700Bold",
          lineHeight,
          textAlign: "center",
        }}
      />
      {isEditing && <BlinkingCursor color={accent} height={baseFontSize * CARET_RATIO} width={3} />}
    </View>
  );
}
