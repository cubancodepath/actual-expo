import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { AddTransactionFab } from "@/ui/AddTransactionFab";
import { useAccounts, useAccountBalances } from "@/lib/hooks/useAccounts";
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

  return (
    <TransactionsShell
      context={{ kind: "account", accountId }}
      stickyHeader={
        <AccountDetailHeader
          accountId={accountId}
          account={account}
          title={title}
          clearedBalance={cleared}
          onSearch={() =>
            router.push({ pathname: "/(auth)/account/search", params: { accountId } })
          }
        />
      }
      fab={<AddTransactionFab accountId={accountId} bottom={28} />}
    />
  );
}
