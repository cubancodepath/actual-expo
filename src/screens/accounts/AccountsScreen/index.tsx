import { useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";
import { Accordion, AccordionLayoutTransition, Button, useThemeColor } from "heroui-native";
import { CirclePlus, Landmark } from "lucide-react-native";
import { groupAccounts, updateAccount } from "@/core/server/accounts";
import type { Account } from "@/core/types/models";
import { useAccounts } from "@/lib/hooks/useAccounts";
import { useSyncRefreshControl } from "@/lib/hooks/useSyncRefreshControl";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { LiftMenu } from "@/ui/lift-menu";
import { AccountsHeader } from "./components/AccountsHeader";
import { AccountGroupItem } from "./components/AccountGroupItem";
import { AccountRowContent } from "./components/AccountRow";
import { AccountRowMenu, type AccountMenuAction } from "./components/AccountRowMenu";
import { EmptyState } from "heroui-native-pro";

export function AccountsScreen() {
  const { t } = useTranslation("accounts");
  const router = useRouter();
  const [accentForeground, foreground] = useThemeColor(["accent-foreground", "foreground"]);
  const { accounts, hasLoaded } = useAccounts();
  const refreshControl = useSyncRefreshControl();

  // Closed accounts always show as their own group; it just starts collapsed.
  const groups = groupAccounts(accounts, true);

  // Controlled expansion: seed once (budget/off-budget expanded, closed
  // collapsed) the first time accounts arrive; after that the user drives it.
  const [expandedIds, setExpandedIds] = useState<string[] | null>(null);
  useEffect(() => {
    if (expandedIds === null && groups.length > 0) {
      setExpandedIds(groups.filter((g) => g.type !== "closed").map((g) => g.type));
    }
  }, [groups, expandedIds]);

  function handlePressAccount(account: Account) {
    router.push(`/(auth)/account/${account.id}`);
  }

  function runMenuAction(account: Account, action: AccountMenuAction) {
    switch (action) {
      case "view":
        handlePressAccount(account);
        break;
      case "edit":
        router.push({
          pathname: "/(auth)/account/settings",
          params: { id: account.id },
        });
        break;
      case "close":
        router.push({
          pathname: "/(auth)/account/close",
          params: { id: account.id },
        });
        break;
      case "reopen":
        updateAccount(account.id, { closed: false });
        break;
    }
  }

  const isEmpty = hasLoaded && groups.length === 0;

  return (
    <ScreenHeader.ScrollArea>
      <LiftMenu.Host<Account>
        getId={(account) => account.id}
        className="flex-1"
        renderMenu={(account) => (
          <AccountRowMenu
            account={account}
            preview={<AccountRowContent account={account} />}
            onAction={(action) => runMenuAction(account, action)}
          />
        )}
      >
        {({ liftedId, onLongPressRow }) =>
          isEmpty ? (
            <View className="flex-1 items-center justify-center gap-6 px-8 ">
              <EmptyState>
                <EmptyState.Header>
                  <EmptyState.Media variant="icon">
                    <Landmark size={20} color={foreground} />
                  </EmptyState.Media>
                  <EmptyState.Title>{t("emptyState.title")}</EmptyState.Title>
                  <EmptyState.Description>{t("emptyState.description")}</EmptyState.Description>
                </EmptyState.Header>
                <EmptyState.Content>
                  <Button variant="primary" onPress={() => router.push("/(auth)/account/new")}>
                    <CirclePlus size={18} color={accentForeground} />
                    <Button.Label>{t("addAccount")}</Button.Label>
                  </Button>
                </EmptyState.Content>
              </EmptyState>
            </View>
          ) : (
            <ScreenHeader.Body
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingBottom: 120,
              }}
              refreshControl={refreshControl}
            >
              <Animated.View layout={AccordionLayoutTransition}>
                <Accordion
                  selectionMode="multiple"
                  hideSeparator
                  value={expandedIds ?? []}
                  onValueChange={(v: string | string[] | undefined) =>
                    setExpandedIds(Array.isArray(v) ? v : v ? [v] : [])
                  }
                >
                  {groups.map((group) => (
                    <AccountGroupItem
                      key={group.type}
                      group={group}
                      onPressAccount={handlePressAccount}
                      onLongPressAccount={onLongPressRow}
                      liftedAccountId={liftedId}
                    />
                  ))}
                </Accordion>
              </Animated.View>

              <View className="mt-2">
                <Button variant="secondary" onPress={() => router.push("/(auth)/account/new")}>
                  <CirclePlus size={18} color={foreground} />
                  <Button.Label>{t("addAccount")}</Button.Label>
                </Button>
              </View>
            </ScreenHeader.Body>
          )
        }
      </LiftMenu.Host>

      <ScreenHeader.Floating>
        <AccountsHeader />
      </ScreenHeader.Floating>
    </ScreenHeader.ScrollArea>
  );
}
