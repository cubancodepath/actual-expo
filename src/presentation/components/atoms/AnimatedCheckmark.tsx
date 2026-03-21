/**
 * AnimatedCheckmark — Apple-style checkmark with native SF Symbol animation.
 *
 * On iOS: Uses SF Symbol `appear` effect (iOS 17+) for native fade+scale.
 * EaseView provides the container spring animation (cross-platform).
 *
 * Use with conditional rendering: `{isSelected && <AnimatedCheckmark />}`
 * The mount triggers the entrance animation; unmount removes instantly.
 */

import { Platform } from "react-native";
import { AnimatedView } from "./AnimatedView";
import { Icon } from "./Icon";

interface AnimatedCheckmarkProps {
  color: string;
  size?: number;
}

export function AnimatedCheckmark({ color, size = 20 }: AnimatedCheckmarkProps) {
  return (
    <AnimatedView
      initialAnimate={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", damping: 14, stiffness: 250, mass: 0.8 }}
    >
      <Icon
        name="checkmark"
        size={size}
        color={color}
        animationSpec={
          Platform.OS === "ios" ? { effect: { type: "bounce" }, repeating: false } : undefined
        }
      />
    </AnimatedView>
  );
}
