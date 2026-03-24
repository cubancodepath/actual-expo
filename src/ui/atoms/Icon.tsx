import * as icons from "lucide-react-native/icons";
import { useThemeColor } from "heroui-native";
import type { ThemeColor } from "@/ui/types";

export type IconName = keyof typeof icons;

interface IconProps {
  name: IconName;
  color?: string;
  themeColor?: ThemeColor;
  size?: number;
  strokeWidth?: number;
}

const Icon = ({
  name,
  color,
  themeColor = "foreground",
  size = 20,
  strokeWidth = 2,
}: IconProps) => {
  const resolved = useThemeColor(themeColor);
  const LucideIcon = icons[name];

  return <LucideIcon color={color ?? resolved} size={size} strokeWidth={strokeWidth} />;
};

export default Icon;
