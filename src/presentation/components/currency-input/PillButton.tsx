import { Pressable } from "react-native";
import { SymbolView } from "expo-symbols";

const PILL_ICON_SIZE = 20;

interface PillButtonProps {
  icon: Parameters<typeof SymbolView>[0]["name"];
  color: string;
  onPress: () => void;
  label?: string;
}

export function PillButton({ icon, color, onPress, label }: PillButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        paddingHorizontal: 6,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: pressed ? "rgba(255,255,255,0.12)" : "transparent",
      })}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <SymbolView name={icon} size={PILL_ICON_SIZE} tintColor={color} />
    </Pressable>
  );
}
