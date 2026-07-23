import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Menu, useThemeColor } from "heroui-native";
import { Check, Eye, SkipForward, Trash2 } from "lucide-react-native";
import { LiftMenu } from "@/ui/lift-menu";

export type PreviewMenuAction = "post" | "skip" | "view" | "delete";

interface PreviewRowMenuProps {
  /** Clone of the preview row, floated above the overlay while the menu is open. */
  preview: ReactNode;
  /** One of the menu's actions was chosen — the host runs it. */
  onAction: (action: PreviewMenuAction) => void;
}

/**
 * Popover items for a schedule preview's long-press lift menu. Mirrors
 * TransactionRowMenu but offers schedule actions (post / skip / view / delete).
 */
export function PreviewRowMenu({ preview, onAction }: PreviewRowMenuProps) {
  const { t } = useTranslation("schedules");
  const foreground = useThemeColor("foreground");
  const danger = useThemeColor("danger");

  return (
    <LiftMenu.Content preview={preview} estimatedMenuHeight={230}>
      <Menu.Item className="gap-3" onPress={() => onAction("post")}>
        <Check size={18} color={foreground} />
        <Menu.ItemTitle>{t("postTransactionNow")}</Menu.ItemTitle>
      </Menu.Item>
      <Menu.Item className="gap-3" onPress={() => onAction("skip")}>
        <SkipForward size={18} color={foreground} />
        <Menu.ItemTitle>{t("skipNextDate")}</Menu.ItemTitle>
      </Menu.Item>
      <Menu.Item className="gap-3" onPress={() => onAction("view")}>
        <Eye size={18} color={foreground} />
        <Menu.ItemTitle>{t("viewSchedule")}</Menu.ItemTitle>
      </Menu.Item>
      <Menu.Item className="gap-3" onPress={() => onAction("delete")}>
        <Trash2 size={18} color={danger} />
        <Menu.ItemTitle className="text-danger">{t("deleteSchedule")}</Menu.ItemTitle>
      </Menu.Item>
    </LiftMenu.Content>
  );
}
