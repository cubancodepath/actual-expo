import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePrefsStore } from '../../src/stores/prefsStore';
import { listFiles, type BudgetFile } from '../../src/services/authService';
import { downloadAndImportBudget } from '../../src/services/budgetfiles';
import { resetAllStores } from '../../src/stores/resetStores';
import { fullSync, clearSyncTimeout } from '../../src/sync';
import { useTheme, useThemedStyles } from '../../src/presentation/providers/ThemeProvider';
import { Text } from '../../src/presentation/components/atoms/Text';
import { Card } from '../../src/presentation/components/atoms/Card';
import { Divider } from '../../src/presentation/components/atoms/Divider';
import { Banner } from '../../src/presentation/components/molecules/Banner';
import { EmptyState } from '../../src/presentation/components/molecules/EmptyState';
import type { Theme } from '../../src/theme';

export default function ChangeBudgetScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { serverUrl, token, fileId: currentFileId } = usePrefsStore();
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
      clearSyncTimeout();
      resetAllStores();
      await downloadAndImportBudget(serverUrl, token, file.fileId, file.encryptKeyId);

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

      usePrefsStore.getState().setPrefs({
        fileId: file.fileId,
        groupId: file.groupId,
        encryptKeyId: file.encryptKeyId,
        budgetName: file.name || 'Unnamed budget',
        lastSyncedTimestamp: undefined,
      });

      fullSync().catch(console.warn);
      router.back();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setSelecting(null);
    }
  }

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

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
            </Pressable>
          ),
        }}
      />
      {error && (
        <View style={styles.errorBanner}>
          <Banner
            message={error}
            variant="error"
            onDismiss={() => setError(null)}
          />
        </View>
      )}

      <Text variant="bodySm" color={theme.colors.primary} style={styles.sectionTitle}>
        Your Budgets
      </Text>

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
                ) : item.fileId === currentFileId ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={22}
                    color={theme.colors.primary}
                  />
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
    paddingTop: theme.spacing.md,
  },
  center: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing.md,
  },
  sectionTitle: {
    fontWeight: '600' as const,
    marginBottom: theme.spacing.sm,
    marginLeft: theme.spacing.xs,
  },
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
