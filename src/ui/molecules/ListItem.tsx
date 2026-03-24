import type { ReactNode } from "react";
import { Pressable, View, Text } from "react-native";
import Icon from "@/ui/atoms/Icon";
import { cn } from "@/lib/cn";

type ListItemProps = {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  showChevron?: boolean;
  onPress?: () => void;
  className?: string;
};

export function ListItem({
  icon,
  title,
  subtitle,
  trailing,
  showChevron,
  onPress,
  className,
}: ListItemProps) {
  const content = (
    <View className={cn("flex-row items-center px-4 py-3 gap-3", className)}>
      {icon && <View className="items-center justify-center">{icon}</View>}
      <View className="flex-1 gap-0.5">
        <Text className="text-foreground text-base">{title}</Text>
        {subtitle && <Text className="text-muted text-sm">{subtitle}</Text>}
      </View>
      {trailing && <View>{trailing}</View>}
      {showChevron && <Icon name="ChevronRight" size={16} themeColor="muted" />}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} className="active:opacity-80">
        {content}
      </Pressable>
    );
  }

  return content;
}
