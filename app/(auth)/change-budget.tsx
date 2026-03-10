import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SectionList,
  Pressable,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { usePrefsStore } from '../../src/stores/prefsStore';
import { listFiles } from '../../src/services/authService';
import {
  type ReconciledBudgetFile,
  reconcileFiles,
  switchBudget,
} from '../../src/services/budgetfiles';
import { listLocalBudgets } from '../../src/services/budgetMetadata';
import { clearSwitchingFlag } from '../../src/sync';
import { useTheme, useThemedStyles } from '../../src/presentation/providers/ThemeProvider';
import { Text } from '../../src/presentation/components/atoms/Text';
import { Card } from '../../src/presentation/components/atoms/Card';
import { Banner } from '../../src/presentation/components/molecules/Banner';
import { EmptyState } from '../../src/presentation/components/molecules/EmptyState';
import type { Theme } from '../../src/theme';

const STATE_ICON: Record<string, string> = {
  synced: 'checkmark-circle',
  local: 'phone-portrait-outline',
  detached: 'warning-outline',
  remote: 'cloud-download-outline',
};

const STATE_LABEL: Record<string, string> = {
  synced: 'Synced',
  local: 'Local only',
  detached: 'Detached',
  remote: 'Download',
};

export default function ChangeBudgetScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { serverUrl, token, activeBudgetId } = usePrefsStore();
  const [files, setFiles] = useState<ReconciledBudgetFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [local, remote] = await Promise.all([
        listLocalBudgets(),
        listFiles(serverUrl, token).catch(() => []),
      ]);
      setFiles(reconcileFiles(local, remote));
    }
    load()
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [serverUrl, token]);

  const localFiles = files.filter(f => f.state !== 'remote');
  const remoteFiles = files.filter(f => f.state === 'remote');

  const sections = [
    ...(localFiles.length > 0 ? [{ title: 'On This Device', data: localFiles }] : []),
    ...(remoteFiles.length > 0 ? [{ title: 'Available on Server', data: remoteFiles }] : []),
  ];

  async function handleSelect(file: ReconciledBudgetFile) {
    // Don't re-open the already active budget
    if (file.localId && file.localId === activeBudgetId) {
      router.back();
      return;
    }

    const key = file.localId ?? file.cloudFileId ?? file.name;
    setSelecting(key);
    try {
      await switchBudget(file, serverUrl, token);
      router.dismissAll();
    } catch (e: unknown) {
      clearSwitchingFlag();
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
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              style={styles.headerBtn}
              onPress={async () => {
                await WebBrowser.openAuthSessionAsync(serverUrl, undefined, {
                  preferEphemeralSession: true,
                });
                setLoading(true);
                const [local, remote] = await Promise.all([
                  listLocalBudgets(),
                  listFiles(serverUrl, token).catch(() => []),
                ]);
                setFiles(reconcileFiles(local, remote));
                setLoading(false);
              }}
              hitSlop={8}
            >
              <Text variant="body" color={theme.colors.textPrimary} style={styles.headerBtnText}>
                New
              </Text>
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

      {sections.length > 0 ? (
        <SectionList
          sections={sections}
          keyExtractor={f => f.localId ?? f.cloudFileId ?? f.name}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text variant="bodySm" color={theme.colors.primary} style={styles.sectionTitle}>
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => {
            const key = item.localId ?? item.cloudFileId ?? item.name;
            const isActive = item.localId === activeBudgetId;
            const icon = STATE_ICON[item.state] ?? 'document-outline';
            return (
              <Card style={styles.listCard}>
                <Pressable
                  style={styles.fileRow}
                  onPress={() => handleSelect(item)}
                  disabled={selecting !== null}
                >
                  <View style={styles.fileIcon}>
                    <Ionicons
                      name={icon as any}
                      size={20}
                      color={theme.colors.primary}
                    />
                  </View>
                  <View style={styles.fileInfo}>
                    <Text variant="body" color={theme.colors.textPrimary}>
                      {item.name || 'Unnamed budget'}
                    </Text>
                    <Text variant="captionSm" color={theme.colors.textMuted}>
                      {STATE_LABEL[item.state]}
                      {item.ownerName ? ` · ${item.ownerName}` : ''}
                    </Text>
                  </View>
                  {selecting === key ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : isActive ? (
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
              </Card>
            );
          }}
          SectionSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderSectionFooter={() => <View style={{ height: 12 }} />}
        />
      ) : (
        <EmptyState
          icon="folder-open-outline"
          title="No budgets found"
          description="There are no budget files on this server or on this device."
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
    marginBottom: theme.spacing.xs,
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
  headerBtn: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  headerBtnText: {
    fontWeight: '600' as const,
  },
});
