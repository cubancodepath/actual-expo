import { useMemo } from "react";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { formatDistanceToNowStrict } from "date-fns";
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
import type { HeaderAction } from "@/ui/header-actions/types";
import type { Account } from "@/core/types/models";

/** Relative "2 days ago" for a last-reconciled epoch-ms (or date) string. */
function relativeReconciled(raw: string | null): string | null {
  if (!raw) return null;
  const ts = Number(raw);
  const date = isNaN(ts) ? new Date(raw) : new Date(ts);
  if (isNaN(date.getTime())) return null;
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

/**
 * The account ledger's overflow menu, as a native bar item: Reconcile / Edit /
 * Show·Hide reconciled / Close·Reopen.
 *
 * `undefined` until the account has loaded, so the bar carries no menu that
 * would act on nothing.
 */
export function useAccountHeaderAction({
  account,
  clearedBalance,
  showReconciled,
  setShowReconciled,
}: {
  account: Account | undefined;
  /** Cleared balance (cents), passed to the reconcile screen. */
  clearedBalance: number;
  showReconciled: boolean;
  setShowReconciled: (val: boolean) => void;
}): HeaderAction | undefined {
  const { t } = useTranslation("accounts");
  const { t: tc } = useTranslation("common");
  const router = useRouter();

  return useMemo(() => {
    if (!account) return undefined;

    const relative = relativeReconciled(account.last_reconciled);
    const reconciledText = relative
      ? t("detail.reconciledAgo", { date: relative })
      : t("detail.reconciledNever");

    return {
      label: tc("a11y.moreOptions"),
      icon: { sfSymbol: "ellipsis", lucide: MoreHorizontal },
      items: [
        {
          label: t("detail.reconcile"),
          // UIKit draws this under the label, so the "reconciled 2 days ago"
          // line survives the move off the JS popover.
          description: reconciledText,
          icon: { sfSymbol: "lock", lucide: Lock },
          onPress: () =>
            router.push({
              pathname: "/(auth)/account/reconcile",
              params: {
                accountId: account.id,
                clearedBalance: String(clearedBalance),
                lastReconciled: account.last_reconciled ?? "",
              },
            }),
        },
        {
          label: t("contextMenu.editAccount"),
          icon: { sfSymbol: "pencil", lucide: Pencil },
          onPress: () =>
            router.push({ pathname: "/(auth)/account/settings", params: { id: account.id } }),
        },
        {
          label: showReconciled ? t("detail.hideReconciled") : t("detail.showReconciled"),
          icon: showReconciled
            ? { sfSymbol: "eye.slash", lucide: EyeOff }
            : { sfSymbol: "eye", lucide: Eye },
          onPress: () => setShowReconciled(!showReconciled),
        },
        account.closed
          ? {
              label: t("contextMenu.reopenAccount"),
              icon: { sfSymbol: "arrow.uturn.backward.circle", lucide: ArchiveRestore },
              onPress: () => void updateAccount(account.id, { closed: false }),
            }
          : {
              label: t("contextMenu.closeAccount"),
              icon: { sfSymbol: "trash", lucide: Trash2 },
              destructive: true,
              onPress: () =>
                router.push({ pathname: "/(auth)/account/close", params: { id: account.id } }),
            },
      ],
    };
  }, [account, clearedBalance, showReconciled, setShowReconciled, router, t, tc]);
}
