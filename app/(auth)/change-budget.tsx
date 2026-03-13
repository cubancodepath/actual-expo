import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePrefsStore } from '../../src/stores/prefsStore';
import { useTheme, useThemedStyles } from '../../src/presentation/providers/ThemeProvider';
import {
  Text,
  Card,
  SectionHeader,
  IconButton,
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
  activeBudgetId: string,
  onDelete: (fromServer?: boolean) => void,
  t: any,
) {
  const name = file.name || t('budget.unnamedBudget');
  const isActive = file.localId != null && file.localId === activeBudgetId;
  const warning = isActive ? t('budget.activeWarning') : '';

  if (file.state === 'synced') {
    Alert.alert(t('budget.deleteBudgetTitle'), t('budget.deleteSyncedMessage', { name, warning }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('budget.deleteLocally'), onPress: () => onDelete(false) },
      { text: t('budget.deleteFromAllDevices'), style: 'destructive', onPress: () => onDelete(true) },
    ]);
  } else if (file.state === 'remote') {
    Alert.alert(t('budget.deleteBudgetTitle'), t('budget.deleteRemoteMessage', { name }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('budget.deleteFromServer'), style: 'destructive', onPress: () => onDelete(true) },
    ]);
  } else {
    Alert.alert(t('budget.deleteBudgetTitle'), t('budget.deleteLocalMessage', { name, warning }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: () => onDelete(false) },
    ]);
  }
}

export default function ChangeBudgetScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { activeBudgetId } = usePrefsStore();
  const {
    localFiles, remoteFiles, loading, refreshing, error,
    selecting, selectFile, deleteFile, uploadFile, retry, refresh, dismissError,
  } = useBudgetFiles();

  async function handleSelect(file: ReconciledBudgetFile) {
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

  function handleDelete(file: ReconciledBudgetFile) {
    confirmDelete(file, activeBudgetId, (fromServer) => {
      deleteFile(file, fromServer).catch(() => {});
    }, t);
  }

  function handleUpload(file: ReconciledBudgetFile) {
    const name = file.name || t('budget.unnamedBudget');
    Alert.alert(t('budget.uploadToServer'), t('budget.uploadConfirm', { name }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('upload'), onPress: () => uploadFile(file).catch(() => {}) },
    ]);
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
                {t('new')}
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
            <Text variant="bodySm" color={colors.textMuted}>{t('loading')}</Text>
          </View>
        </Card>
      ) : hasFiles ? (
        <>
          {localFiles.length > 0 && (
            <>
              <SectionHeader title={t('budget.onThisDevice')} style={{ marginTop: spacing.lg }} />
              <Card style={styles.listCard}>
                {localFiles.map((file, index) => (
                  <SwipeableRow
                    key={fileKey(file)}
                    onDelete={() => handleDelete(file)}
                    onSwipeRight={file.state === 'local' ? () => handleUpload(file) : undefined}
                    swipeRightIcon="cloud-upload-outline"
                    swipeRightColor={colors.primary}
                    isFirst={index === 0}
                    isLast={index === localFiles.length - 1}
                  >
                    <BudgetFileRow
                      file={file}
                      isActive={file.localId === activeBudgetId}
                      isSelecting={selecting === fileKey(file)}
                      onPress={() => handleSelect(file)}
                      showSeparator={index < localFiles.length - 1}
                    />
                  </SwipeableRow>
                ))}
              </Card>
            </>
          )}

          {remoteFiles.length > 0 && (
            <>
              <SectionHeader title={t('budget.availableOnServer')} style={{ marginTop: spacing.lg }} />
              <Card style={styles.listCard}>
                {remoteFiles.map((file, index) => (
                  <SwipeableRow
                    key={fileKey(file)}
                    onDelete={() => handleDelete(file)}
                    isFirst={index === 0}
                    isLast={index === remoteFiles.length - 1}
                  >
                    <BudgetFileRow
                      file={file}
                      isSelecting={selecting === fileKey(file)}
                      onPress={() => handleSelect(file)}
                      showSeparator={index < remoteFiles.length - 1}
                    />
                  </SwipeableRow>
                ))}
              </Card>
            </>
          )}
        </>
      ) : (
        <EmptyState
          icon="folder-open-outline"
          title={t('budget.noBudgetsFound')}
          description={t('budget.noBudgetsDescription')}
          actionLabel={t('budget.createNewBudget')}
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
