import { create } from "zustand";

/**
 * Global visibility/height of the in-app custom amount keyboard
 * (`src/ui/amount-keyboard/`). Its open state lives in a per-instance React
 * context, invisible to root-mounted overlays (e.g. the undo Toast). This
 * store promotes just the two signals a bottom-anchored overlay needs so it
 * can lift itself above the pad. Mirrors the shape of `tabBarStore`.
 *
 * The system keyboard is NOT tracked here — it's available for free under the
 * app's `KeyboardProvider` via react-native-keyboard-controller. Only one
 * keyboard is ever visible at a time (the amount pad calls `Keyboard.dismiss()`
 * before opening), so consumers take `max(systemKb, amountHeight, insets)`.
 */
interface KeyboardState {
  amountOpen: boolean;
  amountHeight: number;
  setAmountKeyboardOpen: (open: boolean) => void;
  setAmountKeyboardHeight: (height: number) => void;
}

export const useKeyboardStore = create<KeyboardState>((set) => ({
  amountOpen: false,
  amountHeight: 0,
  setAmountKeyboardOpen: (amountOpen) => set({ amountOpen }),
  setAmountKeyboardHeight: (amountHeight) => set({ amountHeight }),
}));
