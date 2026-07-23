import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Menu, useThemeColor } from "heroui-native";
import { ArrowLeftRight, Copy, Copyright, Inbox, Trash2 } from "lucide-react-native";
import { LiftMenu } from "@/ui/lift-menu";

interface TransactionRowMenuProps {
  /** Clone of the row's content, floated above the overlay while the menu is open. */
  preview: ReactNode;
  /** Picks the Clear/Unclear label. */
  cleared: boolean;
  /** One of the menu's actions was chosen — the host runs it. */
  onAction: (action: TransactionMenuAction) => void;
}

export type TransactionMenuAction =
  | "categorize"
  | "move"
  | "toggleCleared"
  | "duplicate"
  | "delete";

/**
 * Popover items for a transaction's long-press lift menu. Rendered from
 * `TransactionRowMenuHost`'s `LiftMenu.Host` for whichever row was
 * long-pressed.
 */
export function TransactionRowMenu({ preview, cleared, onAction }: TransactionRowMenuProps) {
  const { t } = useTranslation("transactions");
  const foreground = useThemeColor("foreground");
  const danger = useThemeColor("danger");

  return (
    <LiftMenu.Content preview={preview} estimatedMenuHeight={260}>
      <Menu.Item className="gap-3" onPress={() => onAction("categorize")}>
        <Inbox size={18} color={foreground} />
        <Menu.ItemTitle>{t("contextCategorize")}</Menu.ItemTitle>
      </Menu.Item>
      <Menu.Item className="gap-3" onPress={() => onAction("move")}>
        <ArrowLeftRight size={18} color={foreground} />
        <Menu.ItemTitle>{t("contextMoveToAccount")}</Menu.ItemTitle>
      </Menu.Item>
      <Menu.Item className="gap-3" onPress={() => onAction("toggleCleared")}>
        <Copyright size={18} color={foreground} />
        <Menu.ItemTitle>{t(cleared ? "contextUnclear" : "contextClear")}</Menu.ItemTitle>
      </Menu.Item>
      <Menu.Item className="gap-3" onPress={() => onAction("duplicate")}>
        <Copy size={18} color={foreground} />
        <Menu.ItemTitle>{t("contextDuplicate")}</Menu.ItemTitle>
      </Menu.Item>
      <Menu.Item className="gap-3" onPress={() => onAction("delete")}>
        <Trash2 size={18} color={danger} />
        <Menu.ItemTitle className="text-danger">{t("contextDelete")}</Menu.ItemTitle>
      </Menu.Item>
    </LiftMenu.Content>
  );
}
