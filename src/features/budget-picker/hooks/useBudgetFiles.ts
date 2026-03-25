import { useCallback, useEffect, useMemo, useState } from "react";
import { toAppError, type AppError } from "@/errors";
import { usePrefsStore } from "@/stores/prefsStore";
import { listFiles } from "@/services/authService";
import { listLocalBudgets } from "@/services/budgetMetadata";
import {
  type ReconciledBudgetFile,
  reconcileFiles,
  switchBudget,
  deleteBudget,
  deleteFromServer,
  uploadBudget,
  openBudget,
  convertToLocalOnly,
  reRegisterBudget,
} from "@/services/budgetfiles";
import { clearSwitchingFlag } from "@core/sync";
import * as encryption from "@core/encryption";
import { loadKeyForBudget } from "@/services/encryptionService";
import { promptForPassword } from "@/presentation/components/molecules/EncryptionPasswordPrompt";

export function fileKey(file: ReconciledBudgetFile): string {
  return file.localId ?? file.cloudFileId ?? file.name;
}

export function useBudgetFiles() {
  const { serverUrl, token } = usePrefsStore();
  const [files, setFiles] = useState<ReconciledBudgetFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const fetchFiles = useCallback(async () => {
    const [local, remote] = await Promise.all([
      listLocalBudgets(),
      listFiles(serverUrl, token).catch(() => []),
    ]);
    return reconcileFiles(local, remote);
  }, [serverUrl, token]);

  const doFetch = useCallback(
    (setFlag: (v: boolean) => void) => {
      setFlag(true);
      setError(null);
      fetchFiles()
        .then((f) => setFiles(f))
        .catch((e) => setError(toAppError(e)))
        .finally(() => setFlag(false));
    },
    [fetchFiles],
  );

  useEffect(() => {
    doFetch(setLoading);
  }, [doFetch]);

  const selectFile = useCallback(
    async (file: ReconciledBudgetFile) => {
      if (file.encryptKeyId && file.cloudFileId) {
        if (!encryption.hasKey(file.encryptKeyId)) {
          const loaded = await loadKeyForBudget(file.cloudFileId);
          if (!loaded) {
            const result = await promptForPassword(file.cloudFileId);
            if (result === "cancelled") return;
          }
        }
      }

      setSelecting(fileKey(file));
      try {
        await switchBudget(file, serverUrl, token);
      } catch (e: unknown) {
        clearSwitchingFlag();
        setError(toAppError(e));
        setSelecting(null);
        throw e;
      }
    },
    [serverUrl, token],
  );

  const deleteFile = useCallback(
    async (file: ReconciledBudgetFile, fromServer?: boolean) => {
      try {
        if (fromServer && file.cloudFileId) {
          await deleteFromServer(serverUrl, token, file.cloudFileId);
        }
        if (file.localId) {
          await deleteBudget(file.localId);
        }
        const updated = await fetchFiles();
        setFiles(updated);
      } catch (e: unknown) {
        setError(toAppError(e));
        throw e;
      }
    },
    [serverUrl, token, fetchFiles],
  );

  const uploadFile = useCallback(
    async (file: ReconciledBudgetFile) => {
      if (!file.localId) throw new Error("No local ID to upload");
      try {
        const { activeBudgetId } = usePrefsStore.getState();
        if (activeBudgetId !== file.localId) {
          await openBudget(file.localId);
        }
        const { cloudFileId, groupId } = await uploadBudget(serverUrl, token, file.localId);
        if (usePrefsStore.getState().activeBudgetId === file.localId) {
          usePrefsStore.getState().setPrefs({ fileId: cloudFileId, groupId, isLocalOnly: false });
        }
        const updated = await fetchFiles();
        setFiles(updated);
      } catch (e: unknown) {
        setError(toAppError(e));
        throw e;
      }
    },
    [serverUrl, token, fetchFiles],
  );

  const convertToLocal = useCallback(
    async (file: ReconciledBudgetFile) => {
      if (!file.localId) throw new Error("No local ID");
      setActionInProgress(fileKey(file));
      try {
        await convertToLocalOnly(file.localId);
        if (usePrefsStore.getState().activeBudgetId === file.localId) {
          usePrefsStore.getState().setPrefs({ fileId: "", groupId: "", isLocalOnly: true });
        }
        const updated = await fetchFiles();
        setFiles(updated);
      } catch (e: unknown) {
        setError(toAppError(e));
        throw e;
      } finally {
        setActionInProgress(null);
      }
    },
    [fetchFiles],
  );

  const reRegister = useCallback(
    async (file: ReconciledBudgetFile) => {
      if (!file.localId) throw new Error("No local ID");
      setActionInProgress(fileKey(file));
      try {
        const { activeBudgetId } = usePrefsStore.getState();
        if (activeBudgetId !== file.localId) {
          await openBudget(file.localId);
        }
        const { cloudFileId, groupId } = await reRegisterBudget(serverUrl, token, file.localId);
        if (usePrefsStore.getState().activeBudgetId === file.localId) {
          usePrefsStore.getState().setPrefs({ fileId: cloudFileId, groupId, isLocalOnly: false });
        }
        const updated = await fetchFiles();
        setFiles(updated);
      } catch (e: unknown) {
        setError(toAppError(e));
        throw e;
      } finally {
        setActionInProgress(null);
      }
    },
    [serverUrl, token, fetchFiles],
  );

  const localFiles = useMemo(() => files.filter((f) => f.state !== "remote"), [files]);
  const remoteFiles = useMemo(() => files.filter((f) => f.state === "remote"), [files]);

  const retry = useCallback(() => doFetch(setLoading), [doFetch]);
  const refresh = useCallback(() => doFetch(setRefreshing), [doFetch]);
  const dismissError = useCallback(() => setError(null), []);

  return {
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
  };
}
