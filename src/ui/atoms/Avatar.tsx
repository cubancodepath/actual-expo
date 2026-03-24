import { View, Text } from "react-native";
import { cn } from "@/lib/cn";

type AvatarSize = "sm" | "md" | "lg";

const sizeClasses: Record<AvatarSize, string> = {
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-14 h-14",
};

const textSizeClasses: Record<AvatarSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-lg",
};

type AvatarProps = {
  label: string;
  size?: AvatarSize;
  className?: string;
};

export function Avatar({ label, size = "md", className }: AvatarProps) {
  const initials = label
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <View
      className={cn(
        "rounded-full bg-accent items-center justify-center",
        sizeClasses[size],
        className,
      )}
    >
      <Text className={cn("text-accent-foreground font-semibold", textSizeClasses[size])}>
        {initials}
      </Text>
    </View>
  );
}
