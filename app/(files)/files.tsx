import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePrefsStore } from '../../src/stores/prefsStore';
import { listFiles, type BudgetFile } from '../../src/services/authService';
import { downloadAndImportBudget } from '../../src/services/budgetfiles';
import { fullSync } from '../../src/sync';
import { useTheme, useThemedStyles } from '../../src/presentation/providers/ThemeProvider';
import { Text } from '../../src/presentation/components/atoms/Text';
import { Card } from '../../src/presentation/components/atoms/Card';
import { Divider } from '../../src/presentation/components/atoms/Divider';
import { Banner } from '../../src/presentation/components/molecules/Banner';
import { EmptyState } from '../../src/presentation/components/molecules/EmptyState';
import type { Theme } from '../../src/theme';

export default function FilesScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { serverUrl, token, clearAll } = usePrefsStore();
  const [files, setFiles] = useState<BudgetFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const activeFiles = files.filter(f => !f.deleted);

  useEffect(() => {
    listFiles(serverUrl, token)
      .then(setFiles)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [serverUrl, token]);

  async function handleSelect(file: BudgetFile) {
    setSelecting(file.fileId);
    try {
      await downloadAndImportBudget(serverUrl, token, file.fileId, file.encryptKeyId);
      usePrefsStore.getState().setPrefs({
        fileId: file.fileId,
        groupId: file.groupId,
        encryptKeyId: file.encryptKeyId,
        lastSyncedTimestamp: undefined,
      });

      const [
        { useAccountsStore },
        { useCategoriesStore },
        { useBudgetStore },
      ] = await Promise.all([
        import('../../src/stores/accountsStore'),
        import('../../src/stores/categoriesStore'),
        import('../../src/stores/budgetStore'),
      ]);
      await Promise.allSettled([
        useAccountsStore.getState().load(),
        useCategoriesStore.getState().load(),
        useBudgetStore.getState().load(),
      ]);

      fullSync().catch(console.warn);
      router.replace('/(auth)/(tabs)/(budget)');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setSelecting(null);
    }
  }

  async function handleLogout() {
    await clearAll();
    router.replace('/');
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text variant="bodySm" color={theme.colors.textMuted}>
          Loading budget files…
        </Text>
      </View>
    );
  }

  // ── Main view ──────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header bar */}
      <View style={styles.headerBar}>
        <Pressable style={styles.headerBtn} onPress={handleLogout} hitSlop={8}>
          <Text variant="body" color={theme.colors.textPrimary} style={styles.headerBtnText}>
            Log Out
          </Text>
        </Pressable>

        <Text variant="bodyLg" color={theme.colors.textPrimary} style={styles.headerTitle}>
          Open Budget
        </Text>

        <Pressable style={styles.headerBtn} hitSlop={8} disabled>
          <Text variant="body" color={theme.colors.textMuted} style={styles.headerBtnText}>
            New
          </Text>
        </Pressable>
      </View>

      {/* Error */}
      {error && (
        <View style={styles.errorBanner}>
          <Banner
            message={error}
            variant="error"
            onDismiss={() => setError(null)}
          />
        </View>
      )}

      {/* Section header */}
      <Text variant="bodySm" color={theme.colors.primary} style={styles.sectionTitle}>
        Your Budgets
      </Text>

      {/* File list in a card */}
      {activeFiles.length > 0 ? (
        <Card style={styles.listCard}>
          <FlatList
            data={activeFiles}
            keyExtractor={f => f.fileId}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <Divider />}
            renderItem={({ item }) => (
              <Pressable
                style={styles.fileRow}
                onPress={() => handleSelect(item)}
                disabled={selecting !== null}
              >
                <View style={styles.fileIcon}>
                  <Ionicons
                    name="document-outline"
                    size={20}
                    color={theme.colors.primary}
                  />
                </View>
                <View style={styles.fileInfo}>
                  <Text variant="body" color={theme.colors.textPrimary}>
                    {item.name || 'Unnamed budget'}
                  </Text>
                  {item.ownerName && (
                    <Text variant="captionSm" color={theme.colors.textMuted}>
                      {item.ownerName}
                    </Text>
                  )}
                  {item.encryptKeyId && (
                    <Text variant="captionSm" color={theme.colors.textMuted}>
                      Encrypted
                    </Text>
                  )}
                </View>
                {selecting === item.fileId ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={theme.colors.textMuted}
                  />
                )}
              </Pressable>
            )}
          />
        </Card>
      ) : (
        <EmptyState
          icon="folder-open-outline"
          title="No budgets found"
          description="There are no budget files on this server."
        />
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
    paddingHorizontal: theme.spacing.lg,
  },
  center: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing.md,
  },

  // Header bar
  headerBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingTop: theme.spacing.xxxl + theme.spacing.xl,
    paddingBottom: theme.spacing.lg,
  },
  headerBtn: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  headerBtnText: {
    fontWeight: '600' as const,
  },
  headerTitle: {
    fontWeight: '700' as const,
  },

  // Section
  sectionTitle: {
    fontWeight: '600' as const,
    marginBottom: theme.spacing.sm,
    marginLeft: theme.spacing.xs,
  },

  // List card
  listCard: {
    padding: 0,
    overflow: 'hidden' as const,
  },
  fileRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
  },
  fileIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary + '15',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  fileInfo: {
    flex: 1,
  },

  errorBanner: {
    marginBottom: theme.spacing.md,
  },
});
