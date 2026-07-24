import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActualError } from "@/core/errors";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import { useSessionStore } from "@/stores/sessionStore";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import {
  loadBudget,
  closeAndLoadBudget,
  closeAndDownloadBudget,
  deleteBudget,
} from "@/stores/operations/budgetfiles";
import { signOut } from "@/stores/operations/users";
import { getRemoteFiles, removeFile, uploadBudget } from "@/core/server/cloud-storage";
import { getBudgets, loadPrefs, getPrefs } from "@/core/server/prefs";
import {
  type ReconciledBudgetFile,
  reconcileFiles,
  convertToLocalOnly,
  reRegisterBudget,
} from "@/core/server/budgetfiles/app";
import { clearSwitchingFlag, setSyncingMode } from "@/core/sync";
import { promptForPassword } from "@/ui/feedback/EncryptionPasswordPrompt";

const QUERY_KEY = ["budgetFiles"] as const;

export function fileKey(file: ReconciledBudgetFile): string {
  return file.localId ?? file.cloudFileId ?? file.name;
}

export type SwitchingState = {
  key: string;
} | null;

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
  /** File currently being switched to (drives the row spinner + opening overlay). */
  switching: SwitchingState;
  /** Key of file currently having an action performed on it */
  actionInProgress: string | null;
  /**
   * Opens a budget file (prompting for the encryption password if needed).
   * Resolves true when the budget was switched, false on cancel/failure —
   * failures are already emitted to the error bus.
   */
  selectFile: (file: ReconciledBudgetFile) => Promise<boolean>;
  /**
   * Per-row actions. Fire-and-forget mutations: errors are emitted to the
   * error bus by the global MutationCache, and the list refetches on settle.
   */
  deleteFile: (file: ReconciledBudgetFile, fromServer?: boolean) => void;
  uploadFile: (file: ReconciledBudgetFile) => void;
  convertToLocal: (file: ReconciledBudgetFile) => void;
  reRegister: (file: ReconciledBudgetFile) => void;
  refresh: () => void;
  dismissError: () => void;
};

