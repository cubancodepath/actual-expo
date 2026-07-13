import { Button, useThemeColor } from "heroui-native";
import { X } from "lucide-react-native";

export const CloseButton = ({ onPress }: { onPress?: () => void }) => {
  const foreground = useThemeColor("foreground");
  return (
    <Button onPress={onPress} variant="secondary" isIconOnly className="rounded-full">
      <X size={32} color={foreground} />
    </Button>
  );
};
