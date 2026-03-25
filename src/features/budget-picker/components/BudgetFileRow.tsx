import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Button, Icon, Spinner } from "@/ui";
import { ListItem } from "@/ui/molecules";
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
  onActionPress?: () => void;
};

export const BudgetFileRow = memo(function BudgetFileRow({
  file,
  isSelecting,
  isActionInProgress,
  onPress,
  onActionPress,
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

  const trailing =
    isSelecting || isActionInProgress ? (
      <Spinner themeColor="accent" />
    ) : onActionPress ? (
      <Button variant="ghost" size="sm" isIconOnly feedbackVariant="none" onPress={onActionPress}>
        <Icon name="EllipsisVertical" size={18} themeColor="muted" />
      </Button>
    ) : null;

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
