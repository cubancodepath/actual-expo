import { useCallback, useRef, type ReactNode } from "react";
import { View, type AccessibilityRole, type GestureResponderEvent } from "react-native";
import { cn, PressableFeedback } from "heroui-native";
import { mediumHaptic } from "@/ui/haptics";
import type { RowRect } from "./types";

/**
 * Press feedback: a slow scale that reads as "held" during the long press that
 * opens the menu (module scope so the worklet isn't re-derived per row).
 * Exported for rows too bespoke for `LiftMenu.Row` (e.g. ripple-based rows).
 */
export const ROW_PRESS_ANIMATION = { scale: { value: 0.97, timingConfig: { duration: 450 } } };

/**
 * The long-press half of a lift row: haptic + measure the row's window frame
 * and hand it to the caller. Escape hatch for rows that can't use
 * `LiftMenu.Row` wholesale — attach `rowRef` to the view to measure and
 * `handleLongPress` to the pressable. `handleLongPress` is `undefined` when
 * `onLongPress` is, so the pressable gets no long-press handler at all.
 */
export function useLiftLongPress(onLongPress?: (rect: RowRect) => void) {
  const rowRef = useRef<View>(null);
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;

  const handleLongPress = useCallback(() => {
    mediumHaptic();
    // Anchor the menu to this frame — measured in window coordinates, the
    // space the menu's portal lives in.
    rowRef.current?.measureInWindow((x, y, width, height) => {
      onLongPressRef.current?.({ x, y, width, height });
    });
  }, []);

  return { rowRef, handleLongPress: onLongPress ? handleLongPress : undefined };
}

interface LiftMenuRowProps {
  /** Forwarded raw so callers can read e.g. `e.nativeEvent.pageY`. */
  onPress?: (e: GestureResponderEvent) => void;
  /** Open the row's lift menu; `rect` is its measured window frame. Omit to disable long-press. */
  onLongPress?: (rect: RowRect) => void;
  /** Menu open on this row with its preview up — the live row hides itself. */
  isLifted?: boolean;
  isDisabled?: boolean;
  /** Classes for the inner measured view (padding, layout, base opacity…). */
  contentClassName?: string;
  /**
   * What a screen reader announces for the whole row. A row is a table of cells
   * to the eye but a single control to the ear, so pass one composed sentence
   * ("Groceries, assigned 120 euros, available 45 euros") rather than letting
   * the cells be read as unrelated fragments. Setting it takes the children out
   * of the accessibility tree.
   */
  accessibilityLabel?: string;
  /** What tapping does, when the label alone doesn't imply it. */
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
  children: ReactNode;
}

/**
 * A pressable list row wired for the lift menu: held-press scale feedback, tap
 * passthrough, and a long-press that measures the row's frame and reports it
 * (via `LiftMenu.Host`'s `onLongPressRow`) so the single menu anchors there.
 * While this row's preview clone is floating (`isLifted`), the live row hides
 * itself so only the clone shows.
 */
export function LiftMenuRow({
  onPress,
  onLongPress,
  isLifted = false,
  isDisabled = false,
  contentClassName,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
  children,
}: LiftMenuRowProps) {
  const { rowRef, handleLongPress } = useLiftLongPress(onLongPress);
  const labelled = accessibilityLabel !== undefined;

  return (
    <PressableFeedback
      animation={ROW_PRESS_ANIMATION}
      onPress={onPress}
      onLongPress={handleLongPress}
      isDisabled={isDisabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole={accessibilityRole}
      // The menu behind the long-press is otherwise unreachable with a screen
      // reader on: holding a finger down is exactly the gesture VoiceOver and
      // TalkBack intercept. `longpress` is a standard action, so both systems
      // surface it in their own rotor/menu without us naming it.
      accessibilityActions={onLongPress ? [{ name: "longpress" }] : undefined}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "longpress") handleLongPress?.();
      }}
    >
      {/* `opacity-0` last so it wins over any base opacity in contentClassName. */}
      <View
        ref={rowRef}
        className={cn("w-full", contentClassName, isLifted && "opacity-0")}
        // With a composed row label the cells are already spoken; leaving them
        // reachable would repeat every figure a second time, unlabelled.
        accessibilityElementsHidden={labelled}
        importantForAccessibility={labelled ? "no-hide-descendants" : undefined}
      >
        {children}
      </View>
    </PressableFeedback>
  );
}
