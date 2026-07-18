import { View } from "react-native";
import { Spinner } from "heroui-native";
import { CloseButton } from "@/ui/CloseButton";

/**
 * Full-screen centered loading gate. `onClose` adds the floating close button
 * (top-left) so modal flows stay escapable while they load.
 */
export function LoadingScreen({ onClose }: { onClose?: () => void }) {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Spinner size="lg" />
      {onClose ? (
        <View className="absolute left-4 top-4 z-20">
          <CloseButton onPress={onClose} />
        </View>
      ) : null}
    </View>
  );
}
