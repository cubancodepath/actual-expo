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
import { useTheme, useThemedStyles } from '../../../src/presentation/providers/ThemeProvider';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { Button } from '../../../src/presentation/components/atoms/Button';
import { Banner } from '../../../src/presentation/components/molecules/Banner';
import { useTranslation } from 'react-i18next';
import type { Theme } from '../../../src/theme';

export default function AccountSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation('accounts');
  const { t: tc } = useTranslation('common');
  const { accounts, update, load } = useAccountsStore();
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
    if (!trimmed) { setError(t('settings.accountNameRequired')); return; }

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
    if (account!.closed) {
      // Reopen — simple toggle
      Alert.alert(
        t('settings.reopenAccountTitle'),
        t('settings.reopenAccountMessage'),
        [
          { text: tc('cancel'), style: 'cancel' },
          {
            text: t('settings.reopen'),
            onPress: async () => {
              setSaving(true);
              try {
                await update(id, { closed: false });
                await load();
              } finally {
                setSaving(false);
              }
            },
          },
        ],
      );
    } else {
      // Close — open the close account modal
      router.push({ pathname: '/(auth)/account/close', params: { id } });
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
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
          {t('settings.accountNameLabel')}
        </Text>
        <TextInput
          style={styles.input}
          placeholder={t('settings.accountNamePlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          value={name}
          onChangeText={t => { setName(t); setError(null); }}
          returnKeyType="done"
        />

        {/* Off budget toggle */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text variant="body" color={theme.colors.textPrimary}>
              {t('settings.offBudget')}
            </Text>
            <Text variant="captionSm" color={theme.colors.textMuted}>
              {t('settings.offBudgetDescription')}
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
          title={tc('save')}
          onPress={handleSave}
          size="lg"
          loading={saving}
          disabled={!hasChanges || !name.trim()}
          style={styles.saveButton}
        />

        <Button
          title={account.closed ? t('contextMenu.reopenAccount') : t('contextMenu.closeAccount')}
          onPress={handleClose}
          variant="ghost"
          icon={account.closed ? 'arrow-undo-outline' : 'trash-outline'}
          textColor={account.closed ? undefined : theme.colors.negative}
          disabled={saving}
          style={styles.closeButton}
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
  closeButton: {
    marginTop: theme.spacing.sm,
  },
});
