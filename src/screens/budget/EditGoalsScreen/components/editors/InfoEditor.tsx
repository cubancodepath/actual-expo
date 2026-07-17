import { View } from "react-native";
import { Typography } from "heroui-native";

/**
 * Editor body for goals with nothing to configure beyond their amount —
 * refill (it just tops the category back up to its cap) and the long-term
 * goal (a balance target, edited entirely through the amount headline).
 */
export function InfoEditor({ message }: { message: string }) {
  return (
    <View className="rounded-xl bg-surface p-4">
      <Typography className="text-sm text-muted">{message}</Typography>
    </View>
  );
}
