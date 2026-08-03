/**
 * useNewTransactionForm — the create/edit transaction form core.
 *
 * Owns TanStack Form state + Zod validation, hydrates in edit mode, and persists
 * through the domain `saveTransaction`. Failures are reported to the error bus
 * (`emitErrorEvent`); the visual feedback is deferred to a global bus consumer.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import { useLastTransactionStore } from "@/stores/lastTransactionStore";
import { resolveInitialAccount } from "../lib/initialAccount";
import { deleteTransaction } from "@/core/server/transactions";
import { loadTransactionWithSplitLines } from "@/screens/transactions/components/category-select/loadTransaction";
import { saveTransaction, type SaveTransactionInput } from "@/core/server/transactions/save";
import { suggestCategoryForPayee } from "@/core/server/transactions/transaction-rules";
import { todayInt } from "@/core/shared/months";
import type { Account } from "@/core/types/models";
import type { Category } from "@/core/types/models";
import type { Rule } from "@/core/server/rules/rule";
import {
  transactionFormSchema,
  isSplitLines,
  type TransactionFormValues,
} from "../validation/transactionForm.schema";
import type { SplitLineForm } from "@/ui/entity-select/types";

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

/** Blank form baseline; also the base the create-mode seeds are layered onto. */
function makeBaseline(): TransactionFormValues {
  return {
    type: "expense",
    amount: 0,
    accountId: null,
    accountName: "",
    payeeId: null,
    payeeName: "",
    isTransfer: false,
    categoryId: null,
    categoryName: "",
    date: todayInt(),
    notes: "",
    cleared: false,
    reconciled: false,
    recurConfig: null,
    splitLines: null,
  };
}

export function useNewTransactionForm({ accounts, categories, rules }: TransactionFormData) {
  const { t } = useTranslation("transactions");
  const router = useRouter();

  // Edit mode is entered by `initialize` (the leaf screen owns the URL params —
  // reading them here at provider-mount time sees the PREVIOUS route's params,
  // because expo-router's global routeInfo is only written by the leaf later).
  // The ref holds the id for async closures (save/delete); UI only needs the flag.
  const [isEdit, setIsEdit] = useState(false);
  const editingIdRef = useRef<string | null>(null);

  // Tracks fields the user set manually so auto-suggestions don't clobber them.
  const userOverrides = useRef<Set<string>>(new Set());

  // `initialize` runs once per screen and must see whatever accounts exist at
  // that moment without taking them as a dependency — a new array identity from
  // the liveQuery must never re-seed a form the user is already filling in.
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;

  // useForm re-applies its options' defaultValues on EVERY render when the form
  // isn't touched (form-core `update()`), and `form.reset(values)` moves the
  // internal defaults to `values` — so defaults must live in state and be
  // updated alongside every programmatic reset, or the next render silently
  // reverts the form to blank.
  const [defaultValues, setDefaultValues] = useState<TransactionFormValues>(makeBaseline);

  /** Whether edit hydration is in flight — the screen gates the form on it. */
  const [isHydrating, setIsHydrating] = useState(false);

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

  // ── Initialization (called once by the `new` leaf screen with ITS params) ─

  /** Programmatic reset that keeps useForm's option defaults in sync (see above). */
  const applyValues = useCallback(
    (values: TransactionFormValues) => {
      setDefaultValues(values);
      form.reset(values);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form],
  );

  const hydrateFromTransaction = useCallback(
    async (transactionId: string) => {
      try {
        const { txn, splitLines: loadedLines } = await loadTransactionWithSplitLines(transactionId);
        if (!txn) return;
        const splitLines: SplitLineForm[] | null = loadedLines.length > 0 ? loadedLines : null;

        applyValues({
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
      } finally {
        setIsHydrating(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyValues],
  );

  /**
   * Seed the form from the `new` screen's route params — edit hydration when
   * `transactionId` is present, create-mode seeds otherwise.
   *
   * Every call starts from a clean slate. This provider spans the whole
   * transaction stack, so it outlives any one `new` screen: pushing a second
   * one (the iOS shortcut does exactly that when the modal is already open)
   * used to find the form already initialised and leave it alone — which meant
   * the shortcut's params were dropped, and, far worse, `editingIdRef` still
   * pointed at the transaction being edited underneath, so saving the "new"
   * one overwrote it. Resetting here makes a second screen a second form.
   *
   * Calling it once per screen is the caller's job, and the `new` leaf's
   * mount-only effect does it. Pushing a picker doesn't re-initialise: pickers
   * are sibling routes, so `new` never unmounts and its effect never re-runs.
   */
  const initialize = useCallback(
    (params: NewTransactionParams) => {
      editingIdRef.current = null;
      userOverrides.current.clear();
      setIsEdit(false);

      if (params.transactionId) {
        editingIdRef.current = params.transactionId;
        setIsEdit(true);
        setIsHydrating(true);
        void hydrateFromTransaction(params.transactionId);
        return;
      }

      setIsHydrating(false);
      if (params.categoryId) userOverrides.current.add("category");
      // Only an account the caller asked for counts as the user's choice; the
      // remembered one is a suggestion and must not block the automations.
      if (params.accountId) userOverrides.current.add("account");

      const account = resolveInitialAccount({
        paramAccountId: params.accountId,
        paramAccountName: params.accountName,
        lastAccountId: useLastTransactionStore.getState().accountId,
        accounts: accountsRef.current,
      });

      applyValues({
        ...makeBaseline(),
        amount: params.amount ? Number(params.amount) : 0,
        accountId: account.accountId,
        accountName: account.accountName,
        payeeName: params.payeeName ?? "",
        categoryId: params.categoryId ?? null,
        categoryName: params.categoryName ?? "",
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyValues, hydrateFromTransaction],
  );

  /**
   * Fill in the account's name once the accounts arrive.
   *
   * An entry point may hand over an id alone (the shortcut can, and the FAB did
   * until it learned to pass the name), and the accounts it would be resolved
   * from come from a liveQuery that starts empty whenever the query cache has
   * no entry — which is any time a sync has touched the accounts table. Seeding
   * happens once, on mount, so without this the row keeps rendering blank: the
   * account IS selected and saving works, but nothing on screen says so.
   */
  useEffect(() => {
    const { accountId, accountName } = form.state.values;
    if (!accountId || accountName) return;
    const name = accounts.find((a) => a.id === accountId)?.name;
    if (name) form.setFieldValue("accountName", name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

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
        transactionId: editingIdRef.current ?? undefined,
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
        recurConfig: editingIdRef.current == null ? value.recurConfig : undefined,
      };

      // Errors are reported to the bus by the global MutationCache.onError.
      await saveMutation.mutateAsync(input);

      // Remember where a NEW transaction went, so the next one opened from a
      // screen that knows no account starts here. Editing an old transaction
      // says nothing about what you're doing now, so it doesn't count.
      if (editingIdRef.current == null) {
        useLastTransactionStore.getState().setLastAccount(value.accountId);
      }
    },
    [saveMutation, t],
  );

  // ── Delete ──────────────────────────────────────────────────────────────
  const remove = useCallback(() => {
    const transactionId = editingIdRef.current;
    if (transactionId == null) return;
    const reconciled = form.getFieldValue("reconciled");
    Alert.alert(t("deleteTitle"), reconciled ? t("deleteReconciledMessage") : t("deleteConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        // Errors are reported to the bus by the global MutationCache.onError.
        onPress: () => deleteMutation.mutate(transactionId),
      },
    ]);
  }, [form, deleteMutation, t]);

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
    isHydrating,
    initialize,
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
