import { useEffect, useState, useCallback, useRef } from 'react';
import { usePrefsStore } from '../../stores/prefsStore';
import { listFiles } from '../../services/authService';
import { listLocalBudgets } from '../../services/budgetMetadata';
import {
  type ReconciledBudgetFile,
  reconcileFiles,
  switchBudget,
} from '../../services/budgetfiles';
import { clearSwitchingFlag } from '../../sync';

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
    retry: loadFiles,
    refresh: refreshFiles,
    dismissError: () => setError(null),
  };
}
