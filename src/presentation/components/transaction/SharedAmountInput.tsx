import { InputAccessoryView, Keyboard, Platform, TextInput } from "react-native";
import { CalculatorPill } from "../currency-input/CalculatorPill";
import type { CurrencyInputRef } from "../currency-input";

interface SharedAmountInputProps {
  /** nativeID for InputAccessoryView (use React useId()) */
  accessoryID: string;
  /** Ref for the hidden TextInput */
  sharedInputRef: React.RefObject<TextInput | null>;
  /** Ref for the CalculatorPill to call injectOperator/evaluate/deleteBackward */
  selfRef: React.RefObject<CurrencyInputRef | null>;
  /** Current value for the hidden TextInput */
  value: string;
  /** Called on every keystroke */
  onChangeText: (text: string) => void;
  /** Called when the TextInput loses focus */
  onBlur: () => void;
  /** Show Done button in the pill (for multi-input list contexts) */
  showDone?: boolean;
}

/**
 * Shared hidden TextInput + InputAccessoryView for screens with multiple
 * currency inputs (budget, split, cover-source).
 *
 * Mount once at screen level, outside any ScrollView.
 */
export function SharedAmountInput({
  accessoryID,
  sharedInputRef,
  selfRef,
  value,
  onChangeText,
  onBlur,
  showDone = true,
}: SharedAmountInputProps) {
  return (
    <>
      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={accessoryID} backgroundColor="transparent">
          <CalculatorPill
            inputRef={selfRef}
            onDone={showDone ? () => Keyboard.dismiss() : undefined}
          />
        </InputAccessoryView>
      )}
      <TextInput
        ref={sharedInputRef}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        keyboardType="number-pad"
        caretHidden
        contextMenuHidden
        inputAccessoryViewID={Platform.OS === "ios" ? accessoryID : undefined}
        style={{
          position: "absolute",
          opacity: 0,
          height: 1,
          width: 1,
          pointerEvents: "none" as const,
        }}
      />
    </>
  );
}
