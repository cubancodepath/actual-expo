import { Menu } from "heroui-native";
import { useTranslation } from "react-i18next";
import { Button, Icon } from "@/ui";

type LocalBudgetMenuProps = {
  onDelete: () => void;
};

export function LocalBudgetMenu({ onDelete }: LocalBudgetMenuProps) {
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation("common");

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
          <Menu.Item variant="danger" onPress={onDelete}>
            <Icon name="Trash2" size={18} themeColor="danger" />
            <Menu.ItemTitle>{tc("delete")}</Menu.ItemTitle>
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu>
  );
}
