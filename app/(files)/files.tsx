import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  View,
} from 'react-native';

import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { usePrefsStore } from '../../src/stores/prefsStore';
import { listFiles, type BudgetFile } from '../../src/services/authService';
import { switchBudget } from '../../src/services/budgetfiles';
import { resetAllStores } from '../../src/stores/resetStores';
import { resetSyncState, clearSwitchingFlag } from '../../src/sync';
import { useTheme, useThemedStyles } from '../../src/presentation/providers/ThemeProvider';
import { Text } from '../../src/presentation/components/atoms/Text';
import { GlassButton } from '../../src/presentation/components/atoms/GlassButton';
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
      await switchBudget(serverUrl, token, file);
      router.replace('/(auth)/(tabs)/(budget)');
    } catch (e: unknown) {
      clearSwitchingFlag();
      setError(e instanceof Error ? e.message : String(e));
      setSelecting(null);
    }
  }

  async function handleLogout() {
    resetSyncState();
    resetAllStores();
    await clearAll();
    clearSwitchingFlag();
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
        <GlassButton label="Log Out" onPress={handleLogout} />

        <Text variant="bodyLg" color={theme.colors.textPrimary} style={styles.headerTitle}>
          Open Budget
        </Text>

        <GlassButton
          label="New"
          onPress={async () => {
            await WebBrowser.openAuthSessionAsync(serverUrl, undefined, {
              preferEphemeralSession: true,
            });
            setLoading(true);
            listFiles(serverUrl, token)
              .then(setFiles)
              .catch(e => setError(e instanceof Error ? e.message : String(e)))
              .finally(() => setLoading(false));
          }}
        />
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
    backgroundColor: theme.colors.primarySubtle,
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
