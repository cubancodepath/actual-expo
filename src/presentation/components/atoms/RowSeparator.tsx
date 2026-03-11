import { View } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";

export interface RowSeparatorProps {
  /** Left inset — defaults to spacing.lg */
  insetLeft?: number;
  /** Right inset — defaults to spacing.lg */
  insetRight?: number;
}

/**
 * Inset separator (Apple HIG style) — absolute positioned at the bottom
 * of its parent. Doesn't touch container edges.
 *
 * Parent must have position: 'relative' (the default for RN Views).
 */
export function RowSeparator({ insetLeft, insetRight }: RowSeparatorProps) {
  const { colors, spacing, borderWidth: bw } = useTheme();
  return (
    <View
      style={{
        position: "absolute",
        bottom: 0,
        left: insetLeft ?? spacing.lg,
        right: insetRight ?? spacing.lg,
        height: bw.thin,
        backgroundColor: colors.divider,
      }}
    />
  );
}
