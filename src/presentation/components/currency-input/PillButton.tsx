import { Pressable } from "react-native";
import { Icon } from "../atoms/Icon";
import type { IconName } from "../atoms/iconRegistry";

const PILL_ICON_SIZE = 20;

interface PillButtonProps {
  icon: IconName;
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
      <Icon name={icon} size={PILL_ICON_SIZE} color={color} />
    </Pressable>
  );
}
