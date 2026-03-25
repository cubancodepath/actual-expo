import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert as RNAlert } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { usePrefsStore } from "@/stores/prefsStore";
import { getServerInfo } from "@/services/serverInfo";
import { resetAllStores } from "@/stores/resetStores";
import { resetSyncState, clearSwitchingFlag } from "@core/sync";
import { useBudgetFiles, fileKey } from "./useBudgetFiles";
import { useFileActionSheet } from "@/presentation/hooks/useFileActionSheet";
import type { ReconciledBudgetFile } from "@/services/budgetfiles";

export { fileKey };

export function useBudgetPicker() {
  const router = useRouter();
  const { clearAll } = usePrefsStore();
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation("common");

  const budget = useBudgetFiles();
  const { showActions } = useFileActionSheet({
    uploadFile: budget.uploadFile,
    deleteFile: budget.deleteFile,
    selectFile: budget.selectFile,
    convertToLocal: budget.convertToLocal,
    reRegister: budget.reRegister,
  });

  const [overlay, setOverlay] = useState<{ name: string; phase: "downloading" | "opening" } | null>(
    null,
  );

  useEffect(() => {
    const serverUrl = usePrefsStore.getState().serverUrl;
    if (serverUrl) {
      getServerInfo(serverUrl)
        .then((info) => usePrefsStore.getState().setServerVersion(info.version))
        .catch(() => {});
    }
  }, []);

  const hasFiles = useMemo(
    () => budget.localFiles.length > 0 || budget.remoteFiles.length > 0,
    [budget.localFiles, budget.remoteFiles],
  );

  const hasDetached = useMemo(
    () => budget.localFiles.some((f) => f.state === "detached"),
    [budget.localFiles],
  );

  const handleSelect = useCallback(
    async (file: ReconciledBudgetFile) => {
      setOverlay({ name: file.name, phase: file.state === "remote" ? "downloading" : "opening" });
      try {
        await budget.selectFile(file);
      } catch {
        setOverlay(null);
      }
    },
    [budget.selectFile],
  );

  const handleDelete = useCallback(
    (file: ReconciledBudgetFile) => {
      const name = file.name || t("unnamedBudget");

      if (file.state === "synced") {
        RNAlert.alert(t("deleteBudget"), t("deleteBudgetSynced", { name }), [
          { text: tc("cancel"), style: "cancel" },
          {
            text: t("deleteLocally"),
            onPress: () => budget.deleteFile(file, false).catch(() => {}),
          },
          {
            text: t("deleteFromAllDevices"),
            style: "destructive",
            onPress: () => budget.deleteFile(file, true).catch(() => {}),
          },
        ]);
      } else if (file.state === "remote") {
        RNAlert.alert(t("deleteBudget"), t("deleteBudgetFromServer", { name }), [
          { text: tc("cancel"), style: "cancel" },
          {
            text: t("deleteFromServer"),
            style: "destructive",
            onPress: () => budget.deleteFile(file, true).catch(() => {}),
          },
        ]);
      } else {
        RNAlert.alert(t("deleteBudget"), t("deleteBudgetLocal", { name }), [
          { text: tc("cancel"), style: "cancel" },
          {
            text: tc("delete"),
            style: "destructive",
            onPress: () => budget.deleteFile(file, false).catch(() => {}),
          },
        ]);
      }
    },
    [budget.deleteFile, t, tc],
  );

  const handleUpload = useCallback(
    (file: ReconciledBudgetFile) => {
      const name = file.name || t("unnamedBudget");
      RNAlert.alert(t("uploadToServer"), t("uploadBudgetConfirm", { name }), [
        { text: tc("cancel"), style: "cancel" },
        { text: tc("upload"), onPress: () => budget.uploadFile(file).catch(() => {}) },
      ]);
    },
    [budget.uploadFile, t, tc],
  );

  const handleLogout = useCallback(async () => {
    RNAlert.alert(t("logOut"), t("logOutMessage"), [
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
  }, [clearAll, router, t, tc]);

  const handleNew = useCallback(() => {
    router.push("/(files)/new-budget");
  }, [router]);

  return {
    localFiles: budget.localFiles,
    remoteFiles: budget.remoteFiles,
    loading: budget.loading,
    refreshing: budget.refreshing,
    error: budget.error,
    selecting: budget.selecting,
    actionInProgress: budget.actionInProgress,
    hasFiles,
    hasDetached,
    overlay,
    handleSelect,
    handleDelete,
    handleUpload,
    handleLogout,
    handleNew,
    showActions,
    refresh: budget.refresh,
    dismissError: budget.dismissError,
  };
}
