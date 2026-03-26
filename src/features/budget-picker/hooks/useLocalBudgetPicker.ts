import { useCallback, useEffect, useState } from "react";
import { Alert as RNAlert } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { toAppError, type AppError } from "@/errors";
import { usePrefsStore } from "@/stores/prefsStore";
import { listLocalBudgets, type BudgetMetadata } from "@/services/budgetMetadata";
import { openBudget, deleteBudget } from "@/services/budgetfiles";
import { triggerHaptic } from "@/lib/haptics";

export function useLocalBudgetPicker() {
  const router = useRouter();
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation("common");

  const [budgets, setBudgets] = useState<BudgetMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<{ name: string } | null>(null);

  const hasBudgets = budgets.length > 0;

  const fetchBudgets = useCallback(async () => {
    try {
      const list = await listLocalBudgets();
      setBudgets(list);
    } catch (e) {
      setError(toAppError(e));
    }
  }, []);

  const doFetch = useCallback(
    (setFlag: (v: boolean) => void) => {
      setFlag(true);
      setError(null);
      fetchBudgets().finally(() => setFlag(false));
    },
    [fetchBudgets],
  );

  useEffect(() => {
    doFetch(setLoading);
  }, [doFetch]);

  const handleSelect = useCallback(async (meta: BudgetMetadata) => {
    triggerHaptic("light");
    setSelecting(meta.id);
    setOverlay({ name: meta.budgetName });
    try {
      await openBudget(meta.id);
      usePrefsStore.getState().setPrefs({
        isLocalOnly: true,
        activeBudgetId: meta.id,
        budgetName: meta.budgetName,
      });
    } catch (e) {
      setError(toAppError(e));
      setSelecting(null);
      setOverlay(null);
    }
  }, []);

  const handleDelete = useCallback(
    (meta: BudgetMetadata) => {
      const name = meta.budgetName || t("unnamedBudget");
      RNAlert.alert(t("deleteBudget"), t("deleteBudgetLocal", { name }), [
        { text: tc("cancel"), style: "cancel" },
        {
          text: tc("delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteBudget(meta.id);
              await fetchBudgets();
            } catch (e) {
              setError(toAppError(e));
            }
          },
        },
      ]);
    },
    [t, tc, fetchBudgets],
  );

  const handleNew = useCallback(() => {
    router.push("/(public)/new-local-budget");
  }, [router]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const refresh = useCallback(() => doFetch(setRefreshing), [doFetch]);
  const dismissError = useCallback(() => setError(null), []);

  return {
    budgets,
    loading,
    refreshing,
    error,
    selecting,
    overlay,
    hasBudgets,
    handleSelect,
    handleDelete,
    handleNew,
    handleBack,
    refresh,
    dismissError,
  };
}
