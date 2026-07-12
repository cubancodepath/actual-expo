/**
 * useNewTransactionForm — the create/edit transaction form core.
 *
 * Owns TanStack Form state + Zod validation, hydrates in edit mode, and persists
 * through the domain `saveTransaction`. Failures are reported to the error bus
 * (`emitErrorEvent`); the visual feedback is deferred to a global bus consumer.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import {
  getTransactionById,
  getChildTransactions,
  deleteTransaction,
} from "@/core/domain/transactions";
import { saveTransaction, type SaveTransactionInput } from "@/core/domain/transactions/save";
import { suggestCategoryForPayee } from "@/core/domain/rules/apply";
import { todayInt } from "@/lib/date";
import type { Account } from "@/core/domain/accounts/types";
import type { Category } from "@/core/domain/categories/types";
import type { Rule } from "@/core/domain/rules/rule";
import {
  transactionFormSchema,
  isSplitLines,
  type TransactionFormValues,
  type SplitLineForm,
} from "../validation/transactionForm.schema";

/** Reference data the form needs, injected so the provider subscribes only once. */
export interface TransactionFormData {
  accounts: Account[];
  categories: Category[];
  rules: Rule[];
}

export interface NewTransactionParams {
  accountId?: string;
  accountName?: string;
  categoryId?: string;
  categoryName?: string;
  amount?: string;
  payeeName?: string;
  transactionId?: string;
}

export type PayeeSelection = {
  id: string | null;
  name: string;
  transferAcct?: string | null;
};

