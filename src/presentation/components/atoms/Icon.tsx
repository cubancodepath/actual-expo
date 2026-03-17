import { Platform, View, type TextStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SymbolView } from "expo-symbols";
import { useTheme } from "../../providers/ThemeProvider";
import { iconRegistry, type IconName } from "./iconRegistry";

export type { IconName } from "./iconRegistry";

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: TextStyle;
  accessibilityLabel?: string;
}

export function Icon({ name, size = 22, color, style, accessibilityLabel }: IconProps) {
  const { colors } = useTheme();
  const tint = color ?? colors.textPrimary;
  const entry = iconRegistry[name];

  if (Platform.OS === "ios") {
    const symbol = <SymbolView name={entry.sfSymbol} size={size} tintColor={tint} />;

    if (style) {
      return (
        <View
          style={style}
          accessible={!!accessibilityLabel}
          accessibilityLabel={accessibilityLabel}
        >
          {symbol}
        </View>
      );
    }

    return (
      <View accessible={!!accessibilityLabel} accessibilityLabel={accessibilityLabel}>
        {symbol}
      </View>
    );
  }

  return (
    <Ionicons
      name={entry.ionicon}
      size={size}
      color={tint}
      style={style}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
