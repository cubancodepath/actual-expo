import { create } from "zustand";
import { router } from "expo-router";
import { useBudgetContextStore } from "@/stores/budgetContextStore";

/**
 * Controller for the encryption-password flows (unlock / enable).
 *
 * The UI is a route form-sheet (`app/(auth)/encryption-password.tsx` →
 * `EncryptionPasswordScreen`), consistent with Hold/Reconcile. To keep the
 * promise-based callers working (e.g. `useBudgetFiles.selectFile` awaits
 * `promptForPassword`), these helpers bridge navigation ↔ promise: they stash a
 * `resolve` in the store, navigate to the sheet, and the screen settles it.
 */

export type EncryptionPromptMode = "unlock" | "enable";

type PromptResult = "success" | "cancelled";

type EncryptionPromptState = {
  mode: EncryptionPromptMode;
  cloudFileId: string;
  /** True when a key already existed but failed to decrypt (wrong/rotated) — the
   *  unlock copy differs from a first-time "this file is encrypted" prompt. */
  hasExistingKey: boolean;
  resolve: ((result: PromptResult) => void) | null;
};

export const useEncryptionPromptStore = create<EncryptionPromptState>(() => ({
  mode: "unlock",
  cloudFileId: "",
  hasExistingKey: false,
  resolve: null,
}));

function open(
  mode: EncryptionPromptMode,
  cloudFileId: string,
  hasExistingKey: boolean,
): Promise<PromptResult> {
  // Cancel any in-flight prompt before starting a new one.
  const prev = useEncryptionPromptStore.getState().resolve;
  if (prev) prev("cancelled");

  return new Promise<PromptResult>((resolve) => {
    useEncryptionPromptStore.setState({ mode, cloudFileId, hasExistingKey, resolve });
    router.push("/(auth)/encryption-password");
  });
}

/** Prompt for a password to unlock an encrypted budget. */
export function promptForPassword(
  cloudFileId: string,
  hasExistingKey = false,
): Promise<PromptResult> {
  return open("unlock", cloudFileId, hasExistingKey);
}

/** Prompt to set (or regenerate) the encryption password for the current budget. */
export function promptToEnableEncryption(): Promise<PromptResult> {
  const { fileId } = useBudgetContextStore.getState();
  return open("enable", fileId, false);
}

/**
 * Settle the active prompt — called by the screen on submit/cancel/dismiss.
 * Idempotent: once settled the resolver is cleared, so later calls (e.g. the
 * screen's unmount cleanup after a successful submit) are no-ops.
 */
export function settleEncryptionPrompt(result: PromptResult): void {
  const { resolve } = useEncryptionPromptStore.getState();
  useEncryptionPromptStore.setState({ resolve: null });
  resolve?.(result);
}
