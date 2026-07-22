import { useEffect, useState } from "react";
import { RefreshControl, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";
import {
  Accordion,
  AccordionLayoutTransition,
  Button,
  Menu,
  Typography,
  useThemeColor,
} from "heroui-native";
import { CirclePlus, Plus } from "lucide-react-native";
import { groupAccounts, updateAccount } from "@/core/domain/accounts";
import type { Account } from "@/core/domain/accounts/types";
import { useAccounts } from "@/lib/hooks/useAccounts";
import { useRefreshControl } from "@/hooks/useRefreshControl";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { AccountsHeader } from "./components/AccountsHeader";
import { AccountGroupItem } from "./components/AccountGroupItem";
import { AccountRowMenu, type AccountMenuAction } from "./components/AccountRowMenu";
import type { RowRect } from "./components/AccountRow";

/** The long-pressed row the context menu is currently open on. */
interface MenuTarget {
  account: Account;
  /** The row's window frame, measured at long-press. */
  rect: RowRect;
}

export function AccountsScreen() {
  const { t } = useTranslation("accounts");
  const router = useRouter();
  const [foreground, accent] = useThemeColor(["foreground", "accent"]);
  const { accounts, hasLoaded } = useAccounts();
  const { refreshControlProps } = useRefreshControl();

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

  // One menu for the whole list, anchored to the long-pressed row's frame.
  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);
  const [isPreviewShown, setPreviewShown] = useState(false);

  function handlePressAccount(account: Account) {
    router.push(`/(auth)/account/${account.id}`);
  }

  function handleLongPressAccount(account: Account, rect: RowRect) {
    setPreviewShown(false);
    setMenuTarget({ account, rect });
  }

  function closeMenu() {
    setMenuTarget(null);
    setPreviewShown(false);
  }

  function runMenuAction(account: Account, action: AccountMenuAction) {
    closeMenu();
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
      {isEmpty ? (
        <View className="flex-1 items-center justify-center gap-6 px-8">
          <View className="items-center gap-2">
            <Typography className="text-lg font-semibold text-foreground">
              {t("emptyState.title")}
            </Typography>
            <Typography className="text-center text-sm text-muted">
              {t("emptyState.description")}
            </Typography>
          </View>
          <Button variant="secondary" onPress={() => router.push("/(auth)/account/new")}>
            <Plus size={18} color={foreground} />
            <Button.Label>{t("addAccount")}</Button.Label>
          </Button>
        </View>
      ) : (
        <ScreenHeader.Body
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
          refreshControl={<RefreshControl {...refreshControlProps} />}
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
                  onLongPressAccount={handleLongPressAccount}
                  liftedAccountId={isPreviewShown ? (menuTarget?.account.id ?? null) : null}
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
        </ScreenHeader.Body>
      )}

      <ScreenHeader.Floating>
        <AccountsHeader />
      </ScreenHeader.Floating>

      {/* One menu for the whole list, mounted only while a row is long-pressed.
          `isDefaultOpen` makes it measure its trigger and open on mount, so the
          popover anchors to the pressed row's frame without every row owning a
          Menu. The frame and the trigger's measure are both page coordinates,
          and this screen's root sits at the page origin, so the two agree. */}
      {menuTarget ? (
        <Menu
          isDefaultOpen
          onOpenChange={(open) => {
            if (!open) closeMenu();
          }}
          pointerEvents="none"
          style={{
            position: "absolute",
            left: menuTarget.rect.x,
            top: menuTarget.rect.y,
            width: menuTarget.rect.width,
            height: menuTarget.rect.height,
          }}
        >
          <Menu.Trigger pointerEvents="none" style={StyleSheet.absoluteFill} />
          <AccountRowMenu
            account={menuTarget.account}
            rect={menuTarget.rect}
            onPreviewLayout={() => setPreviewShown(true)}
            onAction={(action) => runMenuAction(menuTarget.account, action)}
          />
        </Menu>
      ) : null}
    </ScreenHeader.ScrollArea>
  );
}
