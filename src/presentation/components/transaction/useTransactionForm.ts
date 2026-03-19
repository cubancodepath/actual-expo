import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAccounts } from "@/presentation/hooks/useAccounts";
import { deleteTransaction } from "@/transactions";
import { useCategories } from "@/presentation/hooks/useCategories";
import { usePickerStore } from "@/stores/pickerStore";
import { useRules } from "@/presentation/hooks/useRules";
import { getTransactionById, getChildTransactions } from "@/transactions";
import { saveTransaction } from "@/transactions/save";
import { getRecurringDescription } from "@/schedules";
import type { RecurConfig } from "@/schedules/types";
import { extractTagsFromNotes } from "@/tags";
import { suggestCategoryForPayee, applyRulesToForm } from "@/rules/apply";
import { findPayeeByName } from "@/payees";
import { todayInt, intToStr, strToInt } from "@/lib/date";
import { useErrorHandler } from "@/presentation/hooks/useErrorHandler";
import type { TransactionType } from "@/presentation/components/transaction/TypeToggle";

interface RouteParams {
  accountId?: string;
  accountName?: string;
  categoryId?: string;
  categoryName?: string;
  amount?: string;
  payeeName?: string;
  transactionId?: string;
}

interface AmountInput {
  cents: number;
  setCents: (v: number) => void;
}

