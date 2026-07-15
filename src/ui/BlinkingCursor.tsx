import { useEffect } from "react";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

interface BlinkingCursorProps {
  color: string;
  /** Caret height (default 20 — pass larger for hero-sized amounts). */
  height?: number;
  /** Caret width (default 2). */
  width?: number;
}

/**
 * Thin caret that blinks while mounted (respects Reduce Motion). Callers mount
 * it only while the field is focused, so there's no `active` prop.
 */
export function BlinkingCursor({ color, height = 20, width = 2 }: BlinkingCursorProps) {
  const opacity = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    cancelAnimation(opacity);
    if (reducedMotion) {
      opacity.value = 1;
      return;
    }
    opacity.value = 1;
    opacity.value = withRepeat(withTiming(0, { duration: 500 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [reducedMotion, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        { width, height, marginLeft: 3, borderRadius: width, backgroundColor: color },
        animatedStyle,
      ]}
    />
  );
}
