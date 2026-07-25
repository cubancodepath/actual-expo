import { create } from "zustand";
import { undo as performUndo, redo as performRedo, setOnStateChange } from "@/core/server/undo";

type UndoState = {
  canUndo: boolean;
  canRedo: boolean;
  /** Human-readable label for the last undoable action (e.g. "Delete Transaction") */
  lastAction: string | null;
  /** Incremented after each successful undo/redo — screens with local state can watch this to refresh */
  undoVersion: number;
  undo(): Promise<void>;
  redo(): Promise<void>;
  /** Records the label for the last undoable action (used by shake-to-undo). */
  recordAction(message: string): void;
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
  // during React's commit phase (e.g. when called from core/server/undo.ts
  // inside an ongoing render cycle).
  setOnStateChange(({ canUndo, canRedo }) => {
    queueMicrotask(() => set({ canUndo, canRedo, ...(!canUndo ? { lastAction: null } : {}) }));
  });

  return {
    canUndo: false,
    canRedo: false,
    lastAction: null,
    undoVersion: 0,

    async undo() {
      const tables = await performUndo();
      if (tables.length > 0) {
        set((s) => ({ undoVersion: s.undoVersion + 1, lastAction: null }));
      }
    },

    async redo() {
      const tables = await performRedo();
      if (tables.length > 0) {
        set((s) => ({ undoVersion: s.undoVersion + 1 }));
      }
    },

    recordAction(message: string) {
      set({ lastAction: deriveActionLabel(message) });
    },
  };
});