export function useTransactionForm(params: RouteParams, amountInput: AmountInput) {
  const {
    accountId,
    accountName: accountNameParam,
    categoryId: categoryIdParam,
    categoryName: categoryNameParam,
    amount: amountParam,
    payeeName: payeeNameParam,
    transactionId,
  } = params;
  const { cents, setCents } = amountInput;

  const isEdit = !!transactionId;
  const { t } = useTranslation("transactions");
  const router = useRouter();
  const { accounts } = useAccounts();
  const { groups, categories } = useCategories();
  const { rules } = useRules();

  // Picker store subscriptions
  const selectedPayee = usePickerStore((s) => s.selectedPayee);
  const selectedCategory = usePickerStore((s) => s.selectedCategory);
  const selectedAccount = usePickerStore((s) => s.selectedAccount);
  const selectedTags = usePickerStore((s) => s.selectedTags);
  const selectedRecurConfig = usePickerStore((s) => s.selectedRecurConfig);
  const splitCategories = usePickerStore((s) => s.splitCategories);
  const setSplitCategories = usePickerStore((s) => s.setSplitCategories);
  const clearPicker = usePickerStore((s) => s.clear);

  const isSplit = splitCategories !== null && splitCategories.length > 1;

  // Resolve initial account from param
  const initialAccount = accounts.find((a) => a.id === accountId);

  const [type, setType] = useState<TransactionType>("expense");
  const [acctId, setAcctId] = useState<string | null>(accountId ?? null);
  const [acctName, setAcctName] = useState(accountNameParam ?? initialAccount?.name ?? "");
  const [payeeId, setPayeeId] = useState<string | null>(null);
  const [payeeName, setPayeeName] = useState(payeeNameParam ?? "");
  const [isTransfer, setIsTransfer] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(categoryIdParam ?? null);
  const [categoryName, setCategoryName] = useState(categoryNameParam ?? "");
  const [dateInt, setDateInt] = useState(todayInt());
  const [notes, setNotes] = useState("");
  const [cleared, setCleared] = useState(false);
  const [reconciled, setReconciled] = useState(false);
  const [recurConfig, setRecurConfig] = useState<RecurConfig | null>(null);
  const { error, setValidationError, dismissError } = useErrorHandler();
  const isInitialMount = useRef(true);
  const userOverrides = useRef<Set<string>>(new Set());

  const dateStr = intToStr(dateInt);

  // Reset form state only on initial mount (not when returning from pickers)
  useFocusEffect(
    useCallback(() => {
      if (!isInitialMount.current) return;
      isInitialMount.current = false;

      clearPicker();
      // liveQuery auto-loads categories/groups

      if (isEdit) {
        getTransactionById(transactionId!).then(async (txn) => {
          if (!txn) return;
          setType(txn.amount < 0 ? "expense" : "income");
          setCents(Math.abs(txn.amount));
          setAcctId(txn.account);
          const txnAccount = accounts.find((a) => a.id === txn.account);
          setAcctName(txnAccount?.name ?? "");
          setPayeeId(txn.payee);
          setPayeeName(txn.payeeName ?? "");
          setCategoryId(txn.category ?? null);
          setCategoryName(txn.categoryName ?? "");
          setDateInt(txn.date);
          setNotes(txn.notes ?? "");
          setCleared(txn.cleared);
          setReconciled(txn.reconciled);

          // Load split children for parent transactions
          if (txn.is_parent) {
            const children = await getChildTransactions(transactionId!);
            if (children.length > 0) {
              setSplitCategories(
                children.map((c) => ({
                  id: c.id,
                  categoryId: c.category,
                  categoryName: c.categoryName ?? "",
                  amount: Math.abs(c.amount),
                })),
              );
            }
          }
        });
      } else {
        // Reset to defaults for new transaction
        userOverrides.current = new Set();
        if (categoryIdParam) userOverrides.current.add("category");
        if (accountId) userOverrides.current.add("account");
        setType("expense");
        setCents(amountParam ? Number(amountParam) : 0);
        setAcctId(accountId ?? null);
        setAcctName(accountNameParam ?? initialAccount?.name ?? "");
        setPayeeId(null);
        setPayeeName(payeeNameParam ?? "");
        setIsTransfer(false);
        setCategoryId(categoryIdParam ?? null);
        setCategoryName(categoryNameParam ?? "");
        setDateInt(todayInt());
        setNotes("");
        setCleared(false);
        setReconciled(false);
        setRecurConfig(null);
        dismissError();
      }
    }, [transactionId]),
  );

  // When payeeName comes from a shortcut (no payeeId yet), look up the existing
  // payee in the DB so rules can suggest a category before the user saves.
  useEffect(() => {
    if (!payeeNameParam || payeeId || isEdit || userOverrides.current.has("category")) return;

    (async () => {
      const existingId = await findPayeeByName(payeeNameParam);
      if (!existingId) return; // New payee — no rules to apply

      setPayeeId(existingId);
      const suggestedId = suggestCategoryForPayee(rules, existingId, acctId);
      if (suggestedId) {
        const cat = categories.find((c) => c.id === suggestedId);
        if (cat) {
          setCategoryId(suggestedId);
          setCategoryName(cat.name);
        }
      }
    })();
  }, [payeeNameParam, rules]);

  // React to picker selections
  useEffect(() => {
    if (selectedPayee) {
      setPayeeId(selectedPayee.id);
      setPayeeName(selectedPayee.name);
      setIsTransfer(!!selectedPayee.transferAcct);

      // Auto-suggest category when payee changes (skip for transfers and user overrides)
      if (!selectedPayee.transferAcct && !userOverrides.current.has("category")) {
        const suggestedId = suggestCategoryForPayee(rules, selectedPayee.id, acctId);
        if (suggestedId) {
          const cat = categories.find((c) => c.id === suggestedId);
          if (cat) {
            setCategoryId(suggestedId);
            setCategoryName(cat.name);
          }
        }
      }
    }
  }, [selectedPayee]);

  useEffect(() => {
    if (selectedCategory) {
      setCategoryId(selectedCategory.id);
      setCategoryName(selectedCategory.name);
      userOverrides.current.add("category");
      // If user picks a single category, clear any split
      usePickerStore.getState().setSplitCategories(null);
    }
  }, [selectedCategory]);

  useEffect(() => {
    if (!splitCategories || splitCategories.length === 0) return;

    const splitTotal = splitCategories.reduce((sum, l) => sum + l.amount, 0);

    if (splitCategories.length === 1) {
      // Single line — treat as normal single-category transaction
      setCategoryId(splitCategories[0].categoryId);
      setCategoryName(splitCategories[0].categoryName);
      if (cents === 0 && splitTotal > 0) setCents(splitTotal);
      usePickerStore.getState().setSplitCategories(null);
    } else {
      // Multiple lines — update amount from split total if not set
      if (cents === 0 && splitTotal > 0) setCents(splitTotal);
    }
  }, [splitCategories]);

  useEffect(() => {
    if (selectedAccount) {
      setAcctId(selectedAccount.id);
      setAcctName(selectedAccount.name);
      userOverrides.current.add("account");
    }
  }, [selectedAccount]);

  useEffect(() => {
    if (selectedTags) {
      const plainNotes = notes.replace(/\s?(?<!#)#([^#\s]+)/g, "").trim();
      const tagSuffix = selectedTags.map((tag) => `#${tag}`).join(" ");
      setNotes(plainNotes ? `${plainNotes} ${tagSuffix}` : tagSuffix);
    }
  }, [selectedTags]);

  useEffect(() => {
    if (selectedRecurConfig) {
      setRecurConfig(selectedRecurConfig);
    }
  }, [selectedRecurConfig]);

  // Apply rules when amount/type changes (e.g. account rules based on amount)
  useEffect(() => {
    if (isEdit || rules.length === 0 || cents === 0) return;
    const signedAmount = type === "expense" ? -cents : cents;
    const result = applyRulesToForm(rules, {
      acct: acctId,
      payeeId,
      categoryId,
      amount: signedAmount,
      date: dateInt,
      notes,
      cleared,
    });
    if (result.acctId && result.acctId !== acctId && !userOverrides.current.has("account")) {
      const acc = accounts.find((a) => a.id === result.acctId);
      if (acc) {
        setAcctId(result.acctId);
        setAcctName(acc.name);
      }
    }
  }, [cents, type]);

  function performSave() {
    router.dismiss();
    // Fire-and-forget: DB write + store refresh in background
    saveTransaction(
      {
        transactionId: isEdit ? transactionId : undefined,
        account: acctId!,
        date: strToInt(dateStr) ?? dateInt,
        amount: cents,
        type,
        payeeId,
        payeeName,
        categoryId,
        notes: notes.trim() || null,
        cleared,
        splitCategories: isSplit ? splitCategories : null,
        recurConfig: !isEdit ? recurConfig : undefined,
      },
      rules,
    ).catch((err) => {
      if (__DEV__) console.warn("[performSave] failed:", err);
    });
  }

  function handleSave() {
    if (cents === 0) {
      setValidationError(t("enterAmount"));
      return;
    }
    if (!isEdit && !acctId) {
      setValidationError(t("selectAccount"));
      return;
    }

    if (reconciled) {
      Alert.alert(t("editReconciledTitle"), t("editReconciledMessage"), [
        { text: t("cancel"), style: "cancel" },
        { text: t("saveAnyway"), style: "destructive", onPress: performSave },
      ]);
      return;
    }

    if (!categoryId && !isSplit && !isTransfer) {
      Alert.alert(t("noCategoryTitle"), t("noCategoryMessage"), [
        { text: t("cancel"), style: "cancel" },
        { text: t("save"), onPress: performSave },
      ]);
      return;
    }

    performSave();
  }

  function handleDelete() {
    const message = reconciled ? t("deleteReconciledMessage") : t("deleteConfirm");

    Alert.alert(t("deleteTitle"), message, [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: () => {
          router.dismiss();
          deleteTransaction(transactionId!);
        },
      },
    ]);
  }

  return {
    // Form fields
    type,
    setType,
    acctId,
    acctName,
    payeeId,
    payeeName,
    isTransfer,
    categoryId,
    setCategoryId,
    categoryName,
    setCategoryName,
    dateInt,
    setDateInt,
    dateStr,
    notes,
    setNotes,
    cleared,
    setCleared,
    reconciled,
    recurConfig,
    setRecurConfig,
    splitCategories,
    setSplitCategories,
    isSplit,
    // Derived
    isEdit,
    // Actions
    handleSave,
    handleDelete,
    // Error
    error,
    dismissError,
    // Tags helper
    extractTagsFromNotes,
    // Schedule helper
    getRecurringDescription,
  };
}
