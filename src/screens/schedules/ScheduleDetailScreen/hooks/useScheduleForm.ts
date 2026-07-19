/**
 * useScheduleForm — the edit-schedule form core.
 *
 * Mirrors useNewTransactionForm's shape (TanStack Form + hydrate + persist) but
 * for schedules: amount with an operator + optional range, name, payee/account/
 * category, recurrence and the auto-post toggle. Shared with the schedule
 * pickers through ScheduleFormProvider so they write to one form instance.
 */

import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import {
  getScheduleById,
  updateSchedule,
  deleteSchedule,
  postTransactionForSchedule,
  skipNextDate,
} from "@/core/domain/schedules";
import type { RecurConfig } from "@/core/domain/schedules/types";
import type { Account } from "@/core/domain/accounts/types";
import type { Category } from "@/core/domain/categories/types";
import type { Payee } from "@/core/domain/payees/types";
import { useUndoStore } from "@/stores/undoStore";
import {
  buildScheduleSaveRule,
  makeScheduleFormBaseline,
  scheduleToFormValues,
} from "./scheduleForm.logic";

export type ScheduleType = "expense" | "income";
export type AmountOp = "is" | "isapprox" | "isbetween";

export type ScheduleFormValues = {
  type: ScheduleType;
  amountOp: AmountOp;
  amount: number; // num1, unsigned cents
  amountUpper: number; // num2, unsigned cents (range only)
  name: string;
  accountId: string | null;
  accountName: string;
  payeeId: string | null;
  payeeName: string;
  categoryId: string | null;
  categoryName: string;
  recurConfig: RecurConfig | null;
  oneTimeDate: string | null;
  postsTransaction: boolean;
};

type ScheduleFormData = { accounts: Account[]; categories: Category[]; payees: Payee[] };

export function useScheduleForm({ accounts, categories, payees }: ScheduleFormData) {
  const { t } = useTranslation(["schedules", "common"]);
  const router = useRouter();

  const scheduleIdRef = useRef<string | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const [defaultValues, setDefaultValues] = useState<ScheduleFormValues>(makeScheduleFormBaseline);

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      await performSave(value);
    },
  });

  const applyValues = useCallback(
    (values: ScheduleFormValues) => {
      setDefaultValues(values);
      form.reset(values);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form],
  );

  const initialize = useCallback(
    (id: string) => {
      // The provider persists across picker navigation and across schedules;
      // (re)hydrate only when the target schedule changes.
      if (scheduleIdRef.current === id) return;
      scheduleIdRef.current = id;
      setIsHydrating(true);
      (async () => {
        try {
          const s = await getScheduleById(id);
          if (!s) return;

          applyValues(scheduleToFormValues(s, { accounts, categories, payees }));
        } catch (e) {
          emitErrorEvent(e, { operation: "schedule.hydrate" });
        } finally {
          setIsHydrating(false);
        }
      })();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyValues, accounts, categories, payees],
  );

  // ── Picker-driven field actions (shared form, no pickerStore) ─────────────
  const selectAccount = useCallback(
    (account: { id: string; name: string }) => {
      form.setFieldValue("accountId", account.id);
      form.setFieldValue("accountName", account.name);
    },
    [form],
  );
  const selectPayee = useCallback(
    (payee: { id: string | null; name: string }) => {
      form.setFieldValue("payeeId", payee.id);
      form.setFieldValue("payeeName", payee.name);
    },
    [form],
  );
  const selectCategory = useCallback(
    (category: { id: string; name: string }) => {
      form.setFieldValue("categoryId", category.id);
      form.setFieldValue("categoryName", category.name);
    },
    [form],
  );
  const clearCategory = useCallback(() => {
    form.setFieldValue("categoryId", null);
    form.setFieldValue("categoryName", "");
  }, [form]);

  // ── Persistence ───────────────────────────────────────────────────────────
  async function performSave(v: ScheduleFormValues) {
    const id = scheduleIdRef.current;
    if (!id || !v.accountId) return;

    const { conditions, actions } = buildScheduleSaveRule(v);

    await updateSchedule({
      schedule: { id, name: v.name.trim() || null, posts_transaction: v.postsTransaction },
      conditions,
      actions,
      resetNextDate: true,
    });
  }

  const saveMutation = useMutation({
    mutationFn: () => form.handleSubmit(),
    onSuccess: () => router.dismiss(),
  });

  // ── Schedule actions ──────────────────────────────────────────────────────
  const withSchedule = (fn: (id: string) => void) => {
    const id = scheduleIdRef.current;
    if (id) fn(id);
  };

  const post = useCallback(() => {
    withSchedule((id) =>
      Alert.alert(t("postTransactionNow"), t("postTransactionConfirm"), [
        { text: t("cancel", { ns: "common" }), style: "cancel" },
        {
          text: t("post"),
          onPress: async () => {
            await postTransactionForSchedule(id);
            useUndoStore.getState().showUndo(t("transactionPosted"));
          },
        },
      ]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const skip = useCallback(() => {
    withSchedule((id) =>
      Alert.alert(t("skipNextDate"), t("skipNextDateConfirm"), [
        { text: t("cancel", { ns: "common" }), style: "cancel" },
        {
          text: t("skip"),
          onPress: async () => {
            await skipNextDate(id);
            useUndoStore.getState().showUndo(t("dateSkipped"));
          },
        },
      ]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const complete = useCallback(() => {
    withSchedule((id) =>
      Alert.alert(t("completeSchedule"), t("completeConfirm"), [
        { text: t("cancel", { ns: "common" }), style: "cancel" },
        {
          text: t("complete"),
          onPress: async () => {
            await updateSchedule({ schedule: { id, completed: true } });
            router.dismiss();
          },
        },
      ]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, router]);

  const remove = useCallback(() => {
    withSchedule((id) =>
      Alert.alert(t("deleteSchedule"), t("deleteCannotUndo"), [
        { text: t("cancel", { ns: "common" }), style: "cancel" },
        {
          text: t("delete", { ns: "common" }),
          style: "destructive",
          onPress: async () => {
            await deleteSchedule(id);
            useUndoStore.getState().showUndo(t("scheduleDeleted"));
            router.dismiss();
          },
        },
      ]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, router]);

  return {
    form,
    isHydrating,
    initialize,
    accounts,
    categories,
    payees,
    actions: { selectAccount, selectPayee, selectCategory, clearCategory },
    submit: () => saveMutation.mutate(),
    isSaving: saveMutation.isPending,
    post,
    skip,
    complete,
    remove,
  };
}
