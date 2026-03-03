import { ViewStyle } from "react-native";
import { ThemeColors } from "./colors";

export function createShadows(colors: ThemeColors) {
  return {
    card: {
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 1,
      shadowRadius: 3,
      elevation: 2,
    },
    elevated: {
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 6,
      elevation: 4,
    },
    modal: {
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 12,
      elevation: 8,
    },
  } as const satisfies Record<string, ViewStyle>;
}

export type Shadows = ReturnType<typeof createShadows>;
