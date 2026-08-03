import { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";
import { Accordion, AccordionLayoutTransition, Button, useThemeColor } from "heroui-native";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import {
  CirclePlus,
  Eye,
  EyeOff,
  Landmark,
  MoreHorizontal,
  Plus,
  Settings,
  Undo2,
} from "lucide-react-native";
import { groupAccounts, updateAccount } from "@/core/server/accounts";
import type { Account } from "@/core/types/models";
import { useAccounts } from "@/lib/hooks/useAccounts";
import { usePrivacyMode } from "@/lib/hooks/usePrivacyMode";
import { useSyncRefreshControl } from "@/lib/hooks/useSyncRefreshControl";
import type { HeaderAction } from "@/ui/header-actions/types";
import { useHeaderActionOptions } from "@/ui/header-actions/useHeaderActionOptions";
import { LiftMenu } from "@/ui/lift-menu";
import { AccountGroupItem } from "./components/AccountGroupItem";
import { AccountRowContent } from "./components/AccountRow";
import { AccountRowMenu, type AccountMenuAction } from "./components/AccountRowMenu";
import { EmptyState } from "heroui-native-pro";

const noop = () => {};

export function AccountsScreen() {
  const { t } = useTranslation("accounts");
  const { t: tCommon } = useTranslation("common");
  const router = useRouter();
  const [accentForeground, foreground, accent] = useThemeColor([
    "accent-foreground",
    "foreground",
    "accent",
  ]);
  const { accounts, hasLoaded } = useAccounts();
  const [privacyMode, togglePrivacy] = usePrivacyMode();

  // No `progressViewOffset`: the scroll view takes its inset from UIKit, and the
  // refresh spinner is positioned from that same adjusted top.
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

  // Add on the inside, overflow at the edge. Memoised: expo-router re-runs
  // setOptions on every options identity change. This is a tab root, so there's
  // no back button for a `left` action to displace.
  const addAction = useMemo<HeaderAction>(
    () => ({
      label: t("addAccount"),
      icon: { sfSymbol: "plus", lucide: Plus },
      onPress: () => router.push("/(auth)/account/new"),
    }),
    [t, router],
  );

  const overflowAction = useMemo<HeaderAction>(
    () => ({
      label: tCommon("a11y.moreOptions"),
      icon: { sfSymbol: "ellipsis", lucide: MoreHorizontal },
      items: [
        {
          label: t("menu.undo"),
          icon: { sfSymbol: "arrow.uturn.backward", lucide: Undo2 },
          // Not wired yet. Disabled is honest; the old menu's no-op was not.
          disabled: true,
          onPress: noop,
        },
        {
          label: privacyMode ? t("menu.showAmounts") : t("menu.hideAmounts"),
          icon: privacyMode
            ? { sfSymbol: "eye", lucide: Eye }
            : { sfSymbol: "eye.slash", lucide: EyeOff },
          onPress: togglePrivacy,
        },
        {
          label: t("menu.settings"),
          icon: { sfSymbol: "gearshape", lucide: Settings },
          onPress: () => router.push("/(auth)/settings"),
        },
      ],
    }),
    [t, tCommon, router, privacyMode, togglePrivacy],
  );

  const headerOptions = useHeaderActionOptions({
    right: [addAction, overflowAction],
  }) as NativeStackNavigationOptions;

  const isEmpty = hasLoaded && groups.length === 0;

  return (
    <>
      <Stack.Screen options={headerOptions} />
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
            <View className="flex-1 items-center justify-center gap-6 px-8">
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
            <ScrollView
              // The native bar is translucent and this floats under it; UIKit
              // supplies the top inset (same as NativePickerScreen). Padding it
              // by hand would land on TOP of that inset, not instead of it.
              contentInsetAdjustmentBehavior="automatic"
              contentContainerStyle={{
                flexGrow: 1,
                paddingHorizontal: 16,
                paddingBottom: 120,
              }}
              showsVerticalScrollIndicator={false}
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
                  <CirclePlus size={18} color={accent} />
                  <Button.Label>{t("addAccount")}</Button.Label>
                </Button>
              </View>
            </ScrollView>
          )
        }
      </LiftMenu.Host>
    </>
  );
}
