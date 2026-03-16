import { View } from "react-native";

const DIVIDER_HEIGHT = 20;

export function PillDivider({ color }: { color: string }) {
  return (
    <View
      style={{
        width: 1,
        height: DIVIDER_HEIGHT,
        backgroundColor: color,
        opacity: 0.3,
        marginHorizontal: 4,
      }}
    />
  );
}
