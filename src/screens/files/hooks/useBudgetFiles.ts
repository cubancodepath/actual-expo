import { useEffect, useState, useCallback, useRef } from "react";
import { ActualError, emitErrorEvent } from "@/core/errors";
import { useSessionStore } from "@/stores/sessionStore";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import { logout } from "@/services/authService";
import { listRemoteBudgetFiles } from "@/services/api/budgetFiles.api";
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
import { clearSwitchingFlag } from "@/core/sync";
import * as encryption from "@/core/encryption";
import { loadKeyForBudget } from "@/services/encryptionService";
import { promptForPassword } from "@/design-system/molecules/EncryptionPasswordPrompt";

type UseBudgetFilesReturn = {
  /** Files on this device (local, synced, detached) */
  localFiles: ReconciledBudgetFile[];
  /** Files only on server (remote) */
  remoteFiles: ReconciledBudgetFile[];
  /** True during initial load */
  loading: boolean;
  /** True during pull-to-refresh */
  refreshing: boolean;
  /** Set only when the list itself fails to load — shown inline on the screen. */
  listError: unknown;
  /** Key of file currently being selected/downloaded */
  selecting: string | null;
  /**
   * Per-row actions. Failures are emitted to the error bus (log-only for
   * now) instead of a shared error state — there's no good inline placement
   * for "which row's action failed" beyond the list-level banner `listError`.
   */
  selectFile: (file: ReconciledBudgetFile) => Promise<void>;
  /** Delete a file locally and/or from server */
  deleteFile: (file: ReconciledBudgetFile, fromServer?: boolean) => Promise<void>;
  /** Upload a local-only file to the server */
  uploadFile: (file: ReconciledBudgetFile) => Promise<void>;
  /** Convert a detached/synced file to local-only */
  convertToLocal: (file: ReconciledBudgetFile) => Promise<void>;
  /** Re-register a detached file as a new server file */
  reRegister: (file: ReconciledBudgetFile) => Promise<void>;
  /** Key of file currently having an action performed on it */
  actionInProgress: string | null;
  retry: () => void;
  refresh: () => void;
  dismissError: () => void;
};

export function fileKey(file: ReconciledBudgetFile): string {
  return file.localId ?? file.cloudFileId ?? file.name;
}

