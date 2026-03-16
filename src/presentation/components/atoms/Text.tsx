import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import type { TypographyVariant } from "../../../theme";

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: string;
  align?: "left" | "center" | "right";
}

export function Text({ variant = "body", color, align, style, ...props }: TextProps) {
  const { colors, typography } = useTheme();

  return (
    <RNText
      style={[
        typography[variant],
        { color: color ?? colors.textPrimary },
        align && { textAlign: align },
        style,
      ]}
      {...props}
    />
  );
}
