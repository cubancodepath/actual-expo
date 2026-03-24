import { View, Text } from "react-native";
import Icon from "@/ui/atoms/Icon";
import { Button } from "@/ui/atoms/Button";
import type { IconName } from "@/ui/atoms/Icon";
import { cn } from "@/lib/cn";

type EmptyStateProps = {
  icon: IconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <View className={cn("items-center justify-center py-12 px-6 gap-4", className)}>
      <Icon name={icon} size={48} themeColor="muted" />
      <View className="items-center gap-1">
        <Text className="text-foreground text-lg font-semibold text-center">{title}</Text>
        {description && <Text className="text-muted text-sm text-center">{description}</Text>}
      </View>
      {actionLabel && onAction && (
        <Button variant="primary" onPress={onAction}>
          {actionLabel}
        </Button>
      )}
    </View>
  );
}
