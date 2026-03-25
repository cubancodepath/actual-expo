import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Icon, Spinner } from "@/ui";
import { ListItem } from "@/ui/molecules";
import { BudgetFileMenu } from "./BudgetFileMenu";
import type { BudgetFileState, ReconciledBudgetFile } from "@/services/budgetfiles";
import type { IconName } from "@/ui/atoms/Icon";
import type { ThemeColor } from "@/ui/types";

const STATE_ICON: Record<BudgetFileState, IconName> = {
  synced: "Cloud",
  local: "HardDrive",
  detached: "CloudOff",
  remote: "CloudDownload",
};

const STATE_COLOR: Record<BudgetFileState, ThemeColor> = {
  synced: "accent",
  local: "muted",
  detached: "warning",
  remote: "muted",
};

type BudgetFileRowProps = {
  file: ReconciledBudgetFile;
  isSelecting?: boolean;
  isActionInProgress?: boolean;
  onPress?: () => void;
  onUpload: (file: ReconciledBudgetFile) => void;
  onDelete: (file: ReconciledBudgetFile, fromServer?: boolean) => void;
  onDownload: (file: ReconciledBudgetFile) => void;
  onConvertToLocal: (file: ReconciledBudgetFile) => void;
  onReRegister: (file: ReconciledBudgetFile) => void;
};

export const BudgetFileRow = memo(function BudgetFileRow({
  file,
  isSelecting,
  isActionInProgress,
  onPress,
  onUpload,
  onDelete,
  onDownload,
  onConvertToLocal,
  onReRegister,
}: BudgetFileRowProps) {
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation("common");

  const subtitle = [
    tc(`fileState.${file.state}`, { defaultValue: file.state }),
    file.ownerName,
    file.encryptKeyId ? tc("fileState.encrypted", { defaultValue: "Encrypted" }) : null,
  ]
    .filter(Boolean)
    .join(" \u00b7 ");

  const trailing = isActionInProgress ? (
    <Spinner themeColor="accent" />
  ) : (
    <BudgetFileMenu
      file={file}
      onUpload={onUpload}
      onDelete={onDelete}
      onDownload={onDownload}
      onConvertToLocal={onConvertToLocal}
      onReRegister={onReRegister}
    />
  );

  return (
    <ListItem
      className="px-0"
      icon={<Icon name={STATE_ICON[file.state]} size={20} themeColor={STATE_COLOR[file.state]} />}
      title={file.name || t("unnamedBudget")}
      subtitle={subtitle}
      trailing={trailing}
      onPress={isSelecting || isActionInProgress ? undefined : onPress}
    />
  );
});
