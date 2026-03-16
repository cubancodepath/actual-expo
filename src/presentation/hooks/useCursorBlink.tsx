import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { EaseView } from "react-native-ease";

/**
 * Cursor blink animation using react-native-ease (native Core Animation / Animator).
 * Respects Reduce Motion — shows static cursor when enabled.
 *
 * Usage:
 * ```tsx
 * const { renderCursor } = useCursorBlink(focused);
 * // ...
 * {renderCursor(styles.cursor, colors.primary)}
 * ```
 */
export function useCursorBlink(focused: boolean) {
  const reducedMotion = useReducedMotion();

  function renderCursor(style: ViewStyle, color: string): ReactNode {
    const cursorStyle = [style, { backgroundColor: color }];

    if (!focused) {
      return <View style={[...cursorStyle, { opacity: 0 }]} />;
    }

    if (reducedMotion) {
      return <View style={[...cursorStyle, { opacity: 1 }]} />;
    }

    return (
      <EaseView
        initialAnimate={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ type: "timing", duration: 500, easing: "easeInOut", loop: "reverse" }}
        style={cursorStyle}
      />
    );
  }

  return { renderCursor };
}
