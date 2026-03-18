import { useMemo } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Stack, useRouter } from "expo-router";
import { ContextMenu } from "@/presentation/components/atoms/ContextMenu";
import { useAccounts, useAccountBalance, useAccountGroupBalance } from "@/presentation/hooks/useAccounts";
import { updateAccount } from "@/accounts";
import { Icon } from "@/presentation/components/atoms/Icon";
import { useRefreshControl } from "@/presentation/hooks/useRefreshControl";
import { groupAccounts, type AccountGroup } from "@/accounts";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import { Text } from "@/presentation/components/atoms/Text";
import { Card } from "@/presentation/components/atoms/Card";
import { Amount } from "@/presentation/components/atoms/Amount";
import { RowSeparator } from "@/presentation/components/atoms/RowSeparator";
import { Button } from "@/presentation/components/atoms/Button";
import { EmptyState } from "@/presentation/components/molecules/EmptyState";
import { AddTransactionButton } from "@/presentation/components/molecules/AddTransactionButton";
import type { Theme } from "@/theme";
import { useCommonMenuActions } from "@/presentation/hooks/useCommonMenuItems";
import { useTranslation } from "react-i18next";
import type { Account } from "@/accounts/types";

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function AccountRow({
  account,
  onPress,
  onEdit,
  onClose,
  onReopen,
  isLast,
  styles,
}: {
  account: Account;
  onPress: () => void;
  onEdit: () => void;
  onClose: () => void;
  onReopen: () => void;
  isLast?: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  const theme = useTheme();
  const { t } = useTranslation("accounts");
  const balance = useAccountBalance(account.id);

  return (
    <ContextMenu>
      <ContextMenu.Trigger>
        <Pressable style={styles.accountRow} onPress={onPress}>
          <Text variant="body" color={theme.colors.textPrimary} style={styles.accountName}>
            {account.name}
          </Text>
          <Amount value={balance} variant="body" />
          <Icon name="chevronForward" size={16} color={theme.colors.textMuted} />
          {!isLast && <RowSeparator insetLeft={theme.spacing.md} insetRight={theme.spacing.md} />}
        </Pressable>
      </ContextMenu.Trigger>
      <ContextMenu.Content>
        <ContextMenu.Item key="view" onSelect={onPress}>
          <ContextMenu.ItemTitle>{t("contextMenu.viewTransactions")}</ContextMenu.ItemTitle>
          <ContextMenu.ItemIcon ios={{ name: "list.bullet" }} />
        </ContextMenu.Item>
        <ContextMenu.Item key="edit" onSelect={onEdit}>
          <ContextMenu.ItemTitle>{t("contextMenu.editAccount")}</ContextMenu.ItemTitle>
          <ContextMenu.ItemIcon ios={{ name: "pencil" }} />
        </ContextMenu.Item>
        {account.closed ? (
          <ContextMenu.Item key="reopen" onSelect={onReopen}>
            <ContextMenu.ItemTitle>{t("contextMenu.reopenAccount")}</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: "arrow.counterclockwise" }} />
          </ContextMenu.Item>
        ) : (
          <ContextMenu.Item key="close" destructive onSelect={onClose}>
            <ContextMenu.ItemTitle>{t("contextMenu.closeAccount")}</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: "trash" }} />
          </ContextMenu.Item>
        )}
      </ContextMenu.Content>
    </ContextMenu>
  );
}

