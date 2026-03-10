import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePrefsStore } from '../../src/stores/prefsStore';
import { useTheme, useThemedStyles } from '../../src/presentation/providers/ThemeProvider';
import {
  Text,
  Card,
  Divider,
  SectionHeader,
  IconButton,
  Banner,
  EmptyState,
  BudgetFileRow,
} from '../../src/presentation/components';
import { useBudgetFiles, fileKey } from '../../src/presentation/hooks/useBudgetFiles';
import type { Theme } from '../../src/theme';

export default function ChangeBudgetScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { activeBudgetId } = usePrefsStore();
  const {
    localFiles, remoteFiles, loading, refreshing, error,
    selecting, selectFile, retry, refresh, dismissError,
  } = useBudgetFiles();

  async function handleSelect(file: Parameters<typeof selectFile>[0]) {
    // Don't re-open the already active budget
    if (file.localId && file.localId === activeBudgetId) {
      router.back();
      return;
    }
    try {
      await selectFile(file);
      router.dismissAll();
    } catch {
      // Error already set in hook
    }
  }

  const hasFiles = localFiles.length > 0 || remoteFiles.length > 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
      }
    >
      <Stack.Screen
        options={{
          headerLeft: () => (
            <IconButton
              sfSymbol="xmark"
              size={22}
              color={colors.headerText}
              onPress={() => router.back()}
            />
          ),
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/(auth)/new-budget')}
              hitSlop={8}
              style={styles.headerBtn}
            >
              <Text variant="body" style={{ fontWeight: '600' }}>
                New
              </Text>
            </Pressable>
          ),
        }}
      />

      {error && (
        <View style={{ marginTop: spacing.md }}>
          <Banner message={error} variant="error" onDismiss={dismissError} />
        </View>
      )}

      {loading ? (
        <Card style={{ marginTop: spacing.lg }}>
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text variant="bodySm" color={colors.textMuted}>Loading…</Text>
          </View>
        </Card>
      ) : hasFiles ? (
        <>
          {localFiles.length > 0 && (
            <>
              <SectionHeader title="On This Device" style={{ marginTop: spacing.lg }} />
              <Card style={styles.listCard}>
                {localFiles.map((file, index) => (
                  <View key={fileKey(file)}>
                    {index > 0 && <Divider />}
                    <BudgetFileRow
                      file={file}
                      isActive={file.localId === activeBudgetId}
                      isSelecting={selecting === fileKey(file)}
                      onPress={() => handleSelect(file)}
                    />
                  </View>
                ))}
              </Card>
            </>
          )}

          {remoteFiles.length > 0 && (
            <>
              <SectionHeader title="Available on Server" style={{ marginTop: spacing.lg }} />
              <Card style={styles.listCard}>
                {remoteFiles.map((file, index) => (
                  <View key={fileKey(file)}>
                    {index > 0 && <Divider />}
                    <BudgetFileRow
                      file={file}
                      isSelecting={selecting === fileKey(file)}
                      onPress={() => handleSelect(file)}
                    />
                  </View>
                ))}
              </Card>
            </>
          )}
        </>
      ) : (
        <EmptyState
          icon="folder-open-outline"
          title="No budgets found"
          description="There are no budget files on this server or on this device."
          actionLabel="Create New Budget"
          onAction={() => router.push('/(auth)/new-budget')}
        />
      )}
    </ScrollView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
    paddingHorizontal: theme.spacing.lg,
  },
  listCard: {
    padding: 0,
    overflow: 'hidden' as const,
  },
  loadingRow: {
    paddingVertical: theme.spacing.xl,
    alignItems: 'center' as const,
    gap: theme.spacing.md,
  },
  headerBtn: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
});
