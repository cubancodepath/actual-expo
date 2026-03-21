/**
 * CollapsibleRow — Apple-style animated row for use inside SectionList.
 *
 * Uses scaleY + height animation so that children always render at their
 * natural size. This prevents adjustsFontSizeToFit from shrinking text
 * during the collapse animation (height animation alone constrains layout
 * and the Text measurement "sticks" at the small size).
 */

import { type ReactNode, useCallback, useEffect } from "react";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

const DURATION = 250;

export function CollapsibleRow({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: ReactNode;
}) {
  const contentHeight = useSharedValue(0);
  const progress = useSharedValue(collapsed ? 0 : 1);
  const initialized = useSharedValue(false);

  const onLayout = useCallback(
    (e: { nativeEvent: { layout: { height: number } } }) => {
      const h = e.nativeEvent.layout.height;
      if (h > 0) {
        const prev = contentHeight.value;
        contentHeight.value = h;
        if (!initialized.value) {
          initialized.value = true;
          progress.value = collapsed ? 0 : 1;
        } else if (h !== prev && !collapsed) {
          // Content height changed while expanded — snap immediately
          contentHeight.value = h;
        }
      }
    },
    [collapsed],
  );

  useEffect(() => {
    if (!initialized.value) return;
    progress.value = withTiming(collapsed ? 0 : 1, { duration: DURATION });
  }, [collapsed]);

  // Outer: animated height for SectionList spacing + clip
  const outerStyle = useAnimatedStyle(() => {
    if (!initialized.value) {
      return collapsed ? { height: 0, overflow: "hidden" as const, opacity: 0 } : {};
    }
    return {
      height: contentHeight.value * progress.value,
      overflow: "hidden" as const,
    };
  });

  // Inner: scaleY for visual collapse — layout stays at natural size
  // so adjustsFontSizeToFit always calculates with full available space
  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: progress.value }],
    opacity: progress.value,
    transformOrigin: "top",
  }));

  return (
    <Animated.View style={outerStyle}>
      <Animated.View style={innerStyle} onLayout={onLayout}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}
