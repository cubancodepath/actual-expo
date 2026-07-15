import { createContext, use } from "react";

export interface AmountKeyboardState {
  /** Current amount in cents. */
  value: number;
  /** Whether the keyboard is open. */
  isOpen: boolean;
}

export interface AmountKeyboardActions {
  /** Replace the amount (cents). */
  setValue: (cents: number) => void;
  /** Open/close the keyboard (the ✓ key closes; Trigger opens). */
  onOpenChange: (isOpen: boolean) => void;
}

// Split into two contexts so the fast-changing state (value updates on every
// keystroke) never re-renders actions-only consumers like Trigger.
export const AmountKeyboardStateContext = createContext<AmountKeyboardState | null>(null);
export const AmountKeyboardActionsContext = createContext<AmountKeyboardActions | null>(null);

/** State (value/isOpen). Must be used inside `<AmountKeyboard>`. */
export function useAmountKeyboardState(): AmountKeyboardState {
  const ctx = use(AmountKeyboardStateContext);
  if (!ctx) throw new Error("useAmountKeyboardState must be used within <AmountKeyboard>");
  return ctx;
}

/** Actions (setValue/onOpenChange). Must be used inside `<AmountKeyboard>`. */
export function useAmountKeyboardActions(): AmountKeyboardActions {
  const ctx = use(AmountKeyboardActionsContext);
  if (!ctx) throw new Error("useAmountKeyboardActions must be used within <AmountKeyboard>");
  return ctx;
}
