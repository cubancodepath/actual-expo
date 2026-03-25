import { View, Text, Pressable } from "react-native";
import { cn } from "@/lib/cn";

type SectionHeaderProps = {
  title: string;
  action?: string;
  onAction?: () => void;
  className?: string;
};

export function SectionHeader({ title, action, onAction, className }: SectionHeaderProps) {
  return (
    <View className={cn("flex-row items-center justify-between", className)}>
      <Text className="text-muted text-xs font-medium uppercase tracking-widest">{title}</Text>
      {action && onAction && (
        <Pressable onPress={onAction} className="active:opacity-70">
          <Text className="text-accent text-sm font-medium">{action}</Text>
        </Pressable>
      )}
    </View>
  );
}
