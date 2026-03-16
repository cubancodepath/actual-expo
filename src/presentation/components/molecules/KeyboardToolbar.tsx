import type { ReactNode } from "react";
import type { ViewStyle, StyleProp } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useTheme } from "../../providers/ThemeProvider";
import { useKeyboardHeight } from "../../hooks/useKeyboardHeight";

type KeyboardToolbarProps = {
  children: ReactNode;
  /** Extra visibility condition (e.g. editMode). Defaults to keyboard visible. */
  visible?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Horizontal toolbar that floats above the keyboard.
 * Renders children in a row with standard padding.
 */
export function KeyboardToolbar({ children, visible, style }: KeyboardToolbarProps) {
  const { spacing } = useTheme();
  const { height: keyboardHeight, visible: keyboardVisible } = useKeyboardHeight();

  const animatedStyle = useAnimatedStyle(() => ({
    bottom: keyboardHeight.value,
  }));

  const isVisible = visible !== undefined ? visible : keyboardVisible;
  if (!isVisible) return null;

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          zIndex: 10,
          flexDirection: "row",
          gap: spacing.sm,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: spacing.md,
        },
        animatedStyle,
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}
