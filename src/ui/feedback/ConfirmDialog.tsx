import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Button, Dialog } from "heroui-native";
import { SurfaceLevel } from "@/ui/surface-level";

export type ConfirmAction = {
  label: string;
  onPress: () => void;
  isDestructive?: boolean;
};

export type ConfirmRequest = {
  title: string;
  description: string;
  actions: ConfirmAction[];
};

type ConfirmDialogProps = {
  /** The pending confirmation, or null when closed. */
  request: ConfirmRequest | null;
  onClose: () => void;
};

/**
 * heroui Dialog replacement for Alert.alert confirmations: title,
 * description, one button per action plus an implicit Cancel.
 */
export function ConfirmDialog({ request, onClose }: ConfirmDialogProps) {
  const { t } = useTranslation("common");

  return (
    <Dialog isOpen={request !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <SurfaceLevel context="sheet">
            <View className="mb-5 gap-1.5">
              <Dialog.Title>{request?.title}</Dialog.Title>
              <Dialog.Description>{request?.description}</Dialog.Description>
            </View>
            <View className="gap-2">
              {request?.actions.map((action) => (
                <Button
                  key={action.label}
                  variant={action.isDestructive ? "danger" : "primary"}
                  onPress={() => {
                    onClose();
                    action.onPress();
                  }}
                >
                  <Button.Label>{action.label}</Button.Label>
                </Button>
              ))}
              <Button variant="ghost" onPress={onClose}>
                <Button.Label>{t("cancel")}</Button.Label>
              </Button>
            </View>
          </SurfaceLevel>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
