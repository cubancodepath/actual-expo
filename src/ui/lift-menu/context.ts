import { createContext, use } from "react";
import type { RowRect } from "./types";

/**
 * Bridge from `LiftMenu.Host` to whatever `renderMenu` returns, so the menu's
 * content (`LiftMenu.Content`, or anything composed inside it) can read the
 * lifted row without the screen threading `rect`/layout callbacks through
 * props.
 */
interface LiftMenuContextValue {
  /** The long-pressed item; read with `useLiftedItem<T>()` for typing. */
  item: unknown;
  /** The lifted row's window frame, measured at long-press. */
  rect: RowRect;
  /** Fired once the floating clone has laid out — the live row hides itself then. */
  onPreviewLayout: () => void;
}

export const LiftMenuContext = createContext<LiftMenuContextValue | null>(null);

export function useLiftMenuContext(): LiftMenuContextValue {
  const ctx = use(LiftMenuContext);
  if (!ctx) {
    throw new Error("LiftMenu components must be rendered inside LiftMenu.Host's renderMenu");
  }
  return ctx;
}

/** The item whose row is lifted, typed by the caller (matches the Host's `T`). */
export function useLiftedItem<T>(): T {
  return useLiftMenuContext().item as T;
}
