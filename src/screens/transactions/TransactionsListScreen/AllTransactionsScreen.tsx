import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { AddTransactionFab } from "@/ui/AddTransactionFab";
import { TransactionsShell } from "./components/TransactionsShell";
import { SearchButton } from "./components/SearchButton";

/** The transactions tab: every account, newest first. Tab root — no back. */
export function AllTransactionsScreen() {
  const router = useRouter();
  const { t } = useTranslation("transactions");

  return (
    <TransactionsShell
      context={{ kind: "all" }}
      topInset
      header={
        <ScreenHeader>
          <ScreenHeader.Title>{t("list.title")}</ScreenHeader.Title>
          <ScreenHeader.Actions>
            <SearchButton onPress={() => router.push("/(auth)/(tabs)/(spending)/search")} />
          </ScreenHeader.Actions>
        </ScreenHeader>
      }
      // Default bottom offset clears the tab bar.
      fab={<AddTransactionFab />}
    />
  );
}
