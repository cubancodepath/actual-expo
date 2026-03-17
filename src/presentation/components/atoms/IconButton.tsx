import { Pressable, StyleSheet, type ViewStyle } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import { Icon } from "./Icon";
import type { IconName } from "./iconRegistry";

export type IconButtonProps = {
  name: IconName;
  size?: number;
  color?: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  hitSlop?: number;
  accessibilityLabel?: string;
};

export function IconButton({
  name,
  size = 22,
  color,
  onPress,
  disabled = false,
  style,
  hitSlop = 8,
  accessibilityLabel,
}: IconButtonProps) {
  const { colors } = useTheme();
  const tint = color ?? colors.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Icon name={name} size={size} color={tint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
});
