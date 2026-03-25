import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert as RNAlert } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { usePrefsStore } from "@/stores/prefsStore";
import { getServerInfo } from "@/services/serverInfo";
import { resetAllStores } from "@/stores/resetStores";
import { resetSyncState, clearSwitchingFlag } from "@core/sync";
import { useBudgetFiles, fileKey } from "./useBudgetFiles";
import type { ReconciledBudgetFile } from "@/services/budgetfiles";

export { fileKey };

export function useBudgetPicker() {
  const router = useRouter();
  const { clearAll } = usePrefsStore();
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation("common");

  const budget = useBudgetFiles();

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
    handleLogout,
    handleNew,
    deleteFile: budget.deleteFile,
    uploadFile: budget.uploadFile,
    convertToLocal: budget.convertToLocal,
    reRegister: budget.reRegister,
    refresh: budget.refresh,
    dismissError: budget.dismissError,
  };
}
