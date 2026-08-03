import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { AddTransactionFab } from "@/ui/AddTransactionFab";
import { useAccounts, useAccountBalances } from "@/lib/hooks/useAccounts";
import { useSyncedPrefs } from "@/hooks/useSyncedPrefs";
import { AccountLedgerRow } from "@/screens/transactions/components/transaction-list/LedgerRow";
import { TransactionsShell } from "./components/TransactionsShell";
import { AccountDetailHeader } from "./components/AccountDetailHeader";

/** One account's ledger, pushed full-screen from the accounts tab. */
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

  return (
    <TransactionsShell
      context={{ kind: "account", accountId, showReconciled }}
      // You're inside the account — its name on every row would be noise.
      rowComponent={AccountLedgerRow}
      stickyHeader={
        <AccountDetailHeader
          accountId={accountId}
          account={account}
          title={title}
          clearedBalance={cleared}
          showReconciled={showReconciled}
          setShowReconciled={setShowReconciled}
          onSearch={() =>
            router.push({ pathname: "/(auth)/account/search", params: { accountId } })
          }
        />
      }
      fab={<AddTransactionFab accountId={accountId} accountName={account?.name} bottom={28} />}
    />
  );
}