function AccountContent({
  group,
  onPressAccount,
  onEditAccount,
  onCloseAccount,
  onReopenAccount,
  styles,
}: {
  group: AccountGroup;
  onPressAccount: (a: Account) => void;
  onEditAccount: (a: Account) => void;
  onCloseAccount: (a: Account) => void;
  onReopenAccount: (a: Account) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const theme = useTheme();
  return (
    <Card style={styles.listCard}>
      {group.accounts.map((account, i) => (
        <AccountRow
          key={account.id}
          account={account}
          onPress={() => onPressAccount(account)}
          onEdit={() => onEditAccount(account)}
          onClose={() => onCloseAccount(account)}
          onReopen={() => onReopenAccount(account)}
          isLast={i === group.accounts.length - 1}
          styles={styles}
        />
      ))}
    </Card>
  );
}

function AccountSection({
  group,
  onPressAccount,
  onEditAccount,
  onCloseAccount,
  onReopenAccount,
}: {
  group: AccountGroup;
  onPressAccount: (a: Account) => void;
  onEditAccount: (a: Account) => void;
  onCloseAccount: (a: Account) => void;
  onReopenAccount: (a: Account) => void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation("accounts");

  const groupLabel = group.type === "budget" ? t("groups.budgetAccounts") : t("groups.offBudget");
  const accountIds = useMemo(() => group.accounts.map((a) => a.id), [group.accounts]);
  const groupTotal = useAccountGroupBalance(accountIds);

  const isExpanded = useSharedValue(true);
  const height = useSharedValue(0);
  const rotation = useSharedValue(0);

  const derivedHeight = useDerivedValue(() =>
    withTiming(height.value * (isExpanded.value ? 1 : 0), { duration: 250 }),
  );

  const bodyStyle = useAnimatedStyle(() => ({
    height: derivedHeight.value,
    overflow: "hidden" as const,
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  function toggle() {
    isExpanded.value = !isExpanded.value;
    rotation.value = withTiming(isExpanded.value ? 0 : -90, { duration: 250 });
  }

  return (
    <View style={styles.section}>
      {/* Section header */}
      <Pressable style={styles.sectionHeader} onPress={toggle}>
        <Animated.View style={chevronStyle}>
          <Icon name="chevronDown" size={18} color={theme.colors.textSecondary} />
        </Animated.View>
        <Text variant="body" color={theme.colors.textPrimary} style={styles.sectionLabel}>
          {groupLabel}
        </Text>
        <Amount value={groupTotal} variant="body" style={styles.sectionTotal} />
      </Pressable>

      {/* Hidden measurer — always keeps natural height */}
      <View
        style={{ position: "absolute", opacity: 0, zIndex: -1 }}
        onLayout={(e) => {
          height.value = e.nativeEvent.layout.height;
        }}
        pointerEvents="none"
      >
        <AccountContent
          group={group}
          onPressAccount={onPressAccount}
          onEditAccount={onEditAccount}
          onCloseAccount={onCloseAccount}
          onReopenAccount={onReopenAccount}
          styles={styles}
        />
      </View>

      {/* Animated collapsible body */}
      <Animated.View style={bodyStyle}>
        <AccountContent
          group={group}
          onPressAccount={onPressAccount}
          onEditAccount={onEditAccount}
          onCloseAccount={onCloseAccount}
          onReopenAccount={onReopenAccount}
          styles={styles}
        />
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AccountsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { accounts, hasLoaded } = useAccounts();
  const { refreshControlProps } = useRefreshControl();
  const commonActions = useCommonMenuActions();
  const { t } = useTranslation("accounts");

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

  // No skeleton — liveQuery loads in ~5ms, data appears instantly

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl {...refreshControlProps} />}
      >
        <Stack.Screen.Title large>{t("title")}</Stack.Screen.Title>

        {groups.length > 0 || !hasLoaded ? (
          <>
            {groups.map((group) => (
              <AccountSection
                key={group.type}
                group={group}
                onPressAccount={handlePressAccount}
                onEditAccount={handleEditAccount}
                onCloseAccount={handleCloseAccount}
                onReopenAccount={handleReopenAccount}
              />
            ))}

            <Button
              title={t("addAccount")}
              buttonStyle="borderless"
              icon="addCircleOutline"
              onPress={() => router.push("/(auth)/account/new")}
              style={styles.addButton}
            />
          </>
        ) : (
          <EmptyState
            icon="wallet"
            title={t("emptyState.title")}
            description={t("emptyState.description")}
            actionLabel={t("addAccount")}
            onAction={() => router.push("/(auth)/account/new")}
          />
        )}
      </ScrollView>
      <AddTransactionButton />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="plus" onPress={() => router.push("/(auth)/account/new")} />
        <Stack.Toolbar.Menu icon="ellipsis">{commonActions}</Stack.Toolbar.Menu>
      </Stack.Toolbar>
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createStyles = (theme: Theme) => ({
  content: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xxxl,
  },
  center: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },

  // Section
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  sectionLabel: {
    flex: 1,
    fontWeight: "600" as const,
  },
  sectionTotal: {
    fontWeight: "600" as const,
  },

  // Account list card
  listCard: {
    padding: 0,
    overflow: "hidden" as const,
  },
  accountRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
    minHeight: 44,
    gap: theme.spacing.sm,
  },
  accountName: {
    flex: 1,
  },

  // Add account button
  addButton: {
    marginTop: theme.spacing.sm,
  },
});
