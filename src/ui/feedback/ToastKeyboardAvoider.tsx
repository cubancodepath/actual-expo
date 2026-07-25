import type { ReactNode } from "react";
import { View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardStore } from "@/stores/keyboardStore";

/**
 * Wraps HeroUI Native's Toast content region so a bottom-placed toast rides
 * above whichever keyboard is visible:
 *
 * - **System keyboard**: `KeyboardAvoidingView` (react-native-keyboard-controller,
 *   already provided app-wide by `KeyboardProvider`) pads the region as it opens.
 * - **Custom amount keyboard** (`src/ui/amount-keyboard/`): not a native keyboard,
 *   so KAV can't see it — we read its height from `keyboardStore` and add it as
 *   bottom padding. Its own panel already includes `insets.bottom`, so we lift by
 *   `amountHeight - insets.bottom` above the toast's safe-area baseline.
 *
 * Only one keyboard shows at a time (the amount pad dismisses the system
 * keyboard before opening), so the two never double-count.
 *
 * `pointerEvents="box-none"` keeps taps flowing to the screen underneath.
 */
export function ToastKeyboardAvoider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const amountOpen = useKeyboardStore((s) => s.amountOpen);
  const amountHeight = useKeyboardStore((s) => s.amountHeight);

  const customLift = amountOpen ? Math.max(0, amountHeight - insets.bottom) : 0;

  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={12}
      pointerEvents="box-none"
      style={{ flex: 1 }}
    >
      <View pointerEvents="box-none" style={{ flex: 1, paddingBottom: customLift }}>
        {children}
      </View>
    </KeyboardAvoidingView>
  );
}
