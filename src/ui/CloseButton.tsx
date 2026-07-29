import { useTranslation } from "react-i18next";
import { Button, useThemeColor } from "heroui-native";
import { X } from "lucide-react-native";

export const CloseButton = ({
  onPress,
  /** Override when "Close" understates what is being dismissed. */
  accessibilityLabel,
}: {
  onPress?: () => void;
  accessibilityLabel?: string;
}) => {
  const foreground = useThemeColor("foreground");
  const { t } = useTranslation("common");
  return (
    <Button
      onPress={onPress}
      variant="secondary"
      isIconOnly
      className="rounded-full"
      accessibilityLabel={accessibilityLabel ?? t("close")}
    >
      <X size={32} color={foreground} />
    </Button>
  );
};