export function useBudgetFiles(): UseBudgetFilesReturn {
  const { serverUrl, token } = useSessionStore();
  const [files, setFiles] = useState<ReconciledBudgetFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<unknown>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchFiles = useCallback(async () => {
    const [local, remote] = await Promise.all([
      listLocalBudgets(),
      listRemoteBudgetFiles(serverUrl, token).catch((e: unknown) => {
        // Expired session → full logout; the root guard redirects to login
        if (e instanceof ActualError && e.code === "auth/token-expired") {
          void logout();
        }
        return [];
      }),
    ]);
    return reconcileFiles(local, remote);
  }, [serverUrl, token]);

  const loadFiles = useCallback(() => {
    setLoading(true);
    setListError(null);
    fetchFiles()
      .then((f) => {
        if (isMounted.current) setFiles(f);
      })
      .catch((e) => {
        emitErrorEvent(e);
        if (isMounted.current) setListError(e);
      })
      .finally(() => {
        if (isMounted.current) setLoading(false);
      });
  }, [fetchFiles]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const refreshFiles = useCallback(() => {
    setRefreshing(true);
    setListError(null);
    fetchFiles()
      .then((f) => {
        if (isMounted.current) setFiles(f);
      })
      .catch((e) => {
        emitErrorEvent(e);
        if (isMounted.current) setListError(e);
      })
      .finally(() => {
        if (isMounted.current) setRefreshing(false);
      });
  }, [fetchFiles]);

  const selectFile = useCallback(
    async (file: ReconciledBudgetFile) => {
      // If encrypted, ensure the key is available before switching
      if (file.encryptKeyId && file.cloudFileId) {
        if (!encryption.hasKey(file.encryptKeyId)) {
          // Try loading from SecureStore first
          const loaded = await loadKeyForBudget(file.cloudFileId);
          if (!loaded) {
            // Prompt user for password
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
        emitErrorEvent(e);
        if (isMounted.current) setSelecting(null);
        throw e;
      }
    },
    [serverUrl, token],
  );

  const handleDeleteFile = useCallback(
    async (file: ReconciledBudgetFile, fromServer?: boolean) => {
      try {
        if (fromServer && file.cloudFileId) {
          await deleteFromServer(serverUrl, token, file.cloudFileId);
        }
        if (file.localId) {
          await deleteBudget(file.localId);
        }
        // Refresh list after delete
        const updated = await fetchFiles();
        if (isMounted.current) setFiles(updated);
      } catch (e: unknown) {
        emitErrorEvent(e);
        throw e;
      }
    },
    [serverUrl, token, fetchFiles],
  );

  const handleUploadFile = useCallback(
    async (file: ReconciledBudgetFile) => {
      if (!file.localId) throw new Error("No local ID to upload");
      try {
        // Need the budget DB open to read the file
        const { activeBudgetId } = useBudgetContextStore.getState();
        const needsOpen = activeBudgetId !== file.localId;
        if (needsOpen) {
          await openBudget(file.localId);
        }
        const { cloudFileId, groupId } = await uploadBudget(serverUrl, token, file.localId);
        // Update prefs if this is the active budget
        if (useBudgetContextStore.getState().activeBudgetId === file.localId) {
          useBudgetContextStore.getState().setBudgetContext({
            fileId: cloudFileId,
            groupId,
            isLocalOnly: false,
          });
        }
        // Refresh list to show updated state
        const updated = await fetchFiles();
        if (isMounted.current) setFiles(updated);
      } catch (e: unknown) {
        emitErrorEvent(e);
        throw e;
      }
    },
    [serverUrl, token, fetchFiles],
  );

  const handleConvertToLocal = useCallback(
    async (file: ReconciledBudgetFile) => {
      if (!file.localId) throw new Error("No local ID");
      const key = fileKey(file);
      setActionInProgress(key);
      try {
        await convertToLocalOnly(file.localId);
        // Update prefs if this is the active budget
        if (useBudgetContextStore.getState().activeBudgetId === file.localId) {
          useBudgetContextStore.getState().setBudgetContext({
            fileId: "",
            groupId: "",
            isLocalOnly: true,
          });
        }
        const updated = await fetchFiles();
        if (isMounted.current) setFiles(updated);
      } catch (e: unknown) {
        emitErrorEvent(e);
        throw e;
      } finally {
        if (isMounted.current) setActionInProgress(null);
      }
    },
    [fetchFiles],
  );

  const handleReRegister = useCallback(
    async (file: ReconciledBudgetFile) => {
      if (!file.localId) throw new Error("No local ID");
      const key = fileKey(file);
      setActionInProgress(key);
      try {
        const { activeBudgetId } = useBudgetContextStore.getState();
        const needsOpen = activeBudgetId !== file.localId;
        if (needsOpen) {
          await openBudget(file.localId);
        }
        const { cloudFileId, groupId } = await reRegisterBudget(serverUrl, token, file.localId);
        // Update prefs if this is the active budget
        if (useBudgetContextStore.getState().activeBudgetId === file.localId) {
          useBudgetContextStore.getState().setBudgetContext({
            fileId: cloudFileId,
            groupId,
            isLocalOnly: false,
          });
        }
        const updated = await fetchFiles();
        if (isMounted.current) setFiles(updated);
      } catch (e: unknown) {
        emitErrorEvent(e);
        throw e;
      } finally {
        if (isMounted.current) setActionInProgress(null);
      }
    },
    [serverUrl, token, fetchFiles],
  );

  const localFiles = files.filter((f) => f.state !== "remote");
  const remoteFiles = files.filter((f) => f.state === "remote");

  return {
    localFiles,
    remoteFiles,
    loading,
    refreshing,
    listError,
    selecting,
    actionInProgress,
    selectFile,
    deleteFile: handleDeleteFile,
    uploadFile: handleUploadFile,
    convertToLocal: handleConvertToLocal,
    reRegister: handleReRegister,
    retry: loadFiles,
    refresh: refreshFiles,
    dismissError: () => setListError(null),
  };
}
