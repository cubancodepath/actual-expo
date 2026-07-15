import { useMemo, type ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Animated, { SlideInDown, SlideOutDown } from "react-native-reanimated";
import { FullWindowOverlay } from "react-native-screens";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn, useThemeColor } from "heroui-native";
import { NumberPad } from "heroui-native-pro";
import { Check } from "lucide-react-native";
import { MAX_CENTS } from "@/lib/currency";
import { Money } from "@/ui/Money";
import { BlinkingCursor } from "@/ui/BlinkingCursor";
import { AmountKeyboardContext, useAmountKeyboard } from "./context";

/**
 * In-app amount keyboard, composed of compound parts. The root is a pure
 * provider — the consumer owns the state (dependency injection): a screen wires
 * it to local state, a store draft, or a form.
 *
 * ```tsx
 * // Inline editing over a list (see useAmountKeyboardAvoidance for the scroll):
 * <AmountKeyboard value={draft} onChange={setDraft} onDone={commit}>
 *   <AmountKeyboard.Panel onHeightChange={onKeyboardHeightChange}>
 *     <AmountKeyboard.Pad />
 *   </AmountKeyboard.Panel>
 * </AmountKeyboard>
 *
 * // Modal-style screen with an integrated display (move-money, hold…):
 * <AmountKeyboard value={amount} onChange={setAmount} onDone={confirm}>
 *   <AmountKeyboard.Display className="self-center my-8" />
 *   <AmountKeyboard.Panel>
 *     <AmountKeyboard.Pad />
 *   </AmountKeyboard.Panel>
 * </AmountKeyboard>
 *
 * // Extending the pad (e.g. a future calculator row) without touching this file:
 * <AmountKeyboard.Pad>
 *   <AmountKeyboard.Row>
 *     <AmountKeyboard.Key value="" onPress={() => injectOperator("+")}>…</AmountKeyboard.Key>
 *   </AmountKeyboard.Row>
 * </AmountKeyboard.Pad>
 * ```
 */

// ---------------------------------------------------------------------------
// Root (provider)
// ---------------------------------------------------------------------------

interface AmountKeyboardRootProps {
  /** Current amount in cents. */
  value: number;
  onChange: (cents: number) => void;
  onDone: () => void;
  children: ReactNode;
}

function AmountKeyboardRoot({ value, onChange, onDone, children }: AmountKeyboardRootProps) {
  const ctx = useMemo(
    () => ({ state: { value }, actions: { setValue: onChange, done: onDone } }),
    [value, onChange, onDone],
  );
  return <AmountKeyboardContext value={ctx}>{children}</AmountKeyboardContext>;
}

// ---------------------------------------------------------------------------
// Panel — window-anchored sliding container
// ---------------------------------------------------------------------------

interface AmountKeyboardPanelProps {
  children?: ReactNode;
  /** Reports the rendered panel height (feed it to useAmountKeyboardAvoidance). */
  onHeightChange?: (height: number) => void;
}

/**
 * Bottom panel that behaves like a real keyboard. On iOS it renders inside a
 * FullWindowOverlay so it anchors to the physical window bottom and covers the
 * native tab bar — the screen frame never changes, so it slides in exactly once.
 * On Android it anchors inside the screen (the host hides its floating tab bar).
 */
function AmountKeyboardPanel({ children, onHeightChange }: AmountKeyboardPanelProps) {
  const insets = useSafeAreaInsets();

  const panel = (
    <Animated.View
      entering={SlideInDown}
      exiting={SlideOutDown}
      className="absolute inset-x-0 bottom-0 border-t border-border bg-surface px-4 pt-3"
      style={{ paddingBottom: insets.bottom + 8 }}
      onLayout={(e) => onHeightChange?.(e.nativeEvent.layout.height)}
    >
      {children ?? <AmountKeyboardPad />}
    </Animated.View>
  );

  if (Platform.OS === "ios") {
    return (
      <FullWindowOverlay>
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {panel}
        </View>
      </FullWindowOverlay>
    );
  }
  return panel;
}

// ---------------------------------------------------------------------------
// Pad — NumberPad wired to cents
// ---------------------------------------------------------------------------

interface AmountKeyboardPadProps {
  /** Extra rows composed ABOVE the default digit grid (e.g. operator keys). */
  children?: ReactNode;
}

/**
 * Digit pad wired to the context's cents value. Calculator-style entry: each
 * digit fills cents from the right; backspace deletes from the right and
 * long-press clears. The bottom-left key confirms (Done).
 */
function AmountKeyboardPad({ children }: AmountKeyboardPadProps) {
  const {
    state: { value },
    actions: { setValue, done },
  } = useAmountKeyboard();
  const foreground = useThemeColor("foreground");
  const accent = useThemeColor("accent");

  // The pad speaks a digit string; our value is cents. Empty string ⇒ 0.
  // maxLength 9 caps input at 999 999 999 = MAX_CENTS, so no clamp is needed.
  const digitString = value === 0 ? "" : String(Math.min(value, MAX_CENTS));

  const handleValueChange = (next: string) => {
    const digits = next.replace(/\D/g, "");
    setValue(parseInt(digits || "0", 10));
  };

  return (
    <NumberPad
      value={digitString}
      onValueChange={handleValueChange}
      maxLength={9}
      onSpacerPress={done}
    >
      {children}
      <NumberPad.Row>
        <NumberPad.Key value="1" />
        <NumberPad.Key value="2" />
        <NumberPad.Key value="3" />
      </NumberPad.Row>
      <NumberPad.Row>
        <NumberPad.Key value="4" />
        <NumberPad.Key value="5" />
        <NumberPad.Key value="6" />
      </NumberPad.Row>
      <NumberPad.Row>
        <NumberPad.Key value="7" />
        <NumberPad.Key value="8" />
        <NumberPad.Key value="9" />
      </NumberPad.Row>
      <NumberPad.Row>
        <NumberPad.Spacer>
          <Check size={24} color={accent} />
        </NumberPad.Spacer>
        <NumberPad.Key value="0" />
        <NumberPad.Backspace iconProps={{ color: foreground }} />
      </NumberPad.Row>
    </NumberPad>
  );
}

// ---------------------------------------------------------------------------
// Display — formatted amount + caret (for screens without their own cell)
// ---------------------------------------------------------------------------

function AmountKeyboardDisplay({ className }: { className?: string }) {
  const {
    state: { value },
  } = useAmountKeyboard();
  const accent = useThemeColor("accent");
  return (
    <View className={cn("flex-row items-center", className)}>
      <Money cents={value} tone="plain" className="text-accent" />
      <BlinkingCursor active color={accent} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Compound export
// ---------------------------------------------------------------------------

export const AmountKeyboard = Object.assign(AmountKeyboardRoot, {
  Panel: AmountKeyboardPanel,
  Pad: AmountKeyboardPad,
  Display: AmountKeyboardDisplay,
  /** NumberPad parts re-exported so consumers can extend the pad with custom keys. */
  Row: NumberPad.Row,
  Key: NumberPad.Key,
  Backspace: NumberPad.Backspace,
  Spacer: NumberPad.Spacer,
});
