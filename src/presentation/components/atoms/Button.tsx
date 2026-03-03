import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from "react-native";
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
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

const sizeMap = {
  sm: { paddingVertical: 6, paddingHorizontal: 12, fontSize: 13 as const },
  md: { paddingVertical: 10, paddingHorizontal: 16, fontSize: 14 as const },
  lg: { paddingVertical: 14, paddingHorizontal: 24, fontSize: 16 as const },
} as const;

function getVariantStyles(theme: Theme, variant: ButtonVariant) {
  const { colors, borderRadius } = theme;
  switch (variant) {
    case "primary":
      return {
        container: { backgroundColor: colors.primary, borderRadius: borderRadius.md },
        text: colors.primaryText,
      };
    case "secondary":
      return {
        container: { backgroundColor: colors.buttonSecondaryBackground, borderRadius: borderRadius.md },
        text: colors.buttonSecondaryText,
      };
    case "ghost":
      return {
        container: { backgroundColor: "transparent", borderRadius: borderRadius.md },
        text: colors.primary,
      };
    case "danger":
      return {
        container: { backgroundColor: colors.buttonDangerBackground, borderRadius: borderRadius.md },
        text: colors.buttonDangerText,
      };
  }
}

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const variantStyles = getVariantStyles(theme, variant);
  const sizeStyles = sizeMap[size];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        variantStyles.container,
        { paddingVertical: sizeStyles.paddingVertical, paddingHorizontal: sizeStyles.paddingHorizontal },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variantStyles.text} />
      ) : (
        <Text
          variant="bodyLg"
          color={variantStyles.text}
          style={{ fontSize: sizeStyles.fontSize, fontWeight: "600" }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
