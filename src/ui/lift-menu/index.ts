import { LiftMenuContent } from "./LiftMenuContent";
import { LiftMenuHost } from "./LiftMenuHost";
import { LiftMenuRow } from "./LiftMenuRow";

/**
 * Compound long-press "lift" context menu: `Host` owns the single menu for a
 * list, `Row` wraps each pressable row, `Content` is the menu body rendered
 * from `Host`'s `renderMenu`.
 *
 * A plain object (not `Object.assign` like AmountKeyboard) because `LiftMenu`
 * itself is never rendered, and the literal preserves `Host`'s generic call
 * signature — `<LiftMenu.Host<Account> …>` works with explicit type args.
 */
export const LiftMenu = {
  Host: LiftMenuHost,
  Content: LiftMenuContent,
  Row: LiftMenuRow,
};

export type { RowRect } from "./types";
export type { LiftMenuHostProps, LiftMenuHostRenderProps } from "./LiftMenuHost";
export { ROW_PRESS_ANIMATION, useLiftLongPress } from "./LiftMenuRow";
export { useLiftedItem } from "./context";
