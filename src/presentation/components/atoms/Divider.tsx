import { View, type ViewStyle } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";

export interface DividerProps {
  color?: string;
  style?: ViewStyle;
}

export function Divider({ color, style }: DividerProps) {
  const { colors } = useTheme();

  return <View style={[{ height: 1, backgroundColor: color ?? colors.divider }, style]} />;
}
