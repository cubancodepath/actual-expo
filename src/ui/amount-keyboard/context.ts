import { createContext, use } from "react";

export interface AmountKeyboardContextValue {
  state: {
    /** Current amount in cents. */
    value: number;
  };
  actions: {
    /** Replace the amount (cents). */
    setValue: (cents: number) => void;
    /** Confirm the amount (Done key). */
    done: () => void;
  };
}

export const AmountKeyboardContext = createContext<AmountKeyboardContextValue | null>(null);

/** Access the AmountKeyboard context. Must be used inside `<AmountKeyboard>`. */
export function useAmountKeyboard(): AmountKeyboardContextValue {
  const ctx = use(AmountKeyboardContext);
  if (!ctx) throw new Error("useAmountKeyboard must be used within <AmountKeyboard>");
  return ctx;
}
