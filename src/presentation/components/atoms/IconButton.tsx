import { Platform, Pressable, StyleSheet, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";
import { useTheme } from "../../providers/ThemeProvider";

type IconSource =
  | { ionIcon: keyof typeof Ionicons.glyphMap; sfSymbol?: never }
  | { sfSymbol: SFSymbol; ionIcon?: never };

export type IconButtonProps = IconSource & {
  size?: number;
  color?: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  hitSlop?: number;
  accessibilityLabel?: string;
};

export function IconButton({
  ionIcon,
  sfSymbol,
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
      {sfSymbol && Platform.OS === "ios" ? (
        <SymbolView name={sfSymbol} size={size} tintColor={tint} />
      ) : ionIcon ? (
        <Ionicons name={ionIcon} size={size} color={tint} />
      ) : null}
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
