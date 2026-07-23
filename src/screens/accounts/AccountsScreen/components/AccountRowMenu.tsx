import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Menu, useThemeColor } from "heroui-native";
import { ArchiveRestore, List, Pencil, Trash2 } from "lucide-react-native";
import type { Account } from "@/core/types/models";
import { LiftMenu } from "@/ui/lift-menu";

export type AccountMenuAction = "view" | "edit" | "close" | "reopen";

interface AccountRowMenuProps {
  account: Account;
  /** Clone of the row's content, floated above the overlay while the menu is open. */
  preview: ReactNode;
  /** One of the menu's actions was chosen — the host runs it. */
  onAction: (action: AccountMenuAction) => void;
}

/**
 * Popover items for an account's long-press lift menu. Options are the
 * list-level conveniences (the fuller account options live on the account's
 * transactions page). Rendered from the accounts screen's `LiftMenu.Host`.
 */
export function AccountRowMenu({ account, preview, onAction }: AccountRowMenuProps) {
  const { t } = useTranslation("accounts");
  const foreground = useThemeColor("foreground");
  const danger = useThemeColor("danger");

  return (
    <LiftMenu.Content preview={preview} estimatedMenuHeight={200}>
      <Menu.Item className="gap-3" onPress={() => onAction("view")}>
        <List size={18} color={foreground} />
        <Menu.ItemTitle>{t("contextMenu.viewTransactions")}</Menu.ItemTitle>
      </Menu.Item>
      <Menu.Item className="gap-3" onPress={() => onAction("edit")}>
        <Pencil size={18} color={foreground} />
        <Menu.ItemTitle>{t("contextMenu.editAccount")}</Menu.ItemTitle>
      </Menu.Item>
      {account.closed ? (
        <Menu.Item className="gap-3" onPress={() => onAction("reopen")}>
          <ArchiveRestore size={18} color={foreground} />
          <Menu.ItemTitle>{t("contextMenu.reopenAccount")}</Menu.ItemTitle>
        </Menu.Item>
      ) : (
        <Menu.Item className="gap-3" onPress={() => onAction("close")}>
          <Trash2 size={18} color={danger} />
          <Menu.ItemTitle className="text-danger">{t("contextMenu.closeAccount")}</Menu.ItemTitle>
        </Menu.Item>
      )}
    </LiftMenu.Content>
  );
}
