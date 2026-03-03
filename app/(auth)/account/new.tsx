import { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAccountsStore } from '../../../src/stores/accountsStore';
import { useTheme, useThemedStyles } from '../../../src/presentation/providers/ThemeProvider';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { Button } from '../../../src/presentation/components/atoms/Button';
import { Banner } from '../../../src/presentation/components/molecules/Banner';
import type { Theme } from '../../../src/theme';

/** Parse a user-typed balance string like "1,234.56" or "-50" into cents */
function parseToCents(raw: string): number {
  const cleaned = raw.replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

export default function NewAccountScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { create, load } = useAccountsStore();

  const [name, setName] = useState('');
  const [balanceStr, setBalanceStr] = useState('');
  const [offbudget, setOffbudget] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) { setError('Account name is required'); return; }

    setError(null);
    setLoading(true);
    try {
      const startingBalance = parseToCents(balanceStr);
      await create({ name: trimmed, offbudget, closed: false }, startingBalance);
      await load();
      router.back();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
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
            placeholder="e.g. Checking, Savings, Cash"
            placeholderTextColor={theme.colors.textMuted}
            value={name}
            onChangeText={t => { setName(t); setError(null); }}
            autoFocus
            returnKeyType="next"
          />

          {/* Starting balance */}
          <Text variant="caption" color={theme.colors.textSecondary} style={styles.label}>
            Starting balance
          </Text>
          <View style={styles.balanceInputRow}>
            <Text variant="body" color={theme.colors.textSecondary} style={styles.currencyPrefix}>
              $
            </Text>
            <TextInput
              style={styles.balanceInput}
              placeholder="0.00"
              placeholderTextColor={theme.colors.textMuted}
              value={balanceStr}
              onChangeText={setBalanceStr}
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />
          </View>
          <Text variant="captionSm" color={theme.colors.textMuted} style={styles.hint}>
            Leave blank or 0 to start with an empty account.{'\n'}
            Use a negative value for an account already in debt.
          </Text>

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

          {/* Create button */}
          <Button
            title="Create Account"
            onPress={handleCreate}
            size="lg"
            loading={loading}
            disabled={!name.trim()}
            style={styles.createButton}
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
  balanceInputRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth.default,
    borderColor: theme.colors.inputBorder,
    paddingHorizontal: theme.spacing.md,
  },
  currencyPrefix: {
    fontWeight: '600' as const,
    marginRight: theme.spacing.xs,
  },
  balanceInput: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 16,
    paddingVertical: theme.spacing.md,
  },
  hint: {
    lineHeight: 18,
    marginTop: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
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
  createButton: {
    marginTop: theme.spacing.xxl,
  },
});
