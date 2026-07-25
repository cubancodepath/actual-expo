import { create } from "zustand";

/**
 * Imperative full-screen busy service over `LoadingOverlay`.
 *
 * A single `<BusyOverlayHost />` (mounted once at the app root, a sibling above
 * the navigator) is the only subscriber to this store — same shape as the
 * dialog service (`dialogStore.ts`). Any blocking operation anywhere (store
 * action, service, screen) wraps itself in `busy.run(...)` and the root overlay
 * covers the whole app for its duration, surviving screen mounts/unmounts.
 *
 * `run` is the ONLY way to show the overlay: the counter is re-entrant (nested
 * runs don't flicker) and always decrements in `finally`, so a thrown error can
 * never leave the app stuck behind the overlay. Raw begin/end are deliberately
 * not exported. Messages are already-translated strings (callers own i18n);
 * the host falls back to the generic `common:justAMoment` when null. When
 * nested runs finish, the last message set wins until the counter drains to
 * zero.
 */

type BusyState = {
  /** Number of in-flight `busy.run` calls; overlay is visible while > 0. */
  count: number;
  /** Current phase message, or null for the host's generic fallback. */
  message: string | null;
};

export const useBusyStore = create<BusyState>(() => ({
  count: 0,
  message: null,
}));

export const busy = {
  /** Run `fn` behind the full-screen overlay. Re-entrant; always cleans up. */
  async run<T>(fn: () => Promise<T> | T, opts?: { message?: string }): Promise<T> {
    useBusyStore.setState((s) => ({
      count: s.count + 1,
      message: opts?.message ?? s.message,
    }));
    try {
      return await fn();
    } finally {
      useBusyStore.setState((s) => {
        const count = Math.max(0, s.count - 1);
        return count === 0 ? { count, message: null } : { count };
      });
    }
  },

  /** Update the phase message of the running operation. */
  setMessage(message: string | null): void {
    useBusyStore.setState((s) => (s.count > 0 ? { message } : s));
  },
};
