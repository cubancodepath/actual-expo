/**
 * useCollapsible — Apple-style collapse/expand animation.
 *
 * Combines height + opacity animations: opacity fades faster than height
 * so content becomes invisible before the clip edge is visible.
 *
 * Usage:
 * ```tsx
 * const { expanded, toggle, bodyStyle, measuringStyle, onMeasure } = useCollapsible();
 *
 * <Pressable onPress={toggle}>...</Pressable>
 * <View style={measuringStyle} onLayout={onMeasure} pointerEvents="none">
 *   <Content />
 * </View>
 * <Animated.View style={bodyStyle}>
 *   <Content />
 * </Animated.View>
 * ```
 */

import { useCallback, useState } from "react";
import type { LayoutChangeEvent, ViewStyle } from "react-native";
import { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";

const COLLAPSE_DURATION = 250;
const FADE_DURATION = 160;
const EXPAND_FADE_DELAY = 40;

export function useCollapsible(initialExpanded = true) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const contentHeight = useSharedValue(0);
  const animHeight = useSharedValue(0);
  const animOpacity = useSharedValue(initialExpanded ? 1 : 0);
  const initialized = useSharedValue(false);

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next) {
      animHeight.value = withTiming(contentHeight.value, { duration: COLLAPSE_DURATION });
      animOpacity.value = withDelay(EXPAND_FADE_DELAY, withTiming(1, { duration: FADE_DURATION }));
    } else {
      animOpacity.value = withTiming(0, { duration: FADE_DURATION });
      animHeight.value = withTiming(0, { duration: COLLAPSE_DURATION });
    }
  }

  const bodyStyle = useAnimatedStyle(() => {
    if (!initialized.value) return {};
    return {
      height: animHeight.value,
      opacity: animOpacity.value,
      overflow: "hidden" as const,
    };
  });

  const onMeasure = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    contentHeight.value = h;
    if (!initialized.value) {
      initialized.value = true;
      animHeight.value = h;
    }
  }, []);

  const measuringStyle: ViewStyle = {
    position: "absolute",
    left: -9999,
    opacity: 0,
  };

  return { expanded, toggle, bodyStyle, measuringStyle, onMeasure };
}
