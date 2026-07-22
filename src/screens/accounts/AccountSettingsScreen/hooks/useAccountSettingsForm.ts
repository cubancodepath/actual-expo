import { useRouter } from "expo-router";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { updateAccount } from "@/core/domain/accounts";
import { setNote } from "@/core/domain/notes";
import type { Account } from "@/core/domain/accounts/types";

const schema = z.object({
  name: z.string().trim().min(1, "accounts:settings.accountNameRequired"),
  notes: z.string(),
});

type AccountSettingsValues = z.infer<typeof schema>;

/**
 * Edit-account form. Route-derived: the form's identity + defaults come from the
 * account (formId = its id, defaults = its name + current note), so a different
 * account is a brand-new form with the right values — no imperative reset. Save
 * writes only the changed fields (name via updateAccount, note via setNote keyed
 * `account-<id>` for upstream sync parity); failures surface via the global
 * MutationCache.onError bus.
 */
export function useAccountSettingsForm(account: Account, initialNote: string) {
  const router = useRouter();

  const saveMutation = useMutation({
    mutationFn: async ({ name, notes }: AccountSettingsValues) => {
      const trimmedName = name.trim();
      if (trimmedName !== account.name) await updateAccount(account.id, { name: trimmedName });
      const trimmedNotes = notes.trim();
      if (trimmedNotes !== initialNote.trim()) {
        await setNote(`account-${account.id}`, trimmedNotes || null);
      }
    },
    onSuccess: () => router.back(),
  });

  const form = useForm({
    formId: `account-settings-${account.id}`,
    defaultValues: { name: account.name, notes: initialNote } as AccountSettingsValues,
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      await saveMutation.mutateAsync(value);
    },
  });

  return {
    form,
    submit: () => form.handleSubmit(),
    isSaving: saveMutation.isPending,
  };
}
