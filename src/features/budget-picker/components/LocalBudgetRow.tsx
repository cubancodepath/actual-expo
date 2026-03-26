import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Icon, Spinner } from "@/ui";
import { ListItem } from "@/ui/molecules";
import { LocalBudgetMenu } from "./LocalBudgetMenu";
import type { BudgetMetadata } from "@/services/budgetMetadata";
import type { IconName } from "@/ui/atoms/Icon";
import type { ThemeColor } from "@/ui/types";

function metaIcon(meta: BudgetMetadata): { name: IconName; color: ThemeColor } {
  if (meta.cloudFileId) return { name: "CloudOff", color: "warning" };
  return { name: "HardDrive", color: "muted" };
}

type LocalBudgetRowProps = {
  meta: BudgetMetadata;
  isSelecting: boolean;
  onPress: () => void;
  onDelete: () => void;
};

export const LocalBudgetRow = memo(function LocalBudgetRow({
  meta,
  isSelecting,
  onPress,
  onDelete,
}: LocalBudgetRowProps) {
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation("common");

  const icon = metaIcon(meta);
  const subtitle = meta.cloudFileId ? tc("fileState.detached") : tc("fileState.local");

  const trailing = isSelecting ? (
    <Spinner themeColor="accent" />
  ) : (
    <LocalBudgetMenu onDelete={onDelete} />
  );

  return (
    <ListItem
      className="px-0"
      icon={<Icon name={icon.name} size={20} themeColor={icon.color} />}
      title={meta.budgetName || t("unnamedBudget")}
      subtitle={subtitle}
      trailing={trailing}
      onPress={isSelecting ? undefined : onPress}
    />
  );
});
