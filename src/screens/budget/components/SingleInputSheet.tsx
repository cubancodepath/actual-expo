import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  BottomSheet,
  Button,
  FieldError,
  Input,
  Label,
  TextField,
  useBottomSheetAwareHandlers,
} from "heroui-native";

/**
 * The sheet's body. Split out because `useBottomSheetAwareHandlers` — which is
 * what lets the sheet see the keyboard at all — only works from inside
 * `BottomSheet.Content`, and because mounting it fresh per target is what resets
 * the draft between openings.
 */
function SingleInputForm({
  label,
  placeholder,
  initialValue,
  submitLabel,
  onValidate,
  onSubmit,
}: {
  label: string;
  placeholder?: string;
  initialValue: string;
  submitLabel: string;
  onValidate?: (value: string) => string | null;
  onSubmit: (value: string) => Promise<void> | void;
}) {
  const { t } = useTranslation("budget");
  const { onFocus, onBlur } = useBottomSheetAwareHandlers();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && !saving;

  async function handleSubmit() {
    if (!canSave) return;

    const validationError = onValidate?.(trimmed);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit(trimmed);
    } catch (e) {
      // The core throws plain Errors whose message is meant for the user
      // (duplicate name, missing group). Show it instead of closing silently.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="gap-4">
      <TextField isInvalid={error != null}>
        <Label>{label}</Label>
        <Input
          value={value}
          onChangeText={(next) => {
            if (error) setError(null);
            setValue(next);
          }}
          placeholder={placeholder}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        {error ? <FieldError>{error}</FieldError> : null}
      </TextField>

      <Button isDisabled={!canSave} onPress={handleSubmit}>
        <Button.Label>{saving ? t("savingEllipsis") : submitLabel}</Button.Label>
      </Button>
    </View>
  );
}

/**
 * A sheet with one text field and one button — the shape upstream calls
 * `SingleInputModal`, reused for "new category", "new group" and "rename group".
 *
 * `target` is both what the sheet acts on and whether it's open, so the two can't
 * disagree; pass `null` to close. The form is keyed by `target.id`, so each
 * opening starts clean.
 *
 * Keyboard: `BottomSheet.Content` is left on gorhom's default `interactive`
 * behaviour, which lifts the sheet by the keyboard's height. Do NOT pass
 * `keyboardBehavior="extend"` here — with dynamic sizing there's only one detent,
 * so "extend to the tallest detent" resolves to "stay put" and the keyboard
 * covers the field.
 */
export function SingleInputSheet({
  target,
  title,
  label,
  placeholder,
  submitLabel,
  initialValue = "",
  onValidate,
  onSubmit,
  onClose,
}: {
  /** What the sheet is editing, or `null` when closed. `id` keys the form. */
  target: { id: string } | null;
  title: string;
  label: string;
  placeholder?: string;
  submitLabel: string;
  initialValue?: string;
  /** Return a message to block submission and show it under the field. */
  onValidate?: (value: string) => string | null;
  onSubmit: (value: string) => Promise<void> | void;
  onClose: () => void;
}) {
  return (
    <BottomSheet isOpen={target != null} onOpenChange={(open) => !open && onClose()}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content keyboardBlurBehavior="restore">
          {target ? (
            <View className="gap-4 pb-2">
              <BottomSheet.Title>{title}</BottomSheet.Title>
              <SingleInputForm
                key={target.id}
                label={label}
                placeholder={placeholder}
                initialValue={initialValue}
                submitLabel={submitLabel}
                onValidate={onValidate}
                onSubmit={onSubmit}
              />
            </View>
          ) : null}
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
