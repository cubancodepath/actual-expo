import { View, Text } from "react-native";
import { cn } from "@/lib/cn";

type BadgeVariant = "default" | "primary" | "danger" | "success" | "warning";

const bgClasses: Record<BadgeVariant, string> = {
  default: "bg-default",
  primary: "bg-accent",
  danger: "bg-danger",
  success: "bg-success",
  warning: "bg-warning",
};

const textClasses: Record<BadgeVariant, string> = {
  default: "text-default-foreground",
  primary: "text-white dark:text-carbon-black-950",
  danger: "text-white dark:text-carbon-black-950",
  success: "text-success-foreground",
  warning: "text-warning-foreground",
};

type BadgeProps = {
  children: string;
  variant?: BadgeVariant;
  className?: string;
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <View className={cn("px-2 py-0.5 rounded-sm self-start", bgClasses[variant], className)}>
      <Text className={cn("text-xs font-semibold leading-none", textClasses[variant])}>
        {children}
      </Text>
    </View>
  );
}
