import { useId, useMemo, type ReactNode } from "react";
import { Keyboard, Platform, Pressable, StyleSheet, View, type ViewProps } from "react-native";
import Animated, { SlideInDown, SlideOutDown } from "react-native-reanimated";
import { FullWindowOverlay } from "react-native-screens";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Portal, useThemeColor } from "heroui-native";
import { NumberPad } from "heroui-native-pro";
import { Check } from "lucide-react-native";
import { MAX_CENTS } from "@/lib/currency";
import {
  AmountKeyboardActionsContext,
  AmountKeyboardStateContext,
  useAmountKeyboardActions,
  useAmountKeyboardState,
  type AmountKeyboardActions,
  type AmountKeyboardState,
} from "./context";

/**
 * In-app amount keyboard with the Popover anatomy: the compound lives WITH the
 * amount field and only composes its own pieces — the panel escapes to window
 * level through a portal. The consumer owns the state (dependency injection).
 *
 * Why not HeroUI's `BottomSheet`? `@gorhom/bottom-sheet` is modal and captures
 * gestures, so it can't serve the non-modal multi-field case (budget, split),
 * where taps must reach the other rows and there is no system keyboard. So the
 * portal/overlay/panel anatomy is composed here instead of reused wholesale.
 *
 * ```tsx
 * // Single-amount screen — everything sits where the field sits:
 * <AmountKeyboard isOpen={editing} onOpenChange={setEditing}
 *   value={cents} onValueChange={setCents}>
 *   <AmountKeyboard.Trigger>
 *     <MyAmountDisplay value={cents} isEditing={editing} />
 *   </AmountKeyboard.Trigger>
 *   <AmountKeyboard.DismissArea>…form fields…</AmountKeyboard.DismissArea>
 *   <AmountKeyboard.Portal>
 *     <AmountKeyboard.Panel />
 *   </AmountKeyboard.Portal>
 * </AmountKeyboard>
 *
 * // Multi-field screen (budget, split) — rows are their own triggers, so no
 * // Trigger and no Overlay (taps must reach rows); close via `onClose`:
 * <AmountKeyboard isOpen={editingRow != null} onClose={stopEdit}
 *   value={draft} onValueChange={setDraft}>
 *   <AmountKeyboard.Portal>
 *     <AmountKeyboard.Panel />
 *   </AmountKeyboard.Portal>
 * </AmountKeyboard>
 * ```
 */

// ---------------------------------------------------------------------------
// Root (provider)
// ---------------------------------------------------------------------------

interface AmountKeyboardRootProps {
  /** Whether the keyboard is open (controlled). */
  isOpen: boolean;
  /** Requested open state change (Trigger → true, ✓/Overlay → false). */
  onOpenChange?: (isOpen: boolean) => void;
  /** Convenience for close-only consumers (fires when the pad requests close). */
  onClose?: () => void;
  /** Current amount in cents. */
  value: number;
  onValueChange: (cents: number) => void;
  children: ReactNode;
}

function AmountKeyboardRoot({
  isOpen,
  onOpenChange,
  onClose,
  value,
  onValueChange,
  children,
}: AmountKeyboardRootProps) {
  // Actions are stable across keystrokes (deps are the handler identities), so
  // actions-only consumers (Trigger) never re-render while typing.
  const actions = useMemo<AmountKeyboardActions>(
    () => ({
      setValue: onValueChange,
      onOpenChange: (next) => {
        onOpenChange?.(next);
        if (!next) onClose?.();
      },
    }),
    [onValueChange, onOpenChange, onClose],
  );
  const state = useMemo<AmountKeyboardState>(() => ({ value, isOpen }), [value, isOpen]);

  return (
    <AmountKeyboardActionsContext value={actions}>
      <AmountKeyboardStateContext value={state}>{children}</AmountKeyboardStateContext>
    </AmountKeyboardActionsContext>
  );
}

// ---------------------------------------------------------------------------
// Trigger — the amount field itself
// ---------------------------------------------------------------------------

interface AmountKeyboardTriggerProps {
  children: ReactNode;
  className?: string;
}

