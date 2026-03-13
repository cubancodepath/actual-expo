import { useEffect, useState, useCallback, useRef } from 'react';
import { usePrefsStore } from '../../stores/prefsStore';
import { listFiles } from '../../services/authService';
import { listLocalBudgets } from '../../services/budgetMetadata';
import {
  type ReconciledBudgetFile,
  reconcileFiles,
  switchBudget,
  deleteBudget,
  deleteFromServer,
  uploadBudget,
} from '../../services/budgetfiles';
import { openBudget } from '../../services/budgetfiles';
import { clearSwitchingFlag } from '../../sync';
import * as encryption from '../../encryption';
import { loadKeyForBudget } from '../../services/encryptionService';
import { promptForPassword } from '../components/molecules/EncryptionPasswordPrompt';

type UseBudgetFilesReturn = {
  /** Files on this device (local, synced, detached) */
  localFiles: ReconciledBudgetFile[];
  /** Files only on server (remote) */
  remoteFiles: ReconciledBudgetFile[];
  /** True during initial load */
  loading: boolean;
  /** True during pull-to-refresh */
  refreshing: boolean;
  error: string | null;
  /** Key of file currently being selected/downloaded */
  selecting: string | null;
  selectFile: (file: ReconciledBudgetFile) => Promise<void>;
  /** Delete a file locally and/or from server */
  deleteFile: (file: ReconciledBudgetFile, fromServer?: boolean) => Promise<void>;
  /** Upload a local-only file to the server */
  uploadFile: (file: ReconciledBudgetFile) => Promise<void>;
  retry: () => void;
  refresh: () => void;
  dismissError: () => void;
};

export function fileKey(file: ReconciledBudgetFile): string {
  return file.localId ?? file.cloudFileId ?? file.name;
}

export function useBudgetFiles(): UseBudgetFilesReturn {
  const { serverUrl, token } = usePrefsStore();
  const [files, setFiles] = useState<ReconciledBudgetFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const fetchFiles = useCallback(async () => {
    const [local, remote] = await Promise.all([
      listLocalBudgets(),
      listFiles(serverUrl, token).catch(() => []),
    ]);
    return reconcileFiles(local, remote);
  }, [serverUrl, token]);

  const loadFiles = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchFiles()
      .then(f => { if (isMounted.current) setFiles(f); })
      .catch(e => { if (isMounted.current) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (isMounted.current) setLoading(false); });
  }, [fetchFiles]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const refreshFiles = useCallback(() => {
    setRefreshing(true);
    setError(null);
    fetchFiles()
      .then(f => { if (isMounted.current) setFiles(f); })
      .catch(e => { if (isMounted.current) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (isMounted.current) setRefreshing(false); });
  }, [fetchFiles]);

  const selectFile = useCallback(async (file: ReconciledBudgetFile) => {
    // If encrypted, ensure the key is available before switching
    if (file.encryptKeyId && file.cloudFileId) {
      if (!encryption.hasKey(file.encryptKeyId)) {
        // Try loading from SecureStore first
        const loaded = await loadKeyForBudget(file.cloudFileId);
        if (!loaded) {
          // Prompt user for password
          const result = await promptForPassword(file.cloudFileId);
          if (result === 'cancelled') return;
        }
      }
    }

    setSelecting(fileKey(file));
    try {
      await switchBudget(file, serverUrl, token);
    } catch (e: unknown) {
      clearSwitchingFlag();
      if (isMounted.current) {
        setError(e instanceof Error ? e.message : String(e));
        setSelecting(null);
      }
      throw e;
    }
  }, [serverUrl, token]);

  const handleDeleteFile = useCallback(async (file: ReconciledBudgetFile, fromServer?: boolean) => {
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
      if (isMounted.current) {
        setError(e instanceof Error ? e.message : String(e));
      }
      throw e;
    }
  }, [serverUrl, token, fetchFiles]);

  const handleUploadFile = useCallback(async (file: ReconciledBudgetFile) => {
    if (!file.localId) throw new Error('No local ID to upload');
    try {
      // Need the budget DB open to read the file
      const { activeBudgetId } = usePrefsStore.getState();
      const needsOpen = activeBudgetId !== file.localId;
      if (needsOpen) {
        await openBudget(file.localId);
      }
      await uploadBudget(serverUrl, token, file.localId);
      // Refresh list to show updated state
      const updated = await fetchFiles();
      if (isMounted.current) setFiles(updated);
    } catch (e: unknown) {
      if (isMounted.current) {
        setError(e instanceof Error ? e.message : String(e));
      }
      throw e;
    }
  }, [serverUrl, token, fetchFiles]);

  const localFiles = files.filter(f => f.state !== 'remote');
  const remoteFiles = files.filter(f => f.state === 'remote');

  return {
    localFiles,
    remoteFiles,
    loading,
    refreshing,
    error,
    selecting,
    selectFile,
    deleteFile: handleDeleteFile,
    uploadFile: handleUploadFile,
    retry: loadFiles,
    refresh: refreshFiles,
    dismissError: () => setError(null),
  };
}
