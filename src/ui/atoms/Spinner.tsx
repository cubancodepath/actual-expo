import { Spinner as HeroSpinner } from "heroui-native";
import type { ComponentProps } from "react";
import { useThemeColor } from "heroui-native";

type SpinnerProps = Omit<ComponentProps<typeof HeroSpinner>, "color"> & {
  themeColor?: string;
  color?: string;
};

export function Spinner({ themeColor = "accent", color, ...props }: SpinnerProps) {
  const resolved = useThemeColor(themeColor);
  return <HeroSpinner color={color ?? resolved} {...props} />;
}
