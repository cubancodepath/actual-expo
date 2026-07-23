import { useRouter } from "expo-router";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { createAccount } from "@/core/server/accounts";

const schema = z.object({
  name: z.string().trim().min(1, "accounts:newAccount.accountNameRequired"),
  startingBalance: z.number().int(),
  offbudget: z.boolean(),
});

type NewAccountValues = z.infer<typeof schema>;

/**
 * The "new account" form. A fresh modal each time, so a static `formId` +
 * constant `defaultValues` is enough (no route-derived identity, no clobber
 * hazard). Submit creates the account and dismisses the modal; persistence
 * failures surface through the global MutationCache.onError → error bus.
 */
export function useNewAccountForm() {
  const router = useRouter();

  const createMutation = useMutation({
    mutationFn: ({ name, startingBalance, offbudget }: NewAccountValues) =>
      createAccount({ name: name.trim(), offbudget, closed: false }, startingBalance),
    onSuccess: () => router.back(),
  });

  const form = useForm({
    formId: "account-new",
    defaultValues: { name: "", startingBalance: 0, offbudget: false } as NewAccountValues,
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      await createMutation.mutateAsync(value);
    },
  });

  return {
    form,
    submit: () => form.handleSubmit(),
    isSaving: createMutation.isPending,
  };
}
