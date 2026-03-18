import { ActivityIndicator, Pressable, type ViewStyle } from "react-native";
import { Icon } from "./Icon";
import type { IconName } from "./iconRegistry";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "./Text";
import type { Theme } from "../../../theme";

type ButtonStyle = "borderedProminent" | "bordered" | "borderedSecondary" | "borderless";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  title?: string;
  icon?: IconName;
  onPress: () => void;
  buttonStyle?: ButtonStyle;
  size?: ButtonSize;
  danger?: boolean;
  loading?: boolean;
  disabled?: boolean;
  color?: string;
  style?: ViewStyle;
  hitSlop?: number;
  accessibilityLabel?: string;
}

const sizeConfig = {
  sm: { height: 30, fontSize: 13, iconSize: 15, paddingH: 12, gap: 4 },
  md: { height: 36, fontSize: 15, iconSize: 17, paddingH: 16, gap: 6 },
  lg: { height: 48, fontSize: 17, iconSize: 19, paddingH: 24, gap: 8 },
} as const;

function getButtonColors(
  theme: Theme,
  buttonStyle: ButtonStyle,
  danger: boolean,
): { bg: string; text: string; border?: string } {
  const { colors } = theme;

  if (danger) {
    switch (buttonStyle) {
      case "borderedProminent":
        return { bg: colors.negative, text: colors.primaryText };
      case "bordered":
        return {
          bg: colors.buttonDangerBackground,
          text: colors.buttonDangerText,
          border: colors.buttonDangerText,
        };
      case "borderedSecondary":
        return { bg: colors.buttonDangerBackground, text: colors.buttonDangerText };
      case "borderless":
        return { bg: "transparent", text: colors.buttonDangerText };
    }
  }

  switch (buttonStyle) {
    case "borderedProminent":
      return { bg: colors.primary, text: colors.primaryText };
    case "bordered":
      return { bg: colors.primarySubtle, text: colors.primary, border: colors.primary };
    case "borderedSecondary":
      return { bg: colors.buttonSecondaryBackground, text: colors.buttonSecondaryText };
    case "borderless":
      return { bg: "transparent", text: colors.primary };
  }
}

export function Button({
  title,
  icon,
  onPress,
  buttonStyle = "borderedProminent",
  size = "md",
  danger = false,
  loading = false,
  disabled = false,
  color: colorOverride,
  style,
  hitSlop = 8,
  accessibilityLabel,
}: ButtonProps) {
  const theme = useTheme();
  const { bg, text, border } = getButtonColors(theme, buttonStyle, danger);
  const tint = colorOverride ?? text;
  const cfg = sizeConfig[size];
  const isIconOnly = !title && !!icon;
  const contentOpacity = disabled ? 0.4 : 1;

  const containerStyle: ViewStyle = isIconOnly
    ? {
        width: cfg.height,
        height: cfg.height,
        borderRadius: cfg.height / 2,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
        ...(border ? { borderWidth: theme.borderWidth.default, borderColor: border } : {}),
      }
    : {
        height: cfg.height,
        paddingHorizontal: cfg.paddingH,
        borderRadius: theme.borderRadius.full,
        backgroundColor: bg,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: cfg.gap,
        ...(border ? { borderWidth: theme.borderWidth.default, borderColor: border } : {}),
      };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={({ pressed }) => [containerStyle, pressed && { opacity: 0.8 }, style]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tint} style={{ opacity: contentOpacity }} />
      ) : (
        <>
          {icon && (
            <Icon
              name={icon}
              size={cfg.iconSize}
              color={tint}
              style={{ opacity: contentOpacity }}
            />
          )}
          {title && (
            <Text
              variant="body"
              color={tint}
              style={{ fontSize: cfg.fontSize, fontWeight: "600", opacity: contentOpacity }}
            >
              {title}
            </Text>
          )}
        </>
      )}
    </Pressable>
  );
}
