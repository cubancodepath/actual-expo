import { useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePrefsStore } from "@/stores/prefsStore";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import {
  Text,
  Card,
  SectionHeader,
  ErrorBanner,
  EmptyState,
  BudgetFileRow,
  BudgetOpeningOverlay,
} from "@/presentation/components";
import { useBudgetFiles, fileKey } from "@/presentation/hooks/useBudgetFiles";
import type { ReconciledBudgetFile } from "@/services/budgetfiles";
import type { Theme } from "@/theme";

type SwitchPhase = "downloading" | "opening" | null;

export default function ChangeBudgetScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { activeBudgetId } = usePrefsStore();
  const [switchingName, setSwitchingName] = useState<string | null>(null);
  const [switchPhase, setSwitchPhase] = useState<SwitchPhase>(null);
  const {
    localFiles,
    remoteFiles,
    loading,
    refreshing,
    error,
    selecting,
    selectFile,
    retry,
    refresh,
    dismissError,
  } = useBudgetFiles();

  async function handleSelect(file: ReconciledBudgetFile) {
    if (file.localId && file.localId === activeBudgetId) {
      router.back();
      return;
    }
    setSwitchingName(file.name);
    setSwitchPhase(file.state === "remote" ? "downloading" : "opening");
    try {
      await selectFile(file);
      router.dismissAll();
    } catch {
      setSwitchingName(null);
      setSwitchPhase(null);
    }
  }

  const hasFiles = localFiles.length > 0 || remoteFiles.length > 0;
  const isSwitching = selecting !== null;

  const phaseLabel =
    switchPhase === "downloading"
      ? t("budget.downloading")
      : switchPhase === "opening"
        ? t("budget.opening")
        : t("budget.opening");

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        scrollEnabled={!isSwitching}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
            enabled={!isSwitching}
          />
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
                {t("loading")}
              </Text>
            </View>
          </Card>
        ) : hasFiles ? (
          <>
            {localFiles.length > 0 && (
              <>
                <SectionHeader title={t("budget.onThisDevice")} style={{ marginTop: spacing.lg }} />
                <Card style={styles.listCard}>
                  {localFiles.map((file, index) => (
                    <BudgetFileRow
                      key={fileKey(file)}
                      file={file}
                      isActive={!isSwitching && file.localId === activeBudgetId}
                      isSelecting={false}
                      onPress={() => handleSelect(file)}
                      showSeparator={index < localFiles.length - 1}
                    />
                  ))}
                </Card>
              </>
            )}

            {remoteFiles.length > 0 && (
              <>
                <SectionHeader
                  title={t("budget.availableOnServer")}
                  style={{ marginTop: spacing.lg }}
                />
                <Card style={styles.listCard}>
                  {remoteFiles.map((file, index) => (
                    <BudgetFileRow
                      key={fileKey(file)}
                      file={file}
                      isSelecting={false}
                      onPress={() => handleSelect(file)}
                      showSeparator={index < remoteFiles.length - 1}
                    />
                  ))}
                </Card>
              </>
            )}
          </>
        ) : (
          <EmptyState
            icon="folderOpenOutline"
            title={t("budget.noBudgetsFound")}
            description={t("budget.noBudgetsDescription")}
            actionLabel={t("budget.createNewBudget")}
            onAction={() => router.push("/(auth)/new-budget")}
          />
        )}
      </ScrollView>

      {/* Toolbar — hidden during switch to prevent navigation */}
      {!isSwitching && (
        <>
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Button icon="xmark" onPress={() => router.back()} />
          </Stack.Toolbar>
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button onPress={() => router.push("/(auth)/new-budget")}>
              {t("new")}
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
        </>
      )}

      <BudgetOpeningOverlay
        visible={isSwitching}
        phase={switchPhase ?? "opening"}
        budgetName={switchingName}
      />
    </>
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
    overflow: "hidden" as const,
  },
  loadingRow: {
    paddingVertical: theme.spacing.xl,
    alignItems: "center" as const,
    gap: theme.spacing.md,
  },
});
