import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { formatDistanceToNowStrict } from "date-fns";
import { Button, Menu, useThemeColor } from "heroui-native";
import {
  ArchiveRestore,
  Eye,
  EyeOff,
  Lock,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react-native";
import { updateAccount } from "@/core/server/accounts";
import type { Account } from "@/core/types/models";

/** Relative "2 days ago" for a last-reconciled epoch-ms (or date) string. */
function relativeReconciled(raw: string | null): string | null {
  if (!raw) return null;
  const ts = Number(raw);
  const date = isNaN(ts) ? new Date(raw) : new Date(ts);
  if (isNaN(date.getTime())) return null;
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

interface AccountDetailMenuProps {
  account: Account | undefined;
  /** Cleared balance (cents), passed to the reconcile screen. */
  clearedBalance: number;
  /** Whether reconciled transactions are shown (drives the toggle label). */
  showReconciled: boolean;
  setShowReconciled: (val: boolean) => void;
}

/**
 * Overflow menu for the account-detail header (next to the search button):
 * Reconcile / Edit / Show·Hide reconciled / Close·Reopen.
 */
export function AccountDetailMenu({
  account,
  clearedBalance,
  showReconciled,
  setShowReconciled,
}: AccountDetailMenuProps) {
  const { t } = useTranslation("accounts");
  const router = useRouter();
  const foreground = useThemeColor("foreground");
  const danger = useThemeColor("danger");

  if (!account) return null;

  const relative = relativeReconciled(account.last_reconciled);
  const reconciledText = relative
    ? t("detail.reconciledAgo", { date: relative })
    : t("detail.reconciledNever");

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
            className="items-center gap-3"
            onPress={() =>
              router.push({
                pathname: "/(auth)/account/reconcile",
                params: {
                  accountId: account.id,
                  clearedBalance: String(clearedBalance),
                  lastReconciled: account.last_reconciled ?? "",
                },
              })
            }
          >
            <Lock size={18} color={foreground} />
            <View className="flex-1">
              <Menu.ItemTitle>{t("detail.reconcile")}</Menu.ItemTitle>
              <Menu.ItemDescription>{reconciledText}</Menu.ItemDescription>
            </View>
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

          <Menu.Item className="gap-3" onPress={() => setShowReconciled(!showReconciled)}>
            {showReconciled ? (
              <EyeOff size={18} color={foreground} />
            ) : (
              <Eye size={18} color={foreground} />
            )}
            <Menu.ItemTitle>
              {showReconciled ? t("detail.hideReconciled") : t("detail.showReconciled")}
            </Menu.ItemTitle>
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
