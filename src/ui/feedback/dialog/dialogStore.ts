import { create } from "zustand";
import type {
  AlertOptions,
  ChooseOptions,
  ConfirmOptions,
  CustomOptions,
  DialogRequest,
} from "./types";

/**
 * Imperative dialog service over heroui-native `Dialog`.
 *
 * A single `<DialogHost />` (mounted once at the app root) is the only
 * subscriber to this store, so opening/closing a dialog re-renders exactly one
 * component. The `dialog` API below is a set of module-level functions, stable
 * across renders and callable from anywhere — components, services, mutations —
 * like a better `Alert.alert`. Every close path resolves the pending promise,
 * so awaited calls never hang.
 */

/**
 * Kept mounted while `isOpen` is false so the exit animation can play without
 * the content blanking; cleared this long after a dismiss, then the queue
 * advances. Comfortably covers heroui's ~150ms content/overlay exits.
 */
const DIALOG_EXIT_MS = 320;

type DialogState = {
  /** The visible (or animating-out) request; null when fully idle. */
  current: DialogRequest | null;
  /** Drives heroui `Dialog.isOpen`. */
  isOpen: boolean;
  /** Pending requests shown one at a time, FIFO. */
  queue: DialogRequest[];
};

export const useDialogStore = create<DialogState>(() => ({
  current: null,
  isOpen: false,
  queue: [],
}));

let nextId = 1;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

function push(req: DialogRequest) {
  const { current } = useDialogStore.getState();
  if (current === null) {
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
    useDialogStore.setState({ current: req, isOpen: true });
  } else {
    useDialogStore.setState((s) => ({ queue: [...s.queue, req] }));
  }
}

/**
 * Resolve the active request with `value`, animate it out, then advance the
 * queue. No-op if there's no active request or it's already dismissing.
 */
export function settleDialog(value: unknown) {
  const { current, isOpen } = useDialogStore.getState();
  if (!current || !isOpen) return;

  const settledId = current.id;
  (current.resolve as (v: unknown) => void)(value);
  useDialogStore.setState({ isOpen: false });

  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    clearTimer = null;
    const state = useDialogStore.getState();
    // Guard against a newer request having replaced the one we settled.
    if (state.current?.id !== settledId) return;
    const [next, ...rest] = state.queue;
    if (next) {
      useDialogStore.setState({ current: next, isOpen: true, queue: rest });
    } else {
      useDialogStore.setState({ current: null, queue: rest });
    }
  }, DIALOG_EXIT_MS);
}

/** The value an active request resolves to when dismissed (overlay/back/`dismiss`). */
function cancelValueFor(req: DialogRequest): unknown {
  switch (req.kind) {
    case "confirm":
      return false;
    case "choose":
      return null;
    default:
      return undefined; // alert -> void, custom -> undefined
  }
}

/** Dismiss the active dialog with its cancel value. */
export function dismissDialog() {
  const { current } = useDialogStore.getState();
  if (!current) return;
  settleDialog(cancelValueFor(current));
}

export const dialog = {
  /** Single-button acknowledgement. Resolves when dismissed. */
  alert(opts: AlertOptions): Promise<void> {
    return new Promise<void>((resolve) => {
      push({ id: nextId++, kind: "alert", opts, resolve });
    });
  },

  /** Confirm/cancel. Resolves `true` on confirm, `false` on cancel/dismiss. */
  confirm(opts: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      push({ id: nextId++, kind: "confirm", opts, resolve });
    });
  },

  /** One button per action. Resolves the chosen key, or `null` on cancel/dismiss. */
  choose<K extends string>(opts: ChooseOptions<K>): Promise<K | null> {
    return new Promise<K | null>((resolve) => {
      push({
        id: nextId++,
        kind: "choose",
        opts: opts as ChooseOptions,
        resolve: resolve as (v: string | null) => void,
      });
    });
  },

  /** Inject custom content. Resolves the value passed to `close`, or `undefined`. */
  custom<T = void>(opts: CustomOptions<T>): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve) => {
      push({
        id: nextId++,
        kind: "custom",
        opts: opts as CustomOptions<unknown>,
        resolve: resolve as (v: unknown) => void,
      });
    });
  },

  /** Dismiss the active dialog programmatically (resolves with its cancel value). */
  dismiss() {
    dismissDialog();
  },
};
