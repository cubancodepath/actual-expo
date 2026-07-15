import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const CURSOR_WIDTH = 2;
const CURSOR_HEIGHT = 20;

const styles = StyleSheet.create({
  cursor: {
    width: CURSOR_WIDTH,
    height: CURSOR_HEIGHT,
    marginLeft: 3,
    borderRadius: CURSOR_WIDTH,
  },
});

/** Thin caret that blinks while a field is focused (respects Reduce Motion). */
export function BlinkingCursor({ color, active }: { color: string; active: boolean }) {
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
