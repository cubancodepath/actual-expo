import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAccountsStore } from '../../../src/stores/accountsStore';
import { useUndoStore } from '../../../src/stores/undoStore';
import { useTheme, useThemedStyles } from '../../../src/presentation/providers/ThemeProvider';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { Button } from '../../../src/presentation/components/atoms/Button';
import { Banner } from '../../../src/presentation/components/molecules/Banner';
import type { Theme } from '../../../src/theme';

export default function AccountSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { accounts, update, close, delete_, load } = useAccountsStore();
  const account = accounts.find(a => a.id === id);

  const [name, setName] = useState(account?.name ?? '');
  const [offbudget, setOffbudget] = useState(account?.offbudget ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!account) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  const hasChanges = name.trim() !== account.name || offbudget !== account.offbudget;

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { setError('Account name is required'); return; }

    setError(null);
    setSaving(true);
    try {
      const changes: Record<string, unknown> = {};
      if (trimmed !== account!.name) changes.name = trimmed;
      if (offbudget !== account!.offbudget) changes.offbudget = offbudget;
      if (Object.keys(changes).length > 0) {
        await update(id, changes);
        await load();
      }
      router.back();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    Alert.alert(
      account!.closed ? 'Reopen Account' : 'Close Account',
      account!.closed
        ? 'Reopen this account? It will appear in your budget again.'
        : 'Close this account? It will be hidden but transactions are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: account!.closed ? 'Reopen' : 'Close',
          onPress: async () => {
            setSaving(true);
            try {
              await update(id, { closed: !account!.closed });
              await load();
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }

  function handleDelete() {
    Alert.alert(
      'Delete Account',
      'Permanently delete this account and all its transactions?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await delete_(id);
              await load();
              useUndoStore.getState().showUndo('Account deleted');
              router.dismiss();
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {/* Account name */}
        <Text variant="caption" color={theme.colors.textSecondary} style={styles.label}>
          Account name
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Account name"
          placeholderTextColor={theme.colors.textMuted}
          value={name}
          onChangeText={t => { setName(t); setError(null); }}
          returnKeyType="done"
        />

        {/* Off budget toggle */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text variant="body" color={theme.colors.textPrimary}>
              Off budget
            </Text>
            <Text variant="captionSm" color={theme.colors.textMuted}>
              Transactions won't affect your budget
            </Text>
          </View>
          <Switch
            value={offbudget}
            onValueChange={setOffbudget}
            trackColor={{ false: theme.colors.inputBorder, true: theme.colors.primary }}
            thumbColor={theme.colors.cardBackground}
            ios_backgroundColor={theme.colors.inputBorder}
          />
        </View>

        {/* Error */}
        {error && (
          <Banner message={error} variant="error" onDismiss={() => setError(null)} />
        )}

        {/* Save button */}
        <Button
          title="Save"
          onPress={handleSave}
          size="lg"
          loading={saving}
          disabled={!hasChanges || !name.trim()}
          style={styles.saveButton}
        />

        {/* Actions */}
        <Text variant="caption" color={theme.colors.textSecondary} style={styles.actionsLabel}>
          Actions
        </Text>

        <Button
          title={account.closed ? 'Reopen Account' : 'Close Account'}
          onPress={handleClose}
          variant="secondary"
          disabled={saving}
        />

        <Button
          title="Delete Account"
          onPress={handleDelete}
          variant="danger"
          disabled={saving}
          style={styles.deleteButton}
        />
      </ScrollView>
    </>
  );
}

const createStyles = (theme: Theme) => ({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
  },
  center: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  container: {
    padding: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  label: {
    fontWeight: '600' as const,
    marginTop: theme.spacing.lg,
    marginLeft: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  input: {
    backgroundColor: theme.colors.inputBackground,
    color: theme.colors.textPrimary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: 16,
    borderWidth: theme.borderWidth.default,
    borderColor: theme.colors.inputBorder,
  },
  toggleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: theme.borderWidth.default,
    borderColor: theme.colors.cardBorder,
    marginTop: theme.spacing.xl,
  },
  toggleText: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  saveButton: {
    marginTop: theme.spacing.xxl,
  },
  actionsLabel: {
    fontWeight: '600' as const,
    marginTop: theme.spacing.xxl,
    marginLeft: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  deleteButton: {
    marginTop: theme.spacing.xs,
  },
});
