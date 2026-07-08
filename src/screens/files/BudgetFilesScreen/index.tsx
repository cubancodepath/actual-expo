import { useState } from "react";
import { Alert, RefreshControl, ScrollView, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { withUniwind } from "uniwind";
import { useTranslation } from "react-i18next";
import {
  Alert as HeroAlert,
  Button,
  LinkButton,
  Spinner,
  Typography,
  useThemeColor,
} from "heroui-native";
import { logout } from "@/services/authService";
import { resetAllStores } from "@/stores/resetStores";
import { resetSyncState, clearSwitchingFlag } from "@/core/sync";
import { SwipeableRow } from "@/design-system";
import { InlineError } from "@/ui/feedback/InlineError";
import { BudgetFileRow } from "@/ui/BudgetFileRow";
import { BudgetOpeningOverlay } from "@/screens/files/components/BudgetOpeningOverlay";
import { useBudgetFiles, fileKey } from "@/screens/files/hooks/useBudgetFiles";
import { useFileActionSheet } from "@/screens/files/hooks/useFileActionSheet";
import type { ReconciledBudgetFile } from "@/services/budgetfiles";

const StyledIonicons = withUniwind(Ionicons);

/** Post-login landing screen: pick, manage or create a budget file. */
export function BudgetFilesScreen() {
  const router = useRouter();
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation("common");
  const [background, foreground, accent] = useThemeColor(["background", "foreground", "accent"]);
  const {
    localFiles,
    remoteFiles,
    loading,
    refreshing,
    listError,
    selecting,
    actionInProgress,
    selectFile,
    deleteFile,
    uploadFile,
    convertToLocal,
    reRegister,
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

  const hasDetached = localFiles.some((f) => f.state === "detached");
  const hasFiles = localFiles.length > 0 || remoteFiles.length > 0;

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
          await logout();
          clearSwitchingFlag();
          router.replace("/");
        },
      },
    ]);
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: t("openBudget"),
          headerStyle: { backgroundColor: background },
          headerShadowVisible: false,
          headerTintColor: foreground,
          headerLeft: () => (
            <LinkButton size="sm" onPress={handleLogout}>
              <LinkButton.Label className="text-muted">{t("logOut")}</LinkButton.Label>
            </LinkButton>
          ),
          headerRight: () => (
            <LinkButton size="sm" onPress={() => router.push("/(files)/new-budget")}>
              <LinkButton.Label className="text-accent">{t("new")}</LinkButton.Label>
            </LinkButton>
          ),
        }}
      />

      <ScrollView
        className="flex-1 px-6"
        contentContainerClassName="pb-16"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={accent} />
        }
      >
        <View className="mt-3">
          <InlineError error={listError} onDismiss={dismissError} />
        </View>

        {loading ? (
          <View className="mt-4 items-center gap-3 rounded-2xl bg-surface py-8">
            <Spinner color={accent} />
            <Typography type="body-sm" color="muted">
              {tc("loading")}
            </Typography>
          </View>
        ) : hasFiles ? (
          <>
            {localFiles.length > 0 && (
              <>
                <Typography
                  type="body-xs"
                  weight="semibold"
                  color="muted"
                  className="uppercase tracking-wide mt-6 mb-2 ml-1"
                >
                  {t("onThisDevice")}
                </Typography>
                {hasDetached && (
                  <View className="mb-2">
                    <HeroAlert status="warning">
                      <HeroAlert.Indicator />
                      <HeroAlert.Content>
                        <HeroAlert.Description>{t("detachedHint")}</HeroAlert.Description>
                      </HeroAlert.Content>
                    </HeroAlert>
                  </View>
                )}
                <View className="overflow-hidden rounded-2xl bg-surface">
                  {localFiles.map((file, index) => (
                    <SwipeableRow
                      key={fileKey(file)}
                      onDelete={() => handleDelete(file)}
                      onSwipeRight={file.state === "local" ? () => handleUpload(file) : undefined}
                      swipeRightIcon="cloudUploadOutline"
                      swipeRightColor={accent}
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
                </View>
              </>
            )}

            {remoteFiles.length > 0 && (
              <>
                <Typography
                  type="body-xs"
                  weight="semibold"
                  color="muted"
                  className="uppercase tracking-wide mt-6 mb-2 ml-1"
                >
                  {t("availableOnServer")}
                </Typography>
                <View className="overflow-hidden rounded-2xl bg-surface">
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
                </View>
              </>
            )}
          </>
        ) : (
          <View className="items-center gap-2 pt-24">
            <StyledIonicons name="folder-open-outline" size={48} className="text-muted" />
            <Typography type="body" weight="semibold">
              {t("noBudgetsFound")}
            </Typography>
            <Typography type="body-sm" color="muted" className="text-center">
              {t("noBudgetsDescription")}
            </Typography>
            <Button
              variant="primary"
              className="mt-4"
              onPress={() => router.push("/(files)/new-budget")}
            >
              <Button.Label>{t("createNewBudget")}</Button.Label>
            </Button>
          </View>
        )}
      </ScrollView>

      <BudgetOpeningOverlay
        visible={selecting !== null}
        phase={switchPhase ?? "opening"}
        budgetName={switchingName}
      />
    </View>
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
