import { create } from "zustand";
import { undo as performUndo, canUndo as checkCanUndo, setOnStateChange } from "@core/sync/undo";

type UndoNotification = {
  message: string;
  key: number; // unique key to force re-render on repeated notifications
};

type UndoState = {
  canUndo: boolean;
  notification: UndoNotification | null;
  /** Human-readable label for the last undoable action (e.g. "Delete Transaction") */
  lastAction: string | null;
  /** Incremented after each successful undo — screens with local state can watch this to refresh */
  undoVersion: number;
  undo(): Promise<void>;
  showUndo(message: string): void;
  clearNotification(): void;
};

/**
 * Derive a short action label from the toast message for the shake-to-undo alert.
 * "Transaction deleted" → "Delete Transaction"
 * "3 transactions deleted" → "Delete Transactions"
 */
function deriveActionLabel(message: string): string {
  const m = message.replace(/\d+\s+/, "").trim(); // strip leading count
  const parts = m.split(" ");
  if (parts.length >= 2 && parts[parts.length - 1].toLowerCase() === "deleted") {
    const noun = parts
      .slice(0, -1)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    return `Delete ${noun}`;
  }
  return message;
}

export const useUndoStore = create<UndoState>((set) => {
  // Wire up the undo module's state change callback.
  // Deferred via queueMicrotask to avoid triggering Zustand re-renders
  // during React's commit phase (e.g. when called from sync/undo.ts
  // inside an ongoing render cycle).
  setOnStateChange((canUndo) => {
    queueMicrotask(() => set({ canUndo, ...(!canUndo ? { lastAction: null } : {}) }));
  });

  return {
    canUndo: false,
    notification: null,
    lastAction: null,
    undoVersion: 0,

    async undo() {
      const tables = await performUndo();
      if (tables.length > 0) {
        set((s) => ({
          notification: { message: "Undone", key: Date.now() },
          undoVersion: s.undoVersion + 1,
          lastAction: null,
        }));
      }
    },

    showUndo(message: string) {
      // Auto-derive action label: "Transaction deleted" → "Delete Transaction"
      const action = deriveActionLabel(message);
      set({ notification: { message, key: Date.now() }, lastAction: action });
    },

    clearNotification() {
      set({ notification: null });
    },
  };
});
