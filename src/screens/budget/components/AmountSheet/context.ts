import { createContext, use } from "react";

/**
 * How the sheet's amount is doing, which drives the tint of both hero layers.
 * A closed vocabulary on purpose: screens map their own domain logic onto these
 * three, so the colour language can't drift from one sheet to the next.
 */
export type AmountSheetStatus = "danger" | "success" | "balanced";

/** The only place that knows which class paints which status. */
export const TINT: Record<AmountSheetStatus, string> = {
  danger: "bg-danger/70",
  success: "bg-success/70",
  balanced: "bg-balanced/70",
};

/**
 * Shared state for the sheet's layers. Lifted into {@link AmountSheetRoot} so
 * the (sibling) layers can talk without prop drilling: `Hero` measures itself
 * and publishes `heroHeight`, which `Backdrop` uses for its own height and
 * `Body` for its top padding; all painted layers read the same `tint`.
 */
export type AmountSheetValue = {
  tint: string;
  heroHeight: number;
  setHeroHeight: (height: number) => void;
};

export const AmountSheetContext = createContext<AmountSheetValue | null>(null);

export function useAmountSheetContext(): AmountSheetValue {
  const ctx = use(AmountSheetContext);
  if (!ctx) {
    throw new Error("AmountSheet.Backdrop / .Body / .Hero must be used within <AmountSheet>");
  }
  return ctx;
}
