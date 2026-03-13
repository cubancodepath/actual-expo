import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../providers/ThemeProvider";

export interface IconProps {
  name: keyof typeof Ionicons.glyphMap;
  size?: number;
  color?: string;
  accessibilityLabel?: string;
}

export function Icon({ name, size = 22, color, accessibilityLabel }: IconProps) {
  const { colors } = useTheme();

  return (
    <Ionicons
      name={name}
      size={size}
      color={color ?? colors.textPrimary}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
