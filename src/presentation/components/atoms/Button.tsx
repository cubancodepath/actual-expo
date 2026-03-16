import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "./Text";
import type { Theme } from "../../../theme";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  textColor?: string;
  style?: ViewStyle;
}

const sizeMap = {
  sm: { paddingVertical: 6, paddingHorizontal: 12, fontSize: 13 as const },
  md: { paddingVertical: 10, paddingHorizontal: 16, fontSize: 14 as const },
  lg: { paddingVertical: 14, paddingHorizontal: 24, fontSize: 16 as const },
} as const;

const radiusMap: Record<ButtonSize, keyof Theme["borderRadius"]> = {
  sm: "full",
  md: "full",
  lg: "full",
};

function getVariantStyles(theme: Theme, variant: ButtonVariant, size: ButtonSize) {
  const { colors } = theme;
  const borderRadius = theme.borderRadius[radiusMap[size]];
  switch (variant) {
    case "primary":
      return {
        container: { backgroundColor: colors.primary, borderRadius },
        text: colors.primaryText,
      };
    case "secondary":
      return {
        container: { backgroundColor: colors.buttonSecondaryBackground, borderRadius },
        text: colors.buttonSecondaryText,
      };
    case "ghost":
      return {
        container: { backgroundColor: "transparent", borderRadius },
        text: colors.primary,
      };
    case "danger":
      return {
        container: { backgroundColor: colors.buttonDangerBackground, borderRadius },
        text: colors.buttonDangerText,
      };
  }
}

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  disabled = false,
  textColor,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const variantStyles = getVariantStyles(theme, variant, size);
  const sizeStyles = sizeMap[size];
  const color = textColor ?? variantStyles.text;
  const contentOpacity = disabled ? 0.4 : 1;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        variantStyles.container,
        {
          paddingVertical: sizeStyles.paddingVertical,
          paddingHorizontal: sizeStyles.paddingHorizontal,
        },
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} style={{ opacity: contentOpacity }} />
      ) : (
        <>
          {icon && (
            <Ionicons
              name={icon}
              size={sizeStyles.fontSize + 4}
              color={color}
              style={{ marginRight: 6, opacity: contentOpacity }}
            />
          )}
          <Text
            variant="bodyLg"
            color={color}
            style={{ fontSize: sizeStyles.fontSize, fontWeight: "600", opacity: contentOpacity }}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  pressed: { opacity: 0.8 },
});
