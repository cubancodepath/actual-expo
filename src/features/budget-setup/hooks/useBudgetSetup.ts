import { useCallback, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { usePrefsStore } from "@/stores/prefsStore";
import { getDefaultCategorySelection, seedLocalBudget } from "@/services/seedBudget";
import {
  ensureBudgetsDir,
  idFromBudgetName,
  getBudgetDir,
  writeMetadata,
} from "@/services/budgetMetadata";
import { openDatabase, closeDatabase } from "@core/db";
import { loadClock, fullSync } from "@core/sync";
import { uploadBudget, openBudget } from "@/services/budgetfiles";
import { toAppError, type AppError } from "@/errors";

export function useBudgetSetup(mode: "local" | "server") {
  const router = useRouter();
  const { t } = useTranslation("setup");

  const [budgetName, setBudgetName] = useState(t("budgetNamePlaceholder"));
  const [accountName, setAccountName] = useState(t("accountNamePlaceholder"));
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const creatingRef = useRef(false);

  const canCreate = budgetName.trim().length > 0 && accountName.trim().length > 0;

  const create = useCallback(async () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const name = budgetName.trim() || "My Budget";
      const account = accountName.trim() || "Checking";
      const budgetId = idFromBudgetName(name);

      await ensureBudgetsDir();
      await writeMetadata(budgetId, { id: budgetId, budgetName: name });
      await openDatabase(getBudgetDir(budgetId));
      await loadClock();

      await seedLocalBudget({
        accountName: account,
        startingBalance: balance,
        selectedCategories: getDefaultCategorySelection(),
      });

      let uploadResult: { cloudFileId: string; groupId: string } | null = null;
      if (mode === "server") {
        const { serverUrl, token } = usePrefsStore.getState();
        uploadResult = await uploadBudget(serverUrl, token, budgetId);
      }

      // Close raw DB, then openBudget which inits spreadsheet, queries, sync
      await closeDatabase();
      await openBudget(budgetId);

      // Setting prefs triggers Stack.Protected guard navigation
      if (mode === "local") {
        usePrefsStore.getState().setPrefs({ isLocalOnly: true });
      } else {
        usePrefsStore.getState().setPrefs({
          fileId: uploadResult?.cloudFileId ?? "",
          groupId: uploadResult?.groupId ?? "",
          isLocalOnly: false,
        });
        fullSync().catch(console.warn);
      }
    } catch (e) {
      creatingRef.current = false;
      setError(toAppError(e));
      setLoading(false);
    }
  }, [budgetName, accountName, balance, mode]);

  const dismissError = useCallback(() => setError(null), []);

  return {
    budgetName,
    setBudgetName,
    accountName,
    setAccountName,
    balance,
    setBalance,
    loading,
    error,
    canCreate,
    create,
    dismissError,
  };
}
