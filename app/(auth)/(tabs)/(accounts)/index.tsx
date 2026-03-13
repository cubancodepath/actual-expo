import { useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as ContextMenu from 'zeego/context-menu';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAccountsStore } from '../../../../src/stores/accountsStore';
import { useRefreshControl } from '../../../../src/presentation/hooks/useRefreshControl';
import { groupAccounts, type AccountGroup } from '../../../../src/accounts';
import { useTheme, useThemedStyles } from '../../../../src/presentation/providers/ThemeProvider';
import { Text } from '../../../../src/presentation/components/atoms/Text';
import { Card } from '../../../../src/presentation/components/atoms/Card';
import { Amount } from '../../../../src/presentation/components/atoms/Amount';
import { RowSeparator } from '../../../../src/presentation/components/atoms/RowSeparator';
import { Button } from '../../../../src/presentation/components/atoms/Button';
import { EmptyState } from '../../../../src/presentation/components/molecules/EmptyState';
import { AddTransactionButton } from '../../../../src/presentation/components/molecules/AddTransactionButton';
import type { Theme } from '../../../../src/theme';
import { useCommonMenuActions } from '../../../../src/presentation/hooks/useCommonMenuItems';
import { useTranslation } from 'react-i18next';
import type { Account } from '../../../../src/accounts/types';

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
  const { t } = useTranslation('accounts');
  const { t: tc } = useTranslation('common');

  const row = (
    <Pressable
      style={styles.accountRow}
      onPress={onPress}
      onLongPress={Platform.OS === 'android'
        ? () => {
            const items = [
              { text: t('contextMenu.viewTransactions'), onPress },
              { text: t('contextMenu.editAccount'), onPress: onEdit },
              account.closed
                ? { text: t('contextMenu.reopenAccount'), onPress: onReopen }
                : { text: t('contextMenu.closeAccount'), style: 'destructive' as const, onPress: onClose },
              { text: tc('cancel'), style: 'cancel' as const },
            ];
            Alert.alert(account.name, undefined, items);
          }
        : undefined}
    >
      <Text variant="body" color={theme.colors.textPrimary} style={styles.accountName}>
        {account.name}
      </Text>
      <Amount value={account.balance ?? 0} variant="body" />
      <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
      {!isLast && <RowSeparator insetLeft={theme.spacing.md} insetRight={theme.spacing.md} />}
    </Pressable>
  );

  if (Platform.OS === 'ios') {
    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger>{row}</ContextMenu.Trigger>
        <ContextMenu.Content>
          <ContextMenu.Item key="view" onSelect={onPress}>
            <ContextMenu.ItemTitle>{t('contextMenu.viewTransactions')}</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: 'list.bullet' }} />
          </ContextMenu.Item>
          <ContextMenu.Item key="edit" onSelect={onEdit}>
            <ContextMenu.ItemTitle>{t('contextMenu.editAccount')}</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: 'pencil' }} />
          </ContextMenu.Item>
          {account.closed ? (
            <ContextMenu.Item key="reopen" onSelect={onReopen}>
              <ContextMenu.ItemTitle>{t('contextMenu.reopenAccount')}</ContextMenu.ItemTitle>
              <ContextMenu.ItemIcon ios={{ name: 'arrow.counterclockwise' }} />
            </ContextMenu.Item>
          ) : (
            <ContextMenu.Item key="close" destructive onSelect={onClose}>
              <ContextMenu.ItemTitle>{t('contextMenu.closeAccount')}</ContextMenu.ItemTitle>
              <ContextMenu.ItemIcon ios={{ name: 'trash' }} />
            </ContextMenu.Item>
          )}
        </ContextMenu.Content>
      </ContextMenu.Root>
    );
  }

  return row;
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
  const { t } = useTranslation('accounts');

  const groupLabel = group.type === 'budget'
    ? t('groups.budgetAccounts')
    : t('groups.offBudget');

  const isExpanded = useSharedValue(true);
  const height = useSharedValue(0);
  const rotation = useSharedValue(0);

  const derivedHeight = useDerivedValue(() =>
    withTiming(height.value * (isExpanded.value ? 1 : 0), { duration: 250 })
  );

  const bodyStyle = useAnimatedStyle(() => ({
    height: derivedHeight.value,
    overflow: 'hidden' as const,
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
          <Ionicons name="chevron-down" size={18} color={theme.colors.textSecondary} />
        </Animated.View>
        <Text variant="body" color={theme.colors.textPrimary} style={styles.sectionLabel}>
          {groupLabel}
        </Text>
        <Amount value={group.total} variant="body" style={styles.sectionTotal} />
      </Pressable>

      {/* Hidden measurer — always keeps natural height */}
      <View
        style={{ position: 'absolute', opacity: 0, zIndex: -1 }}
        onLayout={e => { height.value = e.nativeEvent.layout.height; }}
        pointerEvents="none"
      >
        <AccountContent group={group} onPressAccount={onPressAccount} onEditAccount={onEditAccount} onCloseAccount={onCloseAccount} onReopenAccount={onReopenAccount} styles={styles} />
      </View>

      {/* Animated collapsible body */}
      <Animated.View style={bodyStyle}>
        <AccountContent group={group} onPressAccount={onPressAccount} onEditAccount={onEditAccount} onCloseAccount={onCloseAccount} onReopenAccount={onReopenAccount} styles={styles} />
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
  const { accounts, loading, load, update } = useAccountsStore();
  const { refreshControlProps } = useRefreshControl();
  const commonActions = useCommonMenuActions();
  const { t } = useTranslation('accounts');

  useEffect(() => { load(); }, []);

  const groups = groupAccounts(accounts);

  function handlePressAccount(account: Account) {
    router.push(`/(auth)/account/${account.id}`);
  }

  function handleEditAccount(account: Account) {
    router.push({ pathname: '/(auth)/account/settings', params: { id: account.id } });
  }

  function handleCloseAccount(account: Account) {
    router.push({ pathname: '/(auth)/account/close', params: { id: account.id } });
  }

  function handleReopenAccount(account: Account) {
    update(account.id, { closed: false }).then(() => load());
  }

  if (loading && accounts.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl {...refreshControlProps} />
        }
      >
        <Stack.Screen.Title large>{t('title')}</Stack.Screen.Title>

        {groups.length > 0 ? (
          <>
            {groups.map(group => (
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
              title={t('addAccount')}
              variant="ghost"
              icon="add-circle-outline"
              onPress={() => router.push('/(auth)/account/new')}
              style={styles.addButton}
            />
          </>
        ) : (
          <EmptyState
            icon="wallet-outline"
            title={t('emptyState.title')}
            description={t('emptyState.description')}
            actionLabel={t('addAccount')}
            onAction={() => router.push('/(auth)/account/new')}
          />
        )}
      </ScrollView>
      <AddTransactionButton />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="plus"
          onPress={() => router.push('/(auth)/account/new')}
        />
        <Stack.Toolbar.Menu icon="ellipsis">
          {commonActions}
        </Stack.Toolbar.Menu>
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
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  // Section
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  sectionLabel: {
    flex: 1,
    fontWeight: '600' as const,
  },
  sectionTotal: {
    fontWeight: '600' as const,
  },

  // Account list card
  listCard: {
    padding: 0,
    overflow: 'hidden' as const,
  },
  accountRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
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
