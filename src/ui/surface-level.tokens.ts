import type { SurfaceVariant, ThemeColor } from "heroui-native";

/**
 * The elevation ladder as plain data — no React, no react-native, so it stays
 * assertable in the Node test suite. The provider and hook live in
 * `./surface-level`, which re-exports everything here.
 */

/**
 * Which kind of container the subtree is painted on.
 *
 * - `"screen"` — a regular route, or a `fullScreenModal` (it covers everything,
 *   so it *is* the canvas). Base of the elevation ladder.
 * - `"sheet"` — anything floating over content the user can still see: a
 *   `formSheet`, a card `modal`, a `BottomSheet`, a `Dialog`, a `Popover`. The
 *   sheet itself is already one step up, so everything inside it shifts down a
 *   rung to stay distinguishable.
 */
export type SurfaceContext = "screen" | "sheet";

export type SurfaceLevelClasses = {
  /** Full-bleed root of the screen / sheet. */
  canvas: string;
  /** Cards, rows, list groups, pinned bars sitting directly on the canvas. */
  item: string;
  /** A surface inside an item (nested card, toggle thumb, avatar well). */
  nested: string;
  /** heroui `Surface`/`ListGroup` variant equivalent to {@link item}. */
  itemVariant: SurfaceVariant;
  /** heroui `Surface`/`ListGroup` variant equivalent to {@link nested}. */
  nestedVariant: SurfaceVariant;
  /** `useThemeColor` token for {@link canvas} — for imperative use (a
   *  navigator's `contentStyle`, native pickers) where a class won't do. */
  canvasToken: ThemeColor;
  /** Escape hatch for the rare component that must branch on the context. */
  context: SurfaceContext;
};

/**
 * The two rungs of the ladder, frozen at module scope so the hook allocates
 * nothing and its result is referentially stable forever.
 *
 * @see https://heroui.com/docs/native/getting-started/colors — `--surface` is
 * for non-overlay containers, `--overlay` for floating ones (modals, menus,
 * popovers), which is why a sheet's canvas is `overlay` and not `background`.
 */
export const SURFACE_LEVELS: Record<SurfaceContext, SurfaceLevelClasses> = {
  screen: {
    canvas: "bg-background",
    item: "bg-surface",
    nested: "bg-surface-secondary",
    itemVariant: "default",
    nestedVariant: "secondary",
    canvasToken: "background",
    context: "screen",
  },
  sheet: {
    canvas: "bg-overlay",
    item: "bg-surface-secondary",
    nested: "bg-surface-tertiary",
    itemVariant: "secondary",
    nestedVariant: "tertiary",
    canvasToken: "overlay",
    context: "sheet",
  },
};
