import { InputAccessoryView, Platform, TextInput } from "react-native";
import { CalculatorPill } from "../currency-input/CalculatorPill";
import type { useAmountInput } from "./useAmountInput";

interface HiddenAmountInputProps {
  /** The return value of useAmountInput() */
  amountInput: ReturnType<typeof useAmountInput>;
  /** Auto-focus the hidden TextInput on mount */
  autoFocus?: boolean;
  /** Show a Done button in the calculator pill (for list-editing contexts) */
  onDone?: () => void;
}

/**
 * Hidden TextInput + InputAccessoryView for the calculator toolbar.
 * Renders outside ScrollView/main content for reliable focus on iOS.
 *
 * Usage:
 * ```tsx
 * const amountInput = useAmountInput();
 * return (
 *   <>
 *     <ScrollView>...</ScrollView>
 *     <HiddenAmountInput amountInput={amountInput} />
 *   </>
 * );
 * ```
 */
export function HiddenAmountInput({ amountInput, autoFocus, onDone }: HiddenAmountInputProps) {
  return (
    <>
      {Platform.OS === "ios" && (
        <InputAccessoryView
          nativeID={amountInput.AMOUNT_ACCESSORY_ID}
          backgroundColor="transparent"
        >
          <CalculatorPill inputRef={amountInput.selfRef} onDone={onDone} />
        </InputAccessoryView>
      )}
      <TextInput
        ref={amountInput.sharedInputRef}
        value={amountInput.currentAmountInputValue}
        onChangeText={amountInput.handleAmountChangeText}
        onFocus={() => amountInput.setAmountFocused(true)}
        onBlur={amountInput.handleAmountBlur}
        keyboardType="number-pad"
        autoFocus={autoFocus}
        caretHidden
        contextMenuHidden
        inputAccessoryViewID={Platform.OS === "ios" ? amountInput.AMOUNT_ACCESSORY_ID : undefined}
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
