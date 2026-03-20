/**
 * AnimatedCheckmark — Apple-style checkmark with spring entrance animation.
 *
 * Animates scale + opacity on mount via EaseView initialAnimate.
 * Use with conditional rendering: `{isSelected && <AnimatedCheckmark />}`
 * The mount triggers the entrance animation; unmount removes instantly.
 */

import { EaseView } from "react-native-ease";
import { Icon } from "./Icon";

interface AnimatedCheckmarkProps {
  color: string;
  size?: number;
}

export function AnimatedCheckmark({ color, size = 20 }: AnimatedCheckmarkProps) {
  return (
    <EaseView
      initialAnimate={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", damping: 14, stiffness: 250, mass: 0.8 }}
    >
      <Icon name="checkmark" size={size} color={color} />
    </EaseView>
  );
}