export function useNewTransactionForm(
  params: NewTransactionParams,
  { accounts, categories, rules }: TransactionFormData,
) {
  const { t } = useTranslation("transactions");
  const router = useRouter();

  const transactionId = params.transactionId;
  const isEdit = !!transactionId;

  // Tracks fields the user set manually so auto-suggestions don't clobber them.
  const userOverrides = useRef<Set<string>>(new Set());
  const hydratedRef = useRef(false);

  const defaultValues = useMemo<TransactionFormValues>(() => {
    const initialAccount = accounts.find((a) => a.id === params.accountId);
    if (params.categoryId) userOverrides.current.add("category");
    if (params.accountId) userOverrides.current.add("account");
    return {
      type: "expense",
      amount: params.amount ? Number(params.amount) : 0,
      accountId: params.accountId ?? null,
      accountName: params.accountName ?? initialAccount?.name ?? "",
      payeeId: null,
      payeeName: params.payeeName ?? "",
      isTransfer: false,
      categoryId: params.categoryId ?? null,
      categoryName: params.categoryName ?? "",
      date: todayInt(),
      notes: "",
      cleared: false,
      reconciled: false,
      recurConfig: null,
      splitLines: null,
    };
    // defaultValues is captured once by useForm; params are stable for a screen instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const form = useForm({
    defaultValues,
    validators: {
      onChange: transactionFormSchema,
      onSubmit: transactionFormSchema,
    },
    onSubmit: async ({ value }) => {
      await performSave(value);
    },
  });

  // Persistence via TanStack Query mutations — states (isPending/error) plus
  // automatic error-bus reporting through the global MutationCache.onError.
  const saveMutation = useMutation({
    mutationFn: (input: SaveTransactionInput) => saveTransaction(input, rules),
    onSuccess: () => router.dismiss(),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTransaction(id),
    onSuccess: () => router.dismiss(),
  });

  // ── Edit hydration (once) ────────────────────────────────────────────────
  useEffect(() => {
    if (!isEdit || hydratedRef.current) return;
    hydratedRef.current = true;

    (async () => {
      try {
        const txn = await getTransactionById(transactionId!);
        if (!txn) return;

        let splitLines: SplitLineForm[] | null = null;
        if (txn.is_parent) {
          const children = await getChildTransactions(transactionId!);
          if (children.length > 0) {
            splitLines = children.map((c) => ({
              id: c.id,
              categoryId: c.category,
              categoryName: c.categoryName ?? "",
              amount: Math.abs(c.amount),
            }));
          }
        }

        form.reset({
          type: txn.amount < 0 ? "expense" : "income",
          amount: Math.abs(txn.amount),
          accountId: txn.account,
          accountName: accounts.find((a) => a.id === txn.account)?.name ?? txn.accountName ?? "",
          payeeId: txn.payee,
          payeeName: txn.payeeName ?? "",
          isTransfer: !!txn.transfer_id,
          categoryId: txn.category ?? null,
          categoryName: txn.categoryName ?? "",
          date: txn.date,
          notes: txn.notes ?? "",
          cleared: txn.cleared,
          reconciled: txn.reconciled,
          recurConfig: null,
          splitLines,
        });
      } catch (e) {
        emitErrorEvent(e, { operation: "transaction.hydrate" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, transactionId]);

  // ── Persist ───────────────────────────────────────────────────────────────
  const performSave = useCallback(
    async (value: TransactionFormValues) => {
      // Soft confirms (kept imperative — they are not hard validation).
      if (value.reconciled) {
        const ok = await confirm(
          t("editReconciledTitle"),
          t("editReconciledMessage"),
          t("saveAnyway"),
          t("cancel"),
          true,
        );
        if (!ok) return;
      }
      const split = isSplitLines(value.splitLines);
      if (!value.categoryId && !split && !value.isTransfer) {
        const ok = await confirm(
          t("noCategoryTitle"),
          t("noCategoryMessage"),
          t("save"),
          t("cancel"),
        );
        if (!ok) return;
      }

      const input: SaveTransactionInput = {
        transactionId: isEdit ? transactionId : undefined,
        account: value.accountId!,
        date: value.date,
        amount: value.amount,
        type: value.type,
        payeeId: value.payeeId,
        payeeName: value.payeeName,
        categoryId: value.categoryId,
        notes: value.notes.trim() || null,
        cleared: value.cleared,
        splitCategories: split
          ? value.splitLines!.map((l) => ({
              id: l.id,
              categoryId: l.categoryId,
              categoryName: l.categoryName,
              amount: l.amount,
            }))
          : null,
        recurConfig: !isEdit ? value.recurConfig : undefined,
      };

      // Errors are reported to the bus by the global MutationCache.onError.
      await saveMutation.mutateAsync(input);
    },
    [isEdit, transactionId, saveMutation, t],
  );

  // ── Delete ──────────────────────────────────────────────────────────────
  const remove = useCallback(() => {
    if (!isEdit) return;
    const reconciled = form.getFieldValue("reconciled");
    Alert.alert(t("deleteTitle"), reconciled ? t("deleteReconciledMessage") : t("deleteConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        // Errors are reported to the bus by the global MutationCache.onError.
        onPress: () => deleteMutation.mutate(transactionId!),
      },
    ]);
  }, [isEdit, transactionId, form, deleteMutation, t]);

  // ── Picker-driven field actions (replace pickerStore for this flow) ───────
  const selectAccount = useCallback(
    (account: { id: string; name: string }) => {
      form.setFieldValue("accountId", account.id);
      form.setFieldValue("accountName", account.name);
      userOverrides.current.add("account");
    },
    [form],
  );

  const selectCategory = useCallback(
    (category: { id: string | null; name: string }) => {
      form.setFieldValue("categoryId", category.id);
      form.setFieldValue("categoryName", category.name);
      userOverrides.current.add("category");
      form.setFieldValue("splitLines", null);
    },
    [form],
  );

  const clearCategory = useCallback(() => {
    form.setFieldValue("categoryId", null);
    form.setFieldValue("categoryName", "");
  }, [form]);

  const selectPayee = useCallback(
    (payee: PayeeSelection) => {
      const isTransfer = !!payee.transferAcct;
      form.setFieldValue("payeeId", payee.id);
      form.setFieldValue("payeeName", payee.name);
      form.setFieldValue("isTransfer", isTransfer);

      if (isTransfer) {
        form.setFieldValue("categoryId", null);
        form.setFieldValue("categoryName", "");
        return;
      }
      // Auto-suggest a category from rules unless the user chose one.
      if (!userOverrides.current.has("category")) {
        const suggestedId = suggestCategoryForPayee(
          rules,
          payee.id,
          form.getFieldValue("accountId"),
        );
        if (suggestedId) {
          const cat = categories.find((c) => c.id === suggestedId);
          if (cat) {
            form.setFieldValue("categoryId", cat.id);
            form.setFieldValue("categoryName", cat.name);
          }
        }
      }
    },
    [form, rules, categories],
  );

  const setSplitLines = useCallback(
    (lines: SplitLineForm[] | null) => {
      form.setFieldValue("splitLines", lines);
      if (lines && lines.length > 0) {
        const total = lines.reduce((sum, l) => sum + l.amount, 0);
        if (form.getFieldValue("amount") === 0 && total > 0) {
          form.setFieldValue("amount", total);
        }
        if (lines.length > 1) {
          // A real split has no single category on the parent.
          form.setFieldValue("categoryId", null);
          form.setFieldValue("categoryName", "");
        }
      }
    },
    [form],
  );

  return {
    form,
    isEdit,
    rules,
    categories,
    accounts,
    actions: { selectAccount, selectCategory, clearCategory, selectPayee, setSplitLines },
    submit: () => form.handleSubmit(),
    remove,
    isSaving: saveMutation.isPending,
  };
}

function confirm(
  title: string,
  message: string,
  confirmLabel: string,
  cancelLabel: string,
  destructive = false,
): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: "cancel", onPress: () => resolve(false) },
        {
          text: confirmLabel,
          style: destructive ? "destructive" : "default",
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