/** Pressable around the amount display: opens the pad (closing any system keyboard). */
function AmountKeyboardTrigger({ children, className }: AmountKeyboardTriggerProps) {
  const { onOpenChange } = useAmountKeyboardActions();
  return (
    <Pressable
      className={className}
      onPress={() => {
        Keyboard.dismiss();
        onOpenChange(true);
      }}
    >
      {children}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Portal — teleports overlay + panel to window level
// ---------------------------------------------------------------------------

/**
 * Renders its children (Overlay/Panel) at the root of the app via the HeroUI
 * portal host — above all screens and tab bars. On iOS the content is
 * additionally wrapped in a FullWindowOverlay so it covers the native tabs.
 * Always mounted so exit animations can play.
 *
 * The portal host mounts the children in a different tree, so both contexts are
 * re-provided inside (same as HeroUI's own portaled compounds do).
 */
function AmountKeyboardPortal({ children }: { children: ReactNode }) {
  const name = useId();
  const actions = useAmountKeyboardActions();
  const state = useAmountKeyboardState();
  const content = (
    <AmountKeyboardActionsContext value={actions}>
      <AmountKeyboardStateContext value={state}>
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {children}
        </View>
      </AmountKeyboardStateContext>
    </AmountKeyboardActionsContext>
  );
  return (
    <Portal name={name}>
      {Platform.OS === "ios" ? <FullWindowOverlay>{content}</FullWindowOverlay> : content}
    </Portal>
  );
}

// ---------------------------------------------------------------------------
// DismissArea — one-tap outside-to-close (real-keyboard behaviour)
// ---------------------------------------------------------------------------

/**
 * Wrap the *other* content of a single-amount screen (the form fields, NOT the
 * amount Trigger). While the pad is open, the first touch here closes it — and,
 * because it's capture-phase + returns false, the same tap still reaches the
 * field (open the date sheet, focus notes…). This is why it must live in the
 * content tree: a portal backdrop sits above the content and can't pass the tap
 * through, forcing a two-tap "close, then open". Multi-field screens (budget,
 * split) switch fields on tap instead and don't use this.
 */
function AmountKeyboardDismissArea({ children, ...viewProps }: ViewProps) {
  const { isOpen } = useAmountKeyboardState();
  const { onOpenChange } = useAmountKeyboardActions();
  return (
    <View
      onStartShouldSetResponderCapture={() => {
        if (isOpen) onOpenChange(false);
        return false;
      }}
      {...viewProps}
    >
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Panel — bottom sliding container
// ---------------------------------------------------------------------------

interface AmountKeyboardPanelProps {
  children?: ReactNode;
  /** Reports the rendered panel height (feed it to useAmountKeyboardAvoidance). */
  onHeightChange?: (height: number) => void;
}

/**
 * Bottom panel that behaves like a real keyboard. Mounted permanently (inside
 * the Portal); the inner animated view mounts/unmounts with `isOpen`, so both
 * the slide-in and slide-out animations play. Defaults to the `Pad`.
 */
function AmountKeyboardPanel({ children, onHeightChange }: AmountKeyboardPanelProps) {
  const insets = useSafeAreaInsets();
  const { isOpen } = useAmountKeyboardState();

  if (!isOpen) return null;
  return (
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
 * long-press clears. The bottom-left ✓ key confirms (closes the keyboard).
 */
function AmountKeyboardPad({ children }: AmountKeyboardPadProps) {
  const { value } = useAmountKeyboardState();
  const { setValue, onOpenChange } = useAmountKeyboardActions();
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
      onSpacerPress={() => onOpenChange(false)}
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
// Compound export
// ---------------------------------------------------------------------------

export const AmountKeyboard = Object.assign(AmountKeyboardRoot, {
  Trigger: AmountKeyboardTrigger,
  DismissArea: AmountKeyboardDismissArea,
  Portal: AmountKeyboardPortal,
  Panel: AmountKeyboardPanel,
  Pad: AmountKeyboardPad,
  /** NumberPad parts re-exported so consumers can extend the pad with custom keys. */
  Row: NumberPad.Row,
  Key: NumberPad.Key,
  Backspace: NumberPad.Backspace,
  Spacer: NumberPad.Spacer,
});
