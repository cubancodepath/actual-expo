import { createContext, use } from "react";

/**
 * What the sheet's tinted layers are painted with. A closed vocabulary on
 * purpose: screens map their own domain logic onto these, so the colour language
 * can't drift from one sheet to the next. `accent` is the odd one out — it says
 * "this hero's figure carries no good/bad state at all", which is the honest
 * answer for sheets that only frame an editor.
 */
export type EnvelopeSheetTone = "danger" | "success" | "balanced" | "accent";

/** The only place that knows which class paints which tone. */
export const TINT: Record<EnvelopeSheetTone, string> = {
  danger: "bg-danger/70",
  success: "bg-success/70",
  balanced: "bg-balanced/70",
  accent: "bg-accent/70",
};

/**
 * Where the sheet starts, which is the single answer to every safe-area question
 * its parts have:
 * - `"sheet"` — a form sheet, which the system already places below the notch.
 * - `"push"` — a pushed card that owns the whole window, so the parts pay the
 *   safe-area inset themselves.
 * - `"header"` — pushed under a *transparent* navigation bar. The hero still
 *   bleeds to the very top, but its content has to clear the bar as well as the
 *   status bar, or the centred amount would sit behind the back button.
 */
export type EnvelopeSheetPresentation = "sheet" | "push" | "header";

/**
 * Shared state for the sheet's layers. Lifted into the root so the (sibling)
 * parts can coordinate without prop drilling — which is the whole point: the
 * parts derive their layout and stacking from each other instead of making the
 * caller pass matching flags that can disagree.
 *
 * `Hero` and `Pinned` measure themselves; `Backdrop` and `Body` lay out against
 * those heights, and `Backdrop` also flips which side of `Body` it paints on
 * depending on whether a `Pinned` part exists.
 */
export type EnvelopeSheetValue = {
  tint: string;
  presentation: EnvelopeSheetPresentation;
  /** Top safe-area inset, already 0 for `"sheet"` — parts don't need the hook. */
  topInset: number;
  /** `null` until the hero has measured itself. */
  heroHeight: number | null;
  setHeroHeight: (height: number) => void;
  /** `0` when there is no `Pinned` part; `null` while one is mounted but unmeasured. */
  pinnedHeight: number | null;
  setPinnedHeight: (height: number) => void;
  hasPinned: boolean;
  /** Called by `Pinned` on mount; the returned cleanup unregisters it. */
  registerPinned: () => () => void;
};

export const EnvelopeSheetContext = createContext<EnvelopeSheetValue | null>(null);

export function useEnvelopeSheetContext(): EnvelopeSheetValue {
  const ctx = use(EnvelopeSheetContext);
  if (!ctx) {
    throw new Error(
      "EnvelopeSheet.Backdrop / .Body / .Pinned / .Hero must be used within <EnvelopeSheet>",
    );
  }
  return ctx;
}

/**
 * Every measured part has reported in, so the sheet can be shown. Until then the
 * parts render — that's how they measure — but stay invisible, which is what lets
 * the sheet drop the per-screen height guesses it used to need.
 */
export function useEnvelopeSheetReady(): boolean {
  const { heroHeight, pinnedHeight } = useEnvelopeSheetContext();
  return heroHeight != null && pinnedHeight != null;
}
