import { create } from 'zustand';
import {
  undo as performUndo,
  canUndo as checkCanUndo,
  setOnStateChange,
} from '../sync/undo';

type UndoNotification = {
  message: string;
  key: number; // unique key to force re-render on repeated notifications
};

type UndoState = {
  canUndo: boolean;
  notification: UndoNotification | null;
  undo(): Promise<void>;
  showUndo(message: string): void;
  clearNotification(): void;
};

export const useUndoStore = create<UndoState>((set) => {
  // Wire up the undo module's state change callback
  setOnStateChange((canUndo) => {
    set({ canUndo });
  });

  return {
    canUndo: false,
    notification: null,

    async undo() {
      const tables = await performUndo();
      if (tables.length > 0) {
        set({ notification: { message: 'Undone', key: Date.now() } });
      }
    },

    showUndo(message: string) {
      set({ notification: { message, key: Date.now() } });
    },

    clearNotification() {
      set({ notification: null });
    },
  };
});
