import { View } from "react-native";
import { cn } from "@/lib/cn";

type DividerProps = {
  className?: string;
};

export function Divider({ className }: DividerProps) {
  return <View className={cn("h-px bg-separator", className)} />;
}
