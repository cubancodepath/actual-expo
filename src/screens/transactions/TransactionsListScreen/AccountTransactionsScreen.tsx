import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { AddTransactionFab } from "@/ui/AddTransactionFab";
import { useAccounts } from "@/screens/transactions/hooks/useAccounts";
import { TransactionsShell } from "./components/TransactionsShell";
import { SearchButton } from "./components/SearchButton";

/** One account's ledger, pushed full-screen from the accounts tab. */
export function AccountTransactionsScreen({ accountId }: { accountId: string }) {
  const router = useRouter();
  const { t } = useTranslation("transactions");
  const { accounts } = useAccounts();
  const title = accounts.find((a) => a.id === accountId)?.name ?? t("list.title");

  return (
    <TransactionsShell
      context={{ kind: "account", accountId }}
      topInset
      header={
        <ScreenHeader>
          <ScreenHeader.Back />
          <ScreenHeader.Title>{title}</ScreenHeader.Title>
          <ScreenHeader.Actions>
            <SearchButton
              onPress={() =>
                router.push({
                  pathname: "/(auth)/account/search",
                  params: { accountId },
                })
              }
            />
          </ScreenHeader.Actions>
        </ScreenHeader>
      }
      fab={<AddTransactionFab accountId={accountId} bottom={28} />}
    />
  );
}
