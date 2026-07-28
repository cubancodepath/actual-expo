import { useEffect, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { cn, Typography, useThemeColor } from "heroui-native";
import { AmountKeyboard, useAmountKeyboardState } from "@/ui/amount-keyboard";
import { Money } from "@/ui/Money";
import { BlinkingCursor } from "@/ui/BlinkingCursor";
import { lightHaptic } from "@/ui/haptics";

type AmountFieldProps = {
  /** Money tone (default "plain"). */
  tone?: "auto" | "plain";
  /** Extra classes merged onto the field container. */
  className?: string;
  /** Leading content inside the field, before the amount (e.g. AmountField.Sign). */
  children?: ReactNode;
};

/**
 * Compact amount field: an Input-styled trigger that opens the in-app amount
 * keypad, carrying the blinking cursor and the same focus ring as a HeroUI
 * Input (driven by the keyboard's open state, since a plain View has no
 * `:focus`). Pairs with `<AmountKeyboard>` — it reads value/open from the
 * keyboard's context. The amount field USES the keyboard, not the other way
 * around, so this lives outside `amount-keyboard` and depends on it.
 *
 * Optional leading `children` (e.g. `<AmountField.Sign>`) render before the
 * amount; the pad value stays unsigned, so a sign selector is separate state
 * the consumer applies at submit.
 */
export function AmountField({ tone = "plain", className, children }: AmountFieldProps) {
  const { value, isOpen } = useAmountKeyboardState();
  const accent = useThemeColor("accent");
  return (
    <AmountKeyboard.Trigger>
      <View
        className={cn(
          "min-h-12 flex-row items-center gap-2 rounded-field border-field-width border-field-border bg-field px-3 ios:shadow-field android:shadow-sm ios:outline-2 ios:outline-transparent android:border-[1.5px] android:border-transparent",
          isOpen && "ios:outline-accent android:border-accent",
          className,
        )}
      >
        {children}
        {/* Money + caret kept in their own tight row so the cursor hugs the
            number (the container gap only separates the sign from the amount). */}
        <View className="flex-row items-center">
          <Money
            cents={value}
            tone={tone}
            mask={false}
            className="text-base font-normal text-foreground"
          />
          {isOpen ? <BlinkingCursor color={accent} /> : null}
        </View>
      </View>
    </AmountKeyboard.Trigger>
  );
}

interface AmountFieldSignProps {
  /** True when the amount is negative. */
  isNegative: boolean;
  onToggle: () => void;
}

const TRACK_W = 52;
const TRACK_H = 30;
const THUMB = 24;
const PAD = 3;
const TRAVEL = TRACK_W - THUMB - PAD * 2;
// A short decelerating slide — no spring bounce (that read as too playful here).
const SLIDE = { duration: 180, easing: Easing.out(Easing.cubic) };

/**
 * A +/− sign selector shaped like a switch, for an amount field (the pad enters
 * unsigned cents; the sign is separate state the consumer owns and applies at
 * submit). The thumb slides between a positive (left) and negative (right)
 * position; all colours come from theme tokens via className (one place to
 * retheme). Renders as a compound part:
 * `<AmountField><AmountField.Sign .../></AmountField>`.
 */
function AmountFieldSign({ isNegative, onToggle }: AmountFieldSignProps) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(isNegative ? 1 : 0);

  useEffect(() => {
    progress.value = reducedMotion ? (isNegative ? 1 : 0) : withTiming(isNegative ? 1 : 0, SLIDE);
  }, [isNegative, reducedMotion, progress]);

  // Positive (progress 0) rests on the right, negative (progress 1) on the left.
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [TRAVEL, 0]) }],
  }));

  return (
    <Pressable
      hitSlop={8}
      onPress={() => {
        lightHaptic();
        onToggle();
      }}
    >
      <View
        className={cn(
          "justify-center rounded-full",
          isNegative ? "bg-danger/15" : "bg-positive/15",
        )}
        style={{ width: TRACK_W, height: TRACK_H, paddingLeft: PAD }}
      >
        <Animated.View
          className="items-center justify-center rounded-full bg-surface shadow-sm"
          style={[{ width: THUMB, height: THUMB }, thumbStyle]}
        >
          <Typography
            className={cn(
              "text-base font-bold leading-none",
              isNegative ? "text-danger" : "text-positive",
            )}
          >
            {isNegative ? "−" : "+"}
          </Typography>
        </Animated.View>
      </View>
    </Pressable>
  );
}

AmountField.Sign = AmountFieldSign;
