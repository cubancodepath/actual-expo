/**
 * CollapsibleRow — Apple-style animated row for use inside SectionList.
 *
 * Animates height + opacity when `collapsed` changes.
 * Opacity fades faster than height so content is invisible before clip edge.
 * Keeps the row in the list (preserves SectionList layout + sticky headers).
 */

import { type ReactNode, useCallback, useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

const HEIGHT_DURATION = 250;
const FADE_DURATION = 160;
const EXPAND_FADE_DELAY = 40;

export function CollapsibleRow({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: ReactNode;
}) {
  const contentHeight = useSharedValue(0);
  const animHeight = useSharedValue(0);
  const animOpacity = useSharedValue(collapsed ? 0 : 1);
  const initialized = useSharedValue(false);

  const onLayout = useCallback(
    (e: { nativeEvent: { layout: { height: number } } }) => {
      const h = e.nativeEvent.layout.height;
      if (h > 0) {
        const prev = contentHeight.value;
        contentHeight.value = h;
        if (!initialized.value) {
          initialized.value = true;
          animHeight.value = collapsed ? 0 : h;
          animOpacity.value = collapsed ? 0 : 1;
        } else if (h !== prev && !collapsed) {
          // Content height changed while expanded (e.g. progress bar toggled)
          // — snap to new height immediately to avoid double-animation
          animHeight.value = h;
        }
      }
    },
    [collapsed],
  );

  useEffect(() => {
    if (!initialized.value) return;
    if (collapsed) {
      animOpacity.value = withTiming(0, { duration: FADE_DURATION });
      animHeight.value = withTiming(0, { duration: HEIGHT_DURATION });
    } else {
      animHeight.value = withTiming(contentHeight.value, { duration: HEIGHT_DURATION });
      animOpacity.value = withDelay(EXPAND_FADE_DELAY, withTiming(1, { duration: FADE_DURATION }));
    }
  }, [collapsed]);

  const style = useAnimatedStyle(() => {
    if (!initialized.value)
      return collapsed ? { height: 0, overflow: "hidden" as const, opacity: 0 } : {};
    return {
      height: animHeight.value,
      opacity: animOpacity.value,
      overflow: "hidden" as const,
    };
  });

  return (
    <Animated.View style={style}>
      {/* Inner view for measurement — always at natural height */}
      <Animated.View onLayout={onLayout}>{children}</Animated.View>
    </Animated.View>
  );
}
