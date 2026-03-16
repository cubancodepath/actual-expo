import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePrefsStore } from "@/stores/prefsStore";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import {
  Text,
  Card,
  SectionHeader,
  IconButton,
  ErrorBanner,
  EmptyState,
  BudgetFileRow,
} from "@/presentation/components";
import { useBudgetFiles, fileKey } from "@/presentation/hooks/useBudgetFiles";
import type { ReconciledBudgetFile } from "@/services/budgetfiles";
import type { Theme } from "@/theme";

export default function ChangeBudgetScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { activeBudgetId } = usePrefsStore();
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
              onPress={() => router.push("/(auth)/new-budget")}
              hitSlop={8}
              style={styles.headerBtn}
            >
              <Text variant="body" style={{ fontWeight: "600" }}>
                {t("new")}
              </Text>
            </Pressable>
          ),
        }}
      />

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
                    isActive={file.localId === activeBudgetId}
                    isSelecting={selecting === fileKey(file)}
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
                    isSelecting={selecting === fileKey(file)}
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
          icon="folder-open-outline"
          title={t("budget.noBudgetsFound")}
          description={t("budget.noBudgetsDescription")}
          actionLabel={t("budget.createNewBudget")}
          onAction={() => router.push("/(auth)/new-budget")}
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
