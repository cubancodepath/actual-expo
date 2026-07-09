import type { ComponentProps } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { withUniwind } from "uniwind";
import { useTranslation } from "react-i18next";
import { BottomSheet, ListGroup, Separator } from "heroui-native";
import type { ReconciledBudgetFile } from "@/services/budgetfiles";

const StyledIonicons = withUniwind(Ionicons);

export type FileAction =
  | "upload"
  | "reRegister"
  | "keepLocal"
  | "download"
  | "deleteLocal"
  | "deleteEverywhere"
  | "deleteServer";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

type SheetOption = {
  action: FileAction;
  labelKey: string;
  namespace: "auth" | "settings" | "common";
  icon: IoniconName;
  isDestructive?: boolean;
};

const OPTIONS_BY_STATE: Record<ReconciledBudgetFile["state"], SheetOption[]> = {
  local: [
    {
      action: "upload",
      labelKey: "uploadToServer",
      namespace: "auth",
      icon: "cloud-upload-outline",
    },
    {
      action: "deleteLocal",
      labelKey: "deleteFromDevice",
      namespace: "settings",
      icon: "trash-outline",
      isDestructive: true,
    },
  ],
  synced: [
    {
      action: "deleteLocal",
      labelKey: "deleteFromDevice",
      namespace: "settings",
      icon: "phone-portrait-outline",
    },
    {
      action: "deleteEverywhere",
      labelKey: "deleteFromAllDevices",
      namespace: "settings",
      icon: "trash-outline",
      isDestructive: true,
    },
  ],
  detached: [
    {
      action: "reRegister",
      labelKey: "reUploadToServer",
      namespace: "auth",
      icon: "cloud-upload-outline",
    },
    {
      action: "keepLocal",
      labelKey: "keepLocalOnly",
      namespace: "auth",
      icon: "phone-portrait-outline",
    },
    {
      action: "deleteLocal",
      labelKey: "deleteFromDevice",
      namespace: "settings",
      icon: "trash-outline",
      isDestructive: true,
    },
  ],
  remote: [
    {
      action: "download",
      labelKey: "download",
      namespace: "common",
      icon: "cloud-download-outline",
    },
    {
      action: "deleteServer",
      labelKey: "deleteFromServer",
      namespace: "auth",
      icon: "trash-outline",
      isDestructive: true,
    },
  ],
};

type FileActionsSheetProps = {
  /** The file whose actions are shown, or null when closed. */
  file: ReconciledBudgetFile | null;
  onClose: () => void;
  onAction: (action: FileAction, file: ReconciledBudgetFile) => void;
};

/** Detached bottom sheet listing the per-state actions for a budget file. */
export function FileActionsSheet({ file, onClose, onAction }: FileActionsSheetProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation("common");
  const { t: ts } = useTranslation("settings");

  // Dynamic namespaced keys — i18next's typed overloads reject a runtime union.
  const translate: Record<SheetOption["namespace"], (key: string) => string> = {
    auth: t as (key: string) => string,
    settings: ts as (key: string) => string,
    common: tc as (key: string) => string,
  };
  const options = file ? OPTIONS_BY_STATE[file.state] : [];

  return (
    <BottomSheet isOpen={file !== null} onOpenChange={(open) => !open && onClose()}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          detached
          bottomInset={insets.bottom + 12}
          className="mx-4"
          backgroundClassName="rounded-[28px]"
        >
          <View className="gap-1 px-1 pb-2 pt-1">
            <BottomSheet.Title>{file?.name || t("unnamedBudget")}</BottomSheet.Title>
            <BottomSheet.Description>{t("fileActions")}</BottomSheet.Description>
          </View>
          <ListGroup variant="transparent">
            {options.map((option, index) => {
              const label = translate[option.namespace](option.labelKey);
              return (
                <View key={option.action}>
                  {index > 0 && <Separator className="mx-4" />}
                  <ListGroup.Item
                    onPress={() => {
                      onClose();
                      if (file) onAction(option.action, file);
                    }}
                  >
                    <ListGroup.ItemPrefix>
                      <StyledIonicons
                        name={option.icon}
                        size={20}
                        className={option.isDestructive ? "text-danger" : "text-foreground"}
                      />
                    </ListGroup.ItemPrefix>
                    <ListGroup.ItemContent>
                      <ListGroup.ItemTitle
                        className={option.isDestructive ? "text-danger" : undefined}
                      >
                        {label}
                      </ListGroup.ItemTitle>
                    </ListGroup.ItemContent>
                  </ListGroup.Item>
                </View>
              );
            })}
          </ListGroup>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
