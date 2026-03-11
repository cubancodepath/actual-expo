import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePrefsStore } from '../../src/stores/prefsStore';
import { resetAllStores } from '../../src/stores/resetStores';
import { resetSyncState, clearSwitchingFlag } from '../../src/sync';
import { useTheme, useThemedStyles } from '../../src/presentation/providers/ThemeProvider';
import {
  Text,
  Card,
  Divider,
  SectionHeader,
  Banner,
  EmptyState,
  BudgetFileRow,
  SwipeableRow,
} from '../../src/presentation/components';
import { useBudgetFiles, fileKey } from '../../src/presentation/hooks/useBudgetFiles';
import type { ReconciledBudgetFile } from '../../src/services/budgetfiles';
import type { Theme } from '../../src/theme';

function confirmDelete(
  file: ReconciledBudgetFile,
  onDelete: (fromServer?: boolean) => void,
) {
  const name = file.name || 'Unnamed budget';

  if (file.state === 'synced') {
    Alert.alert('Delete Budget', `"${name}" is synced with the server.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete Locally', onPress: () => onDelete(false) },
      { text: 'Delete From All Devices', style: 'destructive', onPress: () => onDelete(true) },
    ]);
  } else if (file.state === 'remote') {
    Alert.alert('Delete Budget', `Delete "${name}" from the server?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete From Server', style: 'destructive', onPress: () => onDelete(true) },
    ]);
  } else {
    Alert.alert('Delete Budget', `Delete "${name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(false) },
    ]);
  }
}

export default function FilesScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { clearAll } = usePrefsStore();
  const {
    localFiles, remoteFiles, loading, refreshing, error,
    selecting, selectFile, deleteFile, uploadFile, retry, refresh, dismissError,
  } = useBudgetFiles();

  async function handleSelect(file: ReconciledBudgetFile) {
    try {
      await selectFile(file);
      router.replace('/(auth)/(tabs)/(budget)');
    } catch {
      // Error already set in hook
    }
  }

  function handleDelete(file: ReconciledBudgetFile) {
    confirmDelete(file, (fromServer) => {
      deleteFile(file, fromServer).catch(() => {});
    });
  }

  function handleUpload(file: ReconciledBudgetFile) {
    Alert.alert('Upload to Server', `Upload "${file.name || 'Unnamed budget'}" to the server?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Upload', onPress: () => uploadFile(file).catch(() => {}) },
    ]);
  }

  function handleLogout() {
    Alert.alert(
      'Log Out',
      'Disconnect from this server? You will need to reconnect to access your budgets.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            resetSyncState();
            resetAllStores();
            await clearAll();
            clearSwitchingFlag();
            router.replace('/');
          },
        },
      ],
    );
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
            <Pressable onPress={handleLogout} hitSlop={8} style={styles.headerBtn}>
              <Text variant="body">Log Out</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/(files)/new-budget')}
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
                    <SwipeableRow
                      onDelete={() => handleDelete(file)}
                      onSwipeRight={file.state === 'local' ? () => handleUpload(file) : undefined}
                      swipeRightIcon="cloud-upload-outline"
                      swipeRightColor={colors.primary}
                      isFirst={index === 0}
                      isLast={index === localFiles.length - 1}
                    >
                      <BudgetFileRow
                        file={file}
                        isSelecting={selecting === fileKey(file)}
                        onPress={() => handleSelect(file)}
                      />
                    </SwipeableRow>
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
                    <SwipeableRow
                      onDelete={() => handleDelete(file)}
                      isFirst={index === 0}
                      isLast={index === remoteFiles.length - 1}
                    >
                      <BudgetFileRow
                        file={file}
                        isSelecting={selecting === fileKey(file)}
                        onPress={() => handleSelect(file)}
                      />
                    </SwipeableRow>
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
          onAction={() => router.push('/(files)/new-budget')}
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
