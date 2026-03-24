import { Spinner as HeroSpinner } from "heroui-native";
import type { ComponentProps } from "react";
import { useThemeColor } from "heroui-native";
import type { ThemeColor } from "@/ui/types";

type SpinnerProps = Omit<ComponentProps<typeof HeroSpinner>, "color"> & {
  themeColor?: ThemeColor;
  color?: string;
};

export function Spinner({ themeColor = "accent", color, ...props }: SpinnerProps) {
  const resolved = useThemeColor(themeColor);
  return <HeroSpinner color={color ?? resolved} {...props} />;
}
