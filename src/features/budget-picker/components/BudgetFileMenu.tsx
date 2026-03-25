import { Alert as RNAlert } from "react-native";
import { Menu } from "heroui-native";
import { useTranslation } from "react-i18next";
import { Button, Icon } from "@/ui";
import type { ReconciledBudgetFile } from "@/services/budgetfiles";

type BudgetFileMenuProps = {
  file: ReconciledBudgetFile;
  onUpload: (file: ReconciledBudgetFile) => void;
  onDelete: (file: ReconciledBudgetFile, fromServer?: boolean) => void;
  onDownload: (file: ReconciledBudgetFile) => void;
  onConvertToLocal: (file: ReconciledBudgetFile) => void;
  onReRegister: (file: ReconciledBudgetFile) => void;
};

export function BudgetFileMenu({
  file,
  onUpload,
  onDelete,
  onDownload,
  onConvertToLocal,
  onReRegister,
}: BudgetFileMenuProps) {
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation("common");
  const name = file.name || t("unnamedBudget");

  function confirmDelete(fromServer?: boolean) {
    if (file.state === "synced" && fromServer) {
      RNAlert.alert(t("deleteBudget"), t("deleteBudgetSynced", { name }), [
        { text: tc("cancel"), style: "cancel" },
        {
          text: t("deleteFromAllDevices"),
          style: "destructive",
          onPress: () => onDelete(file, true),
        },
      ]);
    } else if (file.state === "remote") {
      RNAlert.alert(t("deleteBudget"), t("deleteBudgetFromServer", { name }), [
        { text: tc("cancel"), style: "cancel" },
        { text: t("deleteFromServer"), style: "destructive", onPress: () => onDelete(file, true) },
      ]);
    } else {
      RNAlert.alert(t("deleteBudget"), t("deleteBudgetLocal", { name }), [
        { text: tc("cancel"), style: "cancel" },
        { text: tc("delete"), style: "destructive", onPress: () => onDelete(file, false) },
      ]);
    }
  }

  return (
    <Menu presentation="bottom-sheet">
      <Menu.Trigger asChild>
        <Button variant="ghost" size="sm" isIconOnly feedbackVariant="none">
          <Icon name="EllipsisVertical" size={18} themeColor="muted" />
        </Button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Overlay />
        <Menu.Content presentation="bottom-sheet">
          <Menu.Label>{t("fileActions")}</Menu.Label>

          {file.state === "local" && (
            <Menu.Item onPress={() => onUpload(file)}>
              <Icon name="CloudUpload" size={18} themeColor="accent" />
              <Menu.ItemTitle>{t("uploadToServer")}</Menu.ItemTitle>
            </Menu.Item>
          )}

          {file.state === "remote" && (
            <Menu.Item onPress={() => onDownload(file)}>
              <Icon name="CloudDownload" size={18} themeColor="accent" />
              <Menu.ItemTitle>{tc("download")}</Menu.ItemTitle>
            </Menu.Item>
          )}

          {file.state === "detached" && (
            <>
              <Menu.Item onPress={() => onReRegister(file)}>
                <Icon name="CloudUpload" size={18} themeColor="accent" />
                <Menu.ItemTitle>{t("reUploadToServer")}</Menu.ItemTitle>
              </Menu.Item>
              <Menu.Item onPress={() => onConvertToLocal(file)}>
                <Icon name="HardDrive" size={18} themeColor="muted" />
                <Menu.ItemTitle>{t("keepLocalOnly")}</Menu.ItemTitle>
              </Menu.Item>
            </>
          )}

          {file.state === "synced" && (
            <Menu.Item variant="danger" onPress={() => confirmDelete(false)}>
              <Icon name="Trash2" size={18} themeColor="danger" />
              <Menu.ItemTitle>{t("deleteLocally")}</Menu.ItemTitle>
            </Menu.Item>
          )}

          <Menu.Item
            variant="danger"
            onPress={() => confirmDelete(file.state === "synced" || file.state === "remote")}
          >
            <Icon name="Trash2" size={18} themeColor="danger" />
            <Menu.ItemTitle>
              {file.state === "synced"
                ? t("deleteFromAllDevices")
                : file.state === "remote"
                  ? t("deleteFromServer")
                  : tc("delete")}
            </Menu.ItemTitle>
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu>
  );
}
