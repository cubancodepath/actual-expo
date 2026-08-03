import { useMemo } from "react";
import { View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Separator } from "heroui-native";
import { Search } from "lucide-react-native";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { AddTransactionFab } from "@/ui/AddTransactionFab";
import { useAccounts, useAccountBalances } from "@/lib/hooks/useAccounts";
import { useSyncedPrefs } from "@/hooks/useSyncedPrefs";
import { useHeaderActionOptions } from "@/ui/header-actions/useHeaderActionOptions";
import type { HeaderAction } from "@/ui/header-actions/types";
import { AccountLedgerRow } from "@/screens/transactions/components/transaction-list/LedgerRow";
import { TransactionsShell } from "./components/TransactionsShell";
import { AccountSummary } from "./components/AccountSummary";
import { useAccountHeaderAction } from "./hooks/useAccountHeaderAction";

/**
 * One account's ledger, pushed full-screen from the accounts tab.
 *
 * The native bar carries the account's name, the search action and the overflow
 * menu; the balance summary is pinned below it as a banner, in the shape the
 * budget screen's ReadyToAssign established.
 */
export function AccountTransactionsScreen({ accountId }: { accountId: string }) {
  const router = useRouter();
  const { t } = useTranslation("transactions");
  const { accounts } = useAccounts();
  const account = accounts.find((a) => a.id === accountId);
  const title = account?.name ?? t("list.title");
  const { cleared } = useAccountBalances(accountId);

  // Per-account synced pref (upstream naming): stores the *hide* flag, driven in
  // the positive as showReconciled.
  const [hideReconciled, setHideReconciled] = useSyncedPrefs(`hide-reconciled-${accountId}`);
  const showReconciled = String(hideReconciled) !== "true";
  const setShowReconciled = (val: boolean) => setHideReconciled(String(!val));

  const searchAction = useMemo<HeaderAction>(
    () => ({
      label: t("search.placeholder"),
      icon: { sfSymbol: "magnifyingglass", lucide: Search },
      // Scoped: the search screen keeps this account as a fixed filter.
      onPress: () => router.push({ pathname: "/(auth)/account/search", params: { accountId } }),
    }),
    [t, router, accountId],
  );

  const menuAction = useAccountHeaderAction({
    account,
    clearedBalance: cleared,
    showReconciled,
    setShowReconciled,
  });

  // Visual reading order: search sits next to the title, the menu at the edge.
  const actions = useMemo(
    () => (menuAction ? [searchAction, menuAction] : [searchAction]),
    [searchAction, menuAction],
  );
  const actionOptions = useHeaderActionOptions({ right: actions });
  const headerOptions = useMemo<NativeStackNavigationOptions>(
    () => ({ ...actionOptions, title }),
    [actionOptions, title],
  );

  return (
    <>
      <Stack.Screen options={headerOptions} />
      <TransactionsShell
        context={{ kind: "account", accountId, showReconciled }}
        // You're inside the account — its name on every row would be noise.
        rowComponent={AccountLedgerRow}
        banner={
          <View className="bg-background">
            <View className="px-4 pb-3 pt-2">
              <AccountSummary accountId={accountId} />
            </View>
            <Separator />
          </View>
        }
        fab={<AddTransactionFab accountId={accountId} accountName={account?.name} bottom={28} />}
      />
    </>
  );
}
