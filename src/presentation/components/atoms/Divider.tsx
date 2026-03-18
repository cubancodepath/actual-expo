import { View, type ViewStyle } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";

export interface DividerProps {
  color?: string;
  /** Apply left/right inset (Apple HIG style for lists). Defaults to spacing.lg. */
  inset?: boolean;
  style?: ViewStyle;
}

export function Divider({ color, inset, style }: DividerProps) {
  const { colors, spacing } = useTheme();

  return (
    <View
      style={[
        {
          height: 1,
          backgroundColor: color ?? colors.divider,
          ...(inset ? { marginLeft: spacing.lg, marginRight: spacing.lg } : {}),
        },
        style,
      ]}
    />
  );
}
