import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Button, Menu, useThemeColor } from "heroui-native";
import { ArchiveRestore, Eye, MoreHorizontal, Pencil, Scale, Trash2 } from "lucide-react-native";
import { updateAccount } from "@/core/domain/accounts";
import type { Account } from "@/core/domain/accounts/types";

const noop = () => {};

interface AccountDetailMenuProps {
  account: Account | undefined;
  /** Cleared balance (cents), passed to the reconcile screen. */
  clearedBalance: number;
}

/**
 * Overflow menu for the account-detail header (next to the search button).
 * Reconcile / Edit / Close·Reopen are wired to their routes; Show/Hide
 * reconciled is a placeholder until the list supports the reconciled filter.
 */
export function AccountDetailMenu({ account, clearedBalance }: AccountDetailMenuProps) {
  const { t } = useTranslation("accounts");
  const router = useRouter();
  const foreground = useThemeColor("foreground");
  const muted = useThemeColor("muted");
  const danger = useThemeColor("danger");

  if (!account) return null;

  return (
    <Menu>
      <Menu.Trigger asChild>
        <Button variant="secondary" isIconOnly className="rounded-full">
          <MoreHorizontal size={20} color={foreground} />
        </Button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Overlay />
        <Menu.Content presentation="popover" width={240} placement="bottom" align="end">
          <Menu.Item
            className="gap-3"
            onPress={() =>
              router.push({
                pathname: "/(auth)/account/reconcile",
                params: {
                  accountId: account.id,
                  clearedBalance: String(clearedBalance),
                  lastReconciled: account.lastReconciled ?? "",
                },
              })
            }
          >
            <Scale size={18} color={foreground} />
            <Menu.ItemTitle>{t("detail.reconcile")}</Menu.ItemTitle>
          </Menu.Item>

          <Menu.Item
            className="gap-3"
            onPress={() =>
              router.push({ pathname: "/(auth)/account/settings", params: { id: account.id } })
            }
          >
            <Pencil size={18} color={foreground} />
            <Menu.ItemTitle>{t("contextMenu.editAccount")}</Menu.ItemTitle>
          </Menu.Item>

          <Menu.Item className="gap-3" onPress={noop}>
            <Eye size={18} color={muted} />
            <Menu.ItemTitle>{t("detail.showReconciled")}</Menu.ItemTitle>
          </Menu.Item>

          {account.closed ? (
            <Menu.Item
              className="gap-3"
              onPress={() => updateAccount(account.id, { closed: false })}
            >
              <ArchiveRestore size={18} color={foreground} />
              <Menu.ItemTitle>{t("contextMenu.reopenAccount")}</Menu.ItemTitle>
            </Menu.Item>
          ) : (
            <Menu.Item
              className="gap-3"
              onPress={() =>
                router.push({ pathname: "/(auth)/account/close", params: { id: account.id } })
              }
            >
              <Trash2 size={18} color={danger} />
              <Menu.ItemTitle className="text-danger">
                {t("contextMenu.closeAccount")}
              </Menu.ItemTitle>
            </Menu.Item>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu>
  );
}