export function useBudgetFiles(): UseBudgetFilesReturn {
  const { serverUrl, token } = useSessionStore();
  const queryClient = useQueryClient();
  const [switching, setSwitching] = useState<SwitchingState>(null);
  const [errorDismissed, setErrorDismissed] = useState(false);

  const query = useQuery({
    queryKey: [...QUERY_KEY, serverUrl, token],
    queryFn: async () => {
      const [local, remote] = await Promise.all([
        getBudgets(),
        getRemoteFiles(serverUrl, token).catch((e: unknown) => {
          // Expired session → full signOut; the root guard redirects to login.
          // Direct call (not the error-bus authPolicy): this catch SWALLOWS the
          // error to return [], so it never reaches react-query's onError or
          // the bus — this is the only place that can react to it here.
          if (e instanceof ActualError && e.code === "auth/token-expired") {
            void signOut();
          }
          return [];
        }),
      ]);
      return reconcileFiles(local, remote);
    },
  });

  const fileAction = useMutation({
    mutationFn: ({ run }: { file: ReconciledBudgetFile; run: () => Promise<void> }) => run(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const actionInProgress = fileAction.isPending ? fileKey(fileAction.variables.file) : null;

  function runAction(file: ReconciledBudgetFile, run: () => Promise<void>) {
    fileAction.mutate({ file, run });
  }

  /** Opens the budget DB when the file isn't the active one (upload/reRegister read it). */
  async function ensureBudgetOpen(localId: string) {
    if (useBudgetContextStore.getState().activeBudgetId !== localId) {
      await loadBudget(localId);
    }
  }

  /** Applies a budget-context patch only when the file is the active budget. */
  async function updateContextIfActive(
    localId: string,
    patch: Parameters<ReturnType<typeof useBudgetContextStore.getState>["setBudgetContext"]>[0],
  ) {
    const store = useBudgetContextStore.getState();
    if (store.activeBudgetId === localId) {
      store.setBudgetContext(patch);
      // The cloud coordinates just changed on disk — refresh core's prefs
      // snapshot and the syncing mode so the sync engine sees the new state
      // without a budget reopen (offline = no cloud target, upstream main.ts).
      await loadPrefs(localId);
      const prefs = getPrefs();
      setSyncingMode(prefs?.cloudFileId && prefs?.groupId ? "enabled" : "offline");
    }
  }

  async function selectFile(file: ReconciledBudgetFile): Promise<boolean> {
    setSwitching({ key: fileKey(file) });

    // Mirror upstream BudgetFileSelection.onSelect: remote → download+load,
    // otherwise load the local file (loadBudget self-closes the previous one).
    const doSwitch = () =>
      file.state === "remote"
        ? closeAndDownloadBudget(file, serverUrl, token)
        : file.localId
          ? closeAndLoadBudget(file.localId)
          : Promise.reject(
              new ActualError("file/switch-failed", {
                context: { reason: "no local ID available" },
              }),
            );

    try {
      await doSwitch();
      return true;
    } catch (e: unknown) {
      // Reactive unlock (upstream parity): a missing/incorrect key surfaces as
      // sync/key-missing | sync/decrypt-failure from downloadBudget. Prompt for
      // the password (copy varies by whether a key already existed) and retry once.
      if (
        file.cloudFileId &&
        e instanceof ActualError &&
        (e.code === "sync/key-missing" || e.code === "sync/decrypt-failure")
      ) {
        clearSwitchingFlag();
        const result = await promptForPassword(file.cloudFileId, e.code === "sync/decrypt-failure");
        if (result !== "cancelled") {
          try {
            await doSwitch();
            return true;
          } catch (retryErr: unknown) {
            emitErrorEvent(retryErr);
          }
        }
        clearSwitchingFlag();
        setSwitching(null);
        return false;
      }
      clearSwitchingFlag();
      emitErrorEvent(e);
      setSwitching(null);
      return false;
    }
  }

  return {
    localFiles: (query.data ?? []).filter((f) => f.state !== "remote"),
    remoteFiles: (query.data ?? []).filter((f) => f.state === "remote"),
    loading: query.isLoading,
    refreshing: query.isRefetching,
    listError: errorDismissed ? null : query.error,
    switching,
    actionInProgress,

    selectFile,

    deleteFile: (file, fromServer) =>
      runAction(file, async () => {
        if (fromServer && file.cloudFileId) {
          await removeFile(serverUrl, token, file.cloudFileId);
        }
        if (file.localId) {
          await deleteBudget(file.localId);
        }
      }),

    uploadFile: (file) =>
      runAction(file, async () => {
        if (!file.localId) throw new Error("No local ID to upload");
        await ensureBudgetOpen(file.localId);
        const { cloudFileId, groupId } = await uploadBudget(serverUrl, token, file.localId);
        await updateContextIfActive(file.localId, {
          fileId: cloudFileId,
          groupId,
          isLocalOnly: false,
        });
      }),

    convertToLocal: (file) =>
      runAction(file, async () => {
        if (!file.localId) throw new Error("No local ID");
        await convertToLocalOnly(file.localId);
        await updateContextIfActive(file.localId, { fileId: "", groupId: "", isLocalOnly: true });
      }),

    reRegister: (file) =>
      runAction(file, async () => {
        if (!file.localId) throw new Error("No local ID");
        await ensureBudgetOpen(file.localId);
        const { cloudFileId, groupId } = await reRegisterBudget(serverUrl, token, file.localId);
        await updateContextIfActive(file.localId, {
          fileId: cloudFileId,
          groupId,
          isLocalOnly: false,
        });
      }),

    refresh: () => {
      setErrorDismissed(false);
      void query.refetch();
    },
    dismissError: () => setErrorDismissed(true),
  };
}
