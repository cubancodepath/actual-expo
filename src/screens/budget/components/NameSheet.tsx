import { useImperativeHandle, useRef, type ReactNode, type Ref } from "react";
import { View, type TextInput } from "react-native";
import {
  BottomSheet,
  Button,
  FieldError,
  Input,
  Label,
  TextField,
  useBottomSheetAwareHandlers,
} from "heroui-native";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useSelector } from "@tanstack/react-store";
import { z } from "zod";

const schema = z.object({ name: z.string().trim().min(1) });

/** What the shell can ask of the form once it's mounted. */
type NameFormHandle = { submit: () => void; focus: () => void };

/**
 * The form. Mounted fresh per target (the shell keys it), which is how the app
 * avoids TanStack Form's update() clobber: a new target means a new form
 * identity, never an imperative reset.
 *
 * Lives inside `BottomSheet.Content` because `useBottomSheetAwareHandlers` only
 * works there — outside a BottomSheet its handlers are silent no-ops, and
 * without the `target` they set, gorhom drops the keyboard event entirely
 * (`useAnimatedKeyboard.js`: a SHOWN event with no target is cached and
 * discarded).
 */
function NameSheetForm({
  ref,
  label,
  placeholder,
  initialValue,
  submitLabel,
  onSave,
  children,
}: {
  ref: Ref<NameFormHandle>;
  label: string;
  placeholder?: string;
  initialValue: string;
  submitLabel?: string;
  onSave: (name: string) => Promise<void> | void;
  children?: ReactNode;
}) {
  const { onFocus, onBlur } = useBottomSheetAwareHandlers();
  const inputRef = useRef<TextInput>(null);

  // `inline` keeps the failure out of the global presenter: the bus still logs
  // it, but the message belongs under the field. Core throws plain Errors whose
  // text is written for the user ("… already exists in group …"), so it's shown
  // verbatim rather than mapped through `errors:<code>`.
  const save = useMutation({
    mutationFn: (name: string) => Promise.resolve(onSave(name)),
    meta: { inline: true },
  });

  const form = useForm({
    formId: `name-${initialValue || "new"}`,
    defaultValues: { name: initialValue },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => save.mutateAsync(value.name.trim()),
  });

  const name = useSelector(form.store, (s) => s.values.name);
  const canSubmit = useSelector(form.store, (s) => s.canSubmit);

  // Saving is a no-op when nothing changed, so blur and dismiss can both fire it
  // without writing the same name twice.
  function submit() {
    if (name.trim() && name.trim() !== initialValue) void form.handleSubmit();
  }

  useImperativeHandle(ref, () => ({
    submit,
    focus: () => inputRef.current?.focus(),
  }));

  return (
    <View className="gap-4">
      <TextField isInvalid={save.error != null}>
        <Label>{label}</Label>
        <Input
          ref={inputRef}
          value={name}
          onChangeText={(next) => {
            if (save.error) save.reset();
            form.setFieldValue("name", next);
          }}
          placeholder={placeholder}
          returnKeyType="done"
          // The return key always saves, button or no button.
          onSubmitEditing={submit}
          onFocus={onFocus}
          onBlur={(e) => {
            onBlur(e);
            // With no button, the field itself is the save action.
            if (!submitLabel) submit();
          }}
        />
        {save.error ? (
          <FieldError>
            {save.error instanceof Error ? save.error.message : String(save.error)}
          </FieldError>
        ) : null}
      </TextField>

      {/* Stacked, so a sheet can put a card above its action row — each call
          site lays its own buttons out. */}
      {children ? <View className="gap-4">{children}</View> : null}

      {submitLabel ? (
        <Button isDisabled={!canSubmit || save.isPending} onPress={() => void form.handleSubmit()}>
          <Button.Label>{submitLabel}</Button.Label>
        </Button>
      ) : null}
    </View>
  );
}

/**
 * A bottom sheet that edits one name, with an optional row of extra actions.
 *
 * `target` is both what the sheet acts on and whether it's open, so the two
 * can't disagree — pass `null` to close.
 *
 * `submitLabel` decides when the draft is saved. With it there's a button and
 * the user says when — what a create flow needs, so an abandoned draft never
 * creates anything. Without it the name saves on blur and on dismiss.
 *
 * Layout follows heroui's documented recipe: no `snapPoints`, no
 * `enableDynamicSizing={false}`, no fixed height — the sheet hugs its content.
 * The keyboard props are the only additions: `interactive` (the docs offer
 * "extend or interactive"; `extend` snaps to the tallest detent, which for a
 * single-detent sheet is where it already is) and `restore` so it comes back
 * down afterwards.
 */
export function NameSheet({
  target,
  title,
  label,
  placeholder,
  initialValue = "",
  submitLabel,
  autoFocus = false,
  onSave,
  onClose,
  children,
}: {
  /** What's being edited, or `null` when closed. `id` remounts the form. */
  target: { id: string } | null;
  title: string;
  label: string;
  placeholder?: string;
  initialValue?: string;
  /** Present = explicit save button. Absent = save on blur and on dismiss. */
  submitLabel?: string;
  /**
   * Focus the field once the sheet has SETTLED, never on mount. Focusing during
   * the opening animation raises the keyboard before gorhom's context is live,
   * and that event gets dropped — which is what kept the keyboard covering the
   * field. Waiting for `onChange` (gorhom fires it when the sheet lands on a
   * detent) makes the order deterministic.
   */
  autoFocus?: boolean;
  /** Rejections surface under the field; throw an Error whose message is for the user. */
  onSave: (name: string) => Promise<void> | void;
  onClose: () => void;
  /** Optional row of extra actions on the thing being edited (hide, delete…). */
  children?: ReactNode;
}) {
  const formRef = useRef<NameFormHandle>(null);

  function dismiss() {
    // Dismissing counts as saving when there's no button. With one, the user
    // already had their chance to say yes.
    if (!submitLabel) formRef.current?.submit();
    onClose();
  }

  return (
    <BottomSheet isOpen={target != null} onOpenChange={(open) => !open && dismiss()}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          backgroundClassName="bg-background"
          keyboardBehavior="interactive"
          keyboardBlurBehavior="restore"
          onChange={(index) => {
            if (autoFocus && index >= 0) formRef.current?.focus();
          }}
        >
          {target ? (
            <View className="gap-4">
              <BottomSheet.Title>{title}</BottomSheet.Title>
              <NameSheetForm
                key={target.id}
                ref={formRef}
                label={label}
                placeholder={placeholder}
                initialValue={initialValue}
                submitLabel={submitLabel}
                onSave={onSave}
              >
                {children}
              </NameSheetForm>
            </View>
          ) : null}
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
