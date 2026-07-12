import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Typography, useThemeColor } from "heroui-native";
import { formatCents, MAX_CENTS } from "@/lib/currency";
import type { TransactionType } from "../validation/transactionForm.schema";

const AMOUNT_BASE_FONT_SIZE = 56;
const AMOUNT_LINE_HEIGHT = 72;
const AMOUNT_SCALE_PER_CHAR = 0.035;
const AMOUNT_MIN_SCALE = 0.45;

/** Shrink the font as the number grows so long amounts stay on one line. */
const computeAmountFontSize = (value: string): number => {
  const scale = Math.max(AMOUNT_MIN_SCALE, 1 - value.length * AMOUNT_SCALE_PER_CHAR);
  return AMOUNT_BASE_FONT_SIZE * scale;
};

const CURSOR_WIDTH = 3;
const CURSOR_HEIGHT = 46;

const styles = StyleSheet.create({
  row: {
    height: AMOUNT_LINE_HEIGHT,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  amount: {
    flexShrink: 1,
    fontWeight: "700",
    fontFamily: "Nunito_700Bold",
    lineHeight: AMOUNT_LINE_HEIGHT,
    textAlign: "center",
  },
  cursor: {
    width: CURSOR_WIDTH,
    height: CURSOR_HEIGHT,
    marginLeft: 4,
    borderRadius: CURSOR_WIDTH,
  },
  // Real input, kept 1x1 and out of sight. It's focused via ref from the
  // Pressable (never tapped directly) and its value is the raw cents digit
  // buffer — never the formatted string — so typing never jumps the layout.
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    width: 1,
    height: 1,
  },
});

/** Thin caret that blinks while the field is focused (respects Reduce Motion). */
function BlinkingCursor({ color, active }: { color: string; active: boolean }) {
  const opacity = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    cancelAnimation(opacity);
    if (!active) {
      opacity.value = 0;
      return;
    }
    if (reducedMotion) {
      opacity.value = 1;
      return;
    }
    opacity.value = 1;
    opacity.value = withRepeat(withTiming(0, { duration: 500 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [active, reducedMotion, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[styles.cursor, { backgroundColor: color }, animatedStyle]} />;
}

type AmountFieldProps = {
  /** Positive cents. */
  value: number;
  onChange: (cents: number) => void;
  type: TransactionType;
};

export function Amount({ value, onChange }: AmountFieldProps) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const foregroundColor = useThemeColor("foreground");
  const accent = useThemeColor("accent");

  const display = formatCents(value);
  const fontSize = useMemo(() => computeAmountFontSize(display), [display]);

  // Calculator-style entry: each digit fills cents from the right (2·8·0·0 →
  // $28.00). We strip everything but digits, so letters/paste can't corrupt it.
  function handleChangeText(text: string) {
    const digits = text.replace(/\D/g, "");
    const cents = Math.min(parseInt(digits || "0", 10), MAX_CENTS);
    onChange(cents);
  }

  return (
    <Pressable style={styles.row} onPress={() => inputRef.current?.focus()}>
      <Typography numberOfLines={1} style={[styles.amount, { fontSize, color: foregroundColor }]}>
        {display}
      </Typography>
      <BlinkingCursor color={accent} active={focused} />

      <TextInput
        ref={inputRef}
        value={value ? String(value) : ""}
        onChangeText={handleChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        caretHidden
        contextMenuHidden
        pointerEvents="none"
        accessibilityLabel="Amount"
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}
