import { useMemo } from "react";
import { View, useColorScheme } from "react-native";
import {
  Host,
  HStack,
  VStack,
  Spacer,
  ContextMenu,
  Button as SUIButton,
  Menu,
} from "@expo/ui/swift-ui";
import {
  listRowBackground,
  onTapGesture,
  contentShape,
  refreshable,
  frame,
} from "@expo/ui/swift-ui/modifiers";
import { shapes } from "@expo/ui/swift-ui/modifiers";
import { useRouter } from "expo-router";
import {
  useAccounts,
  useAccountBalance,
  useAccountGroupBalance,
} from "@/presentation/hooks/useAccounts";
import { updateAccount, groupAccounts, type AccountGroup } from "@/accounts";
import { useRefreshControl } from "@/presentation/hooks/useRefreshControl";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { EmptyState } from "@/presentation/components/molecules/EmptyState";
import { AddTransactionButton } from "@/presentation/components/molecules/AddTransactionButton";
import { useUndoStore } from "@/stores/undoStore";
import { usePrivacyStore } from "@/stores/privacyStore";
import { usePrefsStore } from "@/stores/prefsStore";
import { useTranslation } from "react-i18next";
import type { Account } from "@/accounts/types";
import {
  ActualList,
  ActualSection,
  ActualNavigationStack,
  ScalableText,
} from "../../../../modules/actual-ui";
import { SText, SAmount } from "@/presentation/swift-ui/atoms";

// ---------------------------------------------------------------------------
// Account Row
// ---------------------------------------------------------------------------

function AccountRowNative({ account, onPress }: { account: Account; onPress: () => void }) {
  const { colors } = useTheme();
  const balance = useAccountBalance(account.id);

  return (
    <HStack
      spacing={8}
      modifiers={[
        listRowBackground(colors.cardBackground),
        contentShape(shapes.rectangle()),
        onTapGesture(onPress),
      ]}
    >
      <SText variant="body" lines={1}>
        {account.name}
      </SText>
      <Spacer />
      <SAmount value={balance} variant="body" />
    </HStack>
  );
}

// ---------------------------------------------------------------------------
// Section Header
// ---------------------------------------------------------------------------

function AccountSectionHeader({ group }: { group: AccountGroup }) {
  const { colors } = useTheme();
  const { t } = useTranslation("accounts");
  const accountIds = useMemo(() => group.accounts.map((a) => a.id), [group.accounts]);
  const groupTotal = useAccountGroupBalance(accountIds);
  const groupLabel = group.type === "budget" ? t("groups.budgetAccounts") : t("groups.offBudget");

  return (
    <HStack alignment="center" spacing={8}>
      <SText variant="bodySm" color={colors.textPrimary}>
        {groupLabel}
      </SText>
      <Spacer />
      <SAmount value={groupTotal} variant="bodySm" weight="semibold" />
    </HStack>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AccountsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const colorScheme = useColorScheme();
  const { accounts, hasLoaded } = useAccounts();
  const { refreshControlProps } = useRefreshControl();
  const { t } = useTranslation("accounts");
  const { t: tc } = useTranslation();
  const canUndo = useUndoStore((s) => s.canUndo);
  const { privacyMode, toggle: togglePrivacy } = usePrivacyStore();
  const isLocalOnly = usePrefsStore((s) => s.isLocalOnly);

  const groups = groupAccounts(accounts);

  function handlePressAccount(account: Account) {
    router.push(`/(auth)/account/${account.id}`);
  }

  function handleEditAccount(account: Account) {
    router.push({ pathname: "/(auth)/account/settings", params: { id: account.id } });
  }

  function handleCloseAccount(account: Account) {
    router.push({ pathname: "/(auth)/account/close", params: { id: account.id } });
  }

  function handleReopenAccount(account: Account) {
    updateAccount(account.id, { closed: false });
  }

  return (
    <>
      {groups.length > 0 || !hasLoaded ? (
        <Host style={{ flex: 1 }} colorScheme={colorScheme === "dark" ? "dark" : "light"}>
          <ActualNavigationStack
            title={t("title")}
            largeTitleEnabled
            backgroundColor={colors.pageBackground}
            tintColor={colors.headerText}
            trailing={
              <>
                <SUIButton
                  label=""
                  systemImage="plus"
                  onPress={() => router.push("/(auth)/account/new")}
                />
                <Menu systemImage="ellipsis" label="">
                  <SUIButton
                    label="Undo"
                    systemImage="arrow.uturn.backward"
                    onPress={async () => {
                      await useUndoStore.getState().undo();
                    }}
                  />
                  <SUIButton
                    label={privacyMode ? "Show Amounts" : "Hide Amounts"}
                    systemImage={privacyMode ? "eye" : "eye.slash"}
                    onPress={togglePrivacy}
                  />
                  {!isLocalOnly && (
                    <SUIButton
                      label={tc("nav.switchBudget")}
                      systemImage="arrow.2.squarepath"
                      onPress={() => router.push("/(auth)/change-budget")}
                    />
                  )}
                  <SUIButton
                    label="Settings"
                    systemImage="gearshape"
                    onPress={() => router.push("/(auth)/settings")}
                  />
                </Menu>
              </>
            }
          >
            <ActualList
              listStyleType="insetGrouped"
              listTintColor={colors.primary}
              modifiers={[
                refreshable(async () => {
                  await refreshControlProps.onRefresh();
                }),
              ]}
            >
              {groups.map((group) => (
                <ActualSection
                  key={group.type}
                  isExpanded
                  headerBackground={colors.pageBackground}
                  header={<AccountSectionHeader group={group} />}
                >
                  {group.accounts.map((account) => (
                    <ContextMenu key={account.id}>
                      <ContextMenu.Trigger>
                        <AccountRowNative
                          account={account}
                          onPress={() => handlePressAccount(account)}
                        />
                      </ContextMenu.Trigger>
                      <ContextMenu.Items>
                        <SUIButton
                          label={t("contextMenu.viewTransactions")}
                          systemImage="list.bullet"
                          onPress={() => handlePressAccount(account)}
                        />
                        <SUIButton
                          label={t("contextMenu.editAccount")}
                          systemImage="pencil"
                          onPress={() => handleEditAccount(account)}
                        />
                        {account.closed ? (
                          <SUIButton
                            label={t("contextMenu.reopenAccount")}
                            systemImage="arrow.counterclockwise"
                            onPress={() => handleReopenAccount(account)}
                          />
                        ) : (
                          <SUIButton
                            label={t("contextMenu.closeAccount")}
                            systemImage="trash"
                            role="destructive"
                            onPress={() => handleCloseAccount(account)}
                          />
                        )}
                      </ContextMenu.Items>
                    </ContextMenu>
                  ))}
                </ActualSection>
              ))}
            </ActualList>
          </ActualNavigationStack>
        </Host>
      ) : (
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <EmptyState
            icon="wallet"
            title={t("emptyState.title")}
            description={t("emptyState.description")}
            actionLabel={t("addAccount")}
            onAction={() => router.push("/(auth)/account/new")}
          />
        </View>
      )}
      <AddTransactionButton />
    </>
  );
}
