import { useMemo } from "react";
import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react-native";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { AddTransactionFab } from "@/ui/AddTransactionFab";
import { useHeaderActionOptions } from "@/ui/header-actions/useHeaderActionOptions";
import type { HeaderAction } from "@/ui/header-actions/types";
import { TransactionsShell } from "./components/TransactionsShell";

/**
 * The transactions tab: every account, newest first. Tab root — no back.
 *
 * The title comes from the route; the magnifier opens the dedicated search
 * screen. Search stays a screen of its own because it is a tokenized filter
 * builder with autocomplete, which is more than a bar field can express.
 */
export function AllTransactionsScreen() {
  const router = useRouter();
  const { t } = useTranslation("transactions");

  const searchAction = useMemo<HeaderAction>(
    () => ({
      label: t("search.placeholder"),
      icon: { sfSymbol: "magnifyingglass", lucide: Search },
      onPress: () => router.push("/(auth)/(tabs)/(spending)/search"),
    }),
    [t, router],
  );

  const headerOptions = useHeaderActionOptions({
    right: searchAction,
  }) as NativeStackNavigationOptions;

  return (
    <>
      <Stack.Screen options={headerOptions} />
      <TransactionsShell
        context={{ kind: "all" }}
        // Default bottom offset clears the tab bar.
        fab={<AddTransactionFab />}
      />
    </>
  );
}
