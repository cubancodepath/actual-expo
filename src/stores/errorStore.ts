import { create } from "zustand";
import type { ActualError, ErrorCode } from "@/core/errors";

export type PresentedError = {
  id: string;
  error: ActualError;
  display: "toast" | "inline" | "dialog" | "fatal";
  createdAt: number;
};

type ErrorStoreState = {
  queue: PresentedError[];
  push(error: ActualError, display: PresentedError["display"]): void;
  dismiss(id: string): void;
  clear(): void;
};

const DEDUP_WINDOW_MS = 5_000;

let nextId = 0;

/**
 * Holds errors waiting for global presentation (toast/dialog/fatal).
 * `<ErrorPresenter/>` (mounted once in app/_layout.tsx) is the only reader.
 * Screen-local "inline" errors from useMutation don't go through this store.
 */
export const useErrorStore = create<ErrorStoreState>((set, get) => ({
  queue: [],

  push(error, display) {
    const recentDuplicate = get().queue.some(
      (entry) => entry.error.code === error.code && Date.now() - entry.createdAt < DEDUP_WINDOW_MS,
    );
    if (recentDuplicate) return;

    const entry: PresentedError = { id: String(nextId++), error, display, createdAt: Date.now() };
    set((state) => ({ queue: [...state.queue, entry] }));
  },

  dismiss(id) {
    set((state) => ({ queue: state.queue.filter((entry) => entry.id !== id) }));
  },

  clear() {
    set({ queue: [] });
  },
}));

/** Test/debug helper — check if a code is currently queued. */
export function hasQueuedError(code: ErrorCode): boolean {
  return useErrorStore.getState().queue.some((entry) => entry.error.code === code);
}
