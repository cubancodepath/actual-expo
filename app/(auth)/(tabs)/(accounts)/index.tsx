import { useEffect } from 'react';
import {
  ActivityIndicator,
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
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAccountsStore } from '../../../../src/stores/accountsStore';
import { useRefreshControl } from '../../../../src/presentation/hooks/useRefreshControl';
import { groupAccounts, type AccountGroup } from '../../../../src/accounts';
import { useTheme, useThemedStyles } from '../../../../src/presentation/providers/ThemeProvider';
import { Text } from '../../../../src/presentation/components/atoms/Text';
import { Card } from '../../../../src/presentation/components/atoms/Card';
import { Amount } from '../../../../src/presentation/components/atoms/Amount';
import { Divider } from '../../../../src/presentation/components/atoms/Divider';
import { Button } from '../../../../src/presentation/components/atoms/Button';
import { EmptyState } from '../../../../src/presentation/components/molecules/EmptyState';
import { AddTransactionButton } from '../../../../src/presentation/components/molecules/AddTransactionButton';
import type { Theme } from '../../../../src/theme';
import { useCommonMenuActions } from '../../../../src/presentation/hooks/useCommonMenuItems';
import type { Account } from '../../../../src/accounts/types';

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function AccountContent({
  group,
  onPressAccount,
  styles,
}: {
  group: AccountGroup;
  onPressAccount: (a: Account) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const theme = useTheme();
  return (
    <Card style={styles.listCard}>
      {group.accounts.map((account, i) => (
        <View key={account.id}>
          {i > 0 && <Divider style={{ marginHorizontal: theme.spacing.md }} />}
          <Pressable
            style={styles.accountRow}
            onPress={() => onPressAccount(account)}
          >
            <Text variant="body" color={theme.colors.textPrimary} style={styles.accountName}>
              {account.name}
            </Text>
            <Amount value={account.balance ?? 0} variant="body" />
            <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
          </Pressable>
        </View>
      ))}
    </Card>
  );
}

function AccountSection({
  group,
  onPressAccount,
}: {
  group: AccountGroup;
  onPressAccount: (a: Account) => void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);

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
          {group.label}
        </Text>
        <Amount value={group.total} variant="body" style={styles.sectionTotal} />
      </Pressable>

      {/* Hidden measurer — always keeps natural height */}
      <View
        style={{ position: 'absolute', opacity: 0, zIndex: -1 }}
        onLayout={e => { height.value = e.nativeEvent.layout.height; }}
        pointerEvents="none"
      >
        <AccountContent group={group} onPressAccount={onPressAccount} styles={styles} />
      </View>

      {/* Animated collapsible body */}
      <Animated.View style={bodyStyle}>
        <AccountContent group={group} onPressAccount={onPressAccount} styles={styles} />
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
  const { accounts, loading, load } = useAccountsStore();
  const { refreshControlProps } = useRefreshControl();
  const commonActions = useCommonMenuActions();

  useEffect(() => { load(); }, []);

  const groups = groupAccounts(accounts);

  function handlePressAccount(account: Account) {
    router.push(`/(auth)/account/${account.id}`);
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
        <Stack.Screen.Title large>Accounts</Stack.Screen.Title>

        {groups.length > 0 ? (
          <>
            {groups.map(group => (
              <AccountSection
                key={group.type}
                group={group}
                onPressAccount={handlePressAccount}
              />
            ))}

            <Button
              title="Add Account"
              variant="ghost"
              icon="add-circle-outline"
              onPress={() => router.push('/(auth)/account/new')}
              style={styles.addButton}
            />
          </>
        ) : (
          <EmptyState
            icon="wallet-outline"
            title="No accounts yet"
            description="Add your first account to get started."
            actionLabel="Add Account"
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
    paddingVertical: theme.spacing.md,
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
