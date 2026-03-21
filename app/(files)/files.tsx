import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { usePrefsStore } from "@/stores/prefsStore";
import { getServerInfo } from "@/services/serverInfo";
import { resetAllStores } from "@/stores/resetStores";
import { resetSyncState, clearSwitchingFlag } from "@/sync";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import {
  Text,
  Card,
  SectionHeader,
  Banner,
  ErrorBanner,
  EmptyState,
  BudgetFileRow,
  BudgetOpeningOverlay,
  SwipeableRow,
} from "@/presentation/components";
import { useBudgetFiles, fileKey } from "@/presentation/hooks/useBudgetFiles";
import { useFileActionSheet } from "@/presentation/hooks/useFileActionSheet";
import type { ReconciledBudgetFile } from "@/services/budgetfiles";
import type { Theme } from "@/theme";

export default function FilesScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { clearAll } = usePrefsStore();
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation("common");
  const {
    localFiles,
    remoteFiles,
    loading,
    refreshing,
    error,
    selecting,
    actionInProgress,
    selectFile,
    deleteFile,
    uploadFile,
    convertToLocal,
    reRegister,
    retry,
    refresh,
    dismissError,
  } = useBudgetFiles();

  const [switchingName, setSwitchingName] = useState<string | null>(null);
  const [switchPhase, setSwitchPhase] = useState<"downloading" | "opening" | null>(null);

  const { showActions } = useFileActionSheet({
    uploadFile,
    deleteFile,
    selectFile,
    convertToLocal,
    reRegister,
  });

  useEffect(() => {
    const serverUrl = usePrefsStore.getState().serverUrl;
    if (serverUrl) {
      getServerInfo(serverUrl).then((info) => {
        usePrefsStore.getState().setServerVersion(info.version);
      });
    }
  }, []);

  const hasDetached = localFiles.some((f) => f.state === "detached");

  async function handleSelect(file: ReconciledBudgetFile) {
    setSwitchingName(file.name);
    setSwitchPhase(file.state === "remote" ? "downloading" : "opening");
    try {
      await selectFile(file);
      // Navigation is handled automatically by Stack.Protected guard
      // when isConfigured changes to true in openBudget → setPrefs
    } catch {
      setSwitchingName(null);
      setSwitchPhase(null);
      // Error already set in hook
    }
  }

  function handleDelete(file: ReconciledBudgetFile) {
    confirmDelete(
      file,
      (fromServer) => {
        deleteFile(file, fromServer).catch(() => {});
      },
      t as any,
      tc as any,
    );
  }

  function handleUpload(file: ReconciledBudgetFile) {
    const name = file.name || t("unnamedBudget");
    Alert.alert(t("uploadToServer"), t("uploadBudgetConfirm", { name }), [
      { text: tc("cancel"), style: "cancel" },
      { text: tc("upload"), onPress: () => uploadFile(file).catch(() => {}) },
    ]);
  }

  function handleLogout() {
    Alert.alert(t("logOut"), t("logOutMessage"), [
      { text: tc("cancel"), style: "cancel" },
      {
        text: t("logOut"),
        style: "destructive",
        onPress: async () => {
          resetSyncState();
          resetAllStores();
          await clearAll();
          clearSwitchingFlag();
          router.replace("/");
        },
      },
    ]);
  }

  const hasFiles = localFiles.length > 0 || remoteFiles.length > 0;

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
      >
        <Stack.Screen options={{}} />

        <View style={{ marginTop: spacing.md }}>
          <ErrorBanner error={error} onDismiss={dismissError} />
        </View>

        {loading ? (
          <Card style={{ marginTop: spacing.lg }}>
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text variant="bodySm" color={colors.textMuted}>
                {tc("loading")}
              </Text>
            </View>
          </Card>
        ) : hasFiles ? (
          <>
            {localFiles.length > 0 && (
              <>
                <SectionHeader
                  title={t("onThisDevice")}
                  style={{ marginTop: spacing.lg, paddingHorizontal: 0 }}
                />
                {hasDetached && (
                  <View style={{ marginBottom: spacing.sm }}>
                    <Banner message={t("detachedHint")} variant="warning" />
                  </View>
                )}
                <Card style={styles.listCard}>
                  {localFiles.map((file, index) => (
                    <SwipeableRow
                      key={fileKey(file)}
                      onDelete={() => handleDelete(file)}
                      onSwipeRight={file.state === "local" ? () => handleUpload(file) : undefined}
                      swipeRightIcon="cloudUploadOutline"
                      swipeRightColor={colors.primary}
                      isFirst={index === 0}
                      isLast={index === localFiles.length - 1}
                    >
                      <BudgetFileRow
                        file={file}
                        isSelecting={selecting === fileKey(file)}
                        isActionInProgress={actionInProgress === fileKey(file)}
                        onPress={() => handleSelect(file)}
                        onActionPress={() => showActions(file)}
                        showSeparator={index < localFiles.length - 1}
                      />
                    </SwipeableRow>
                  ))}
                </Card>
              </>
            )}

            {remoteFiles.length > 0 && (
              <>
                <SectionHeader
                  title={t("availableOnServer")}
                  style={{ marginTop: spacing.lg, paddingHorizontal: 0 }}
                />
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
                        onActionPress={() => showActions(file)}
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
            icon="folderOpenOutline"
            title={t("noBudgetsFound")}
            description={t("noBudgetsDescription")}
            actionLabel={t("createNewBudget")}
            onAction={() => router.push("/(files)/new-budget")}
          />
        )}
      </ScrollView>

      {!selecting && (
        <>
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Button onPress={handleLogout}>{t("logOut")}</Stack.Toolbar.Button>
          </Stack.Toolbar>
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button onPress={() => router.push("/(files)/new-budget")}>
              {t("new")}
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
        </>
      )}

      <BudgetOpeningOverlay
        visible={selecting !== null}
        phase={switchPhase ?? "opening"}
        budgetName={switchingName}
      />
    </>
  );
}

function confirmDelete(
  file: ReconciledBudgetFile,
  onDelete: (fromServer?: boolean) => void,
  t: (key: string, opts?: Record<string, string>) => string,
  tc: (key: string) => string,
) {
  const name = file.name || t("unnamedBudget");

  if (file.state === "synced") {
    Alert.alert(t("deleteBudget"), t("deleteBudgetSynced", { name }), [
      { text: tc("cancel"), style: "cancel" },
      { text: t("deleteLocally"), onPress: () => onDelete(false) },
      { text: t("deleteFromAllDevices"), style: "destructive", onPress: () => onDelete(true) },
    ]);
  } else if (file.state === "remote") {
    Alert.alert(t("deleteBudget"), t("deleteBudgetFromServer", { name }), [
      { text: tc("cancel"), style: "cancel" },
      { text: t("deleteFromServer"), style: "destructive", onPress: () => onDelete(true) },
    ]);
  } else {
    Alert.alert(t("deleteBudget"), t("deleteBudgetLocal", { name }), [
      { text: tc("cancel"), style: "cancel" },
      { text: tc("delete"), style: "destructive", onPress: () => onDelete(false) },
    ]);
  }
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
    paddingHorizontal: theme.spacing.lg,
  },
  listCard: {
    padding: 0,
    overflow: "hidden" as const,
  },
  loadingRow: {
    paddingVertical: theme.spacing.xl,
    alignItems: "center" as const,
    gap: theme.spacing.md,
  },
  headerBtn: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
});
