import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCategories } from "@/features/budget/hooks/useCategories";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import type { CurrencyInputRef } from "@/features/transactions/components/currency-input";
import { getGoalTemplates, setGoalTemplates } from "@/core/domain/goals";
import { updateGoalIndicator } from "@/core/domain/goals/apply";
import { amountToInteger, integerToAmount } from "@/core/domain/goals/engine";
import { batchMessages } from "@/core/sync";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import type { Template } from "@/core/domain/goals/types";

// ---------------------------------------------------------------------------
// Types + shared constants/helpers (used by both the hook and the screen)
// ---------------------------------------------------------------------------

export type GoalType =
  | "simple"
  | "goal"
  | "by"
  | "average"
  | "copy"
  | "periodic"
  | "spend"
  | "percentage"
  | "remainder"
  | "limit";

export const AVG_VALUES = [3, 6, 12];

export function dateToInt(d: Date): number {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return parseInt(`${y}${m}${day}`, 10);
}

function getDefaultTargetDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 6, 1);
}

function dateToMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Hook — owns all goal-editor form state, loading, and persistence
// ---------------------------------------------------------------------------

export interface UseGoalEditorArgs {
  categoryId: string;
  dismissCount?: string;
}

export function useGoalEditor({ categoryId, dismissCount }: UseGoalEditorArgs) {
  const { t } = useTranslation("budget");
  const router = useRouter();
  const dismiss = () => router.dismiss(Number(dismissCount) || 1);

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const currencyInputRef = useRef<CurrencyInputRef>(null);
  // Common state
  const [goalType, setGoalType] = useState<GoalType>("simple");
  const [amountCents, setAmountCents] = useState(0);

  // Simple-specific: "set aside" (false) vs "refill to" (true)
  const [simpleRefill, setSimpleRefill] = useState(false);
  const [capEnabled, setCapEnabled] = useState(false);
  const [capCents, setCapCents] = useState(0);

  // By-specific
  const [targetDate, setTargetDate] = useState<Date>(getDefaultTargetDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [byRepeat, setByRepeat] = useState(false);

  // Average-specific
  const [avgIndex, setAvgIndex] = useState(0);

  // Copy-specific
  const [lookBack, setLookBack] = useState(1);

  // Periodic-specific
  const [periodicPeriod, setPeriodicPeriod] = useState<"day" | "week" | "month" | "year">("month");
  const [periodicInterval, setPeriodicInterval] = useState(1);
  const [periodicStart, setPeriodicStart] = useState<Date | null>(null);
  const [showPeriodicStartPicker, setShowPeriodicStartPicker] = useState(false);

  // Spend-specific
  const [spendFromDate, setSpendFromDate] = useState<Date>(() => new Date());
  const [spendToDate, setSpendToDate] = useState<Date>(getDefaultTargetDate);
  const [showSpendFromPicker, setShowSpendFromPicker] = useState(false);
  const [showSpendToPicker, setShowSpendToPicker] = useState(false);
  const [spendRepeat, setSpendRepeat] = useState(false);

  // Percentage-specific
  const [percent, setPercent] = useState(10);
  const [percentCategory, setPercentCategory] = useState("all-income");
  const [percentPrevious, setPercentPrevious] = useState(false);

  // Remainder-specific
  const [weight, setWeight] = useState(1);

  // Limit-specific
  const [limitPeriod, setLimitPeriod] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [limitHold, setLimitHold] = useState(false);
  const [limitRefill, setLimitRefill] = useState(false);

  // Income categories for percentage picker
  const { categories, groups } = useCategories();
  const incomeCategories = categories.filter((c) => {
    const group = groups.find((g) => g.id === c.cat_group);
    return group?.is_income && !c.tombstone;
  });

  // Load existing template
  useEffect(() => {
    if (!categoryId) return;
    (async () => {
      const templates = await getGoalTemplates(categoryId);
      if (templates.length === 0) return;
      setIsEditing(true);

      // Detect refill templates — these map to Monthly with refill toggle:
      // - `simple` with `limit` but no `monthly` (#template up to X)
      // - legacy `[limit, refill]` pair from older Expo saves
      const simpleWithLimitOnly = templates.find(
        (t): t is import("@/core/domain/goals/types").SimpleTemplate =>
          t.type === "simple" && !!t.limit && t.monthly == null,
      );
      if (simpleWithLimitOnly?.limit) {
        setGoalType("simple");
        setAmountCents(amountToInteger(simpleWithLimitOnly.limit.amount));
        setSimpleRefill(true);
        return;
      }

      // Legacy: [limit, refill] pair → convert to Monthly+refill
      const hasRefill = templates.some((t) => t.type === "refill");
      const limitT = templates.find((t) => t.type === "limit");
      if (hasRefill && limitT) {
        setGoalType("simple");
        setAmountCents(amountToInteger(limitT.amount));
        setSimpleRefill(true);
        return;
      }

      const tmpl = templates[0];
      // "schedule" goals aren't editable from this screen yet (no schedule
      // picker UI) — same no-op treatment as refill/limit, which also have
      // no dedicated editor here.
      if (tmpl.type === "refill" || tmpl.type === "limit" || tmpl.type === "schedule") return;
      setGoalType(tmpl.type);

      switch (tmpl.type) {
        case "simple":
          setAmountCents(tmpl.monthly != null ? amountToInteger(tmpl.monthly) : 0);
          if (tmpl.limit) {
            setCapEnabled(true);
            setCapCents(amountToInteger(tmpl.limit.amount));
          }
          break;
        case "goal":
          setAmountCents(amountToInteger(tmpl.amount));
          break;
        case "by": {
          setAmountCents(amountToInteger(tmpl.amount));
          const [y, m] = tmpl.month.split("-").map(Number);
          setTargetDate(new Date(y, m - 1, 1));
          if (tmpl.repeat) setByRepeat(true);
          break;
        }
        case "average":
          setAvgIndex(AVG_VALUES.indexOf(tmpl.numMonths));
          break;
        case "copy":
          setLookBack(tmpl.lookBack);
          break;
        case "periodic":
          setAmountCents(amountToInteger(tmpl.amount));
          setPeriodicPeriod(tmpl.period.period);
          setPeriodicInterval(tmpl.period.amount);
          if (tmpl.starting) setPeriodicStart(new Date(tmpl.starting));
          break;
        case "spend": {
          setAmountCents(amountToInteger(tmpl.amount));
          const [ty, tm] = tmpl.month.split("-").map(Number);
          setSpendToDate(new Date(ty, tm - 1, 1));
          const [fy, fm] = tmpl.from.split("-").map(Number);
          setSpendFromDate(new Date(fy, fm - 1, 1));
          if (tmpl.repeat) setSpendRepeat(true);
          break;
        }
        case "percentage":
          setPercent(tmpl.percent);
          setPercentCategory(tmpl.category);
          setPercentPrevious(tmpl.previous);
          break;
        case "remainder":
          setWeight(tmpl.weight);
          break;
      }
    })();
  }, [categoryId]);

  function buildTemplates(): Template[] {
    const displayAmount = integerToAmount(amountCents);

    switch (goalType) {
      case "simple":
        if (simpleRefill) {
          // "#template up to X" — refill to amount
          return [
            {
              type: "simple",
              limit: { amount: displayAmount, hold: false, period: "monthly" as const },
              priority: 0,
              directive: "template" as const,
            },
          ];
        }
        // "#template X" or "#template X up to Y" — fixed monthly with optional balance cap
        if (capEnabled && capCents > 0) {
          return [
            {
              type: "simple",
              monthly: displayAmount,
              limit: { amount: integerToAmount(capCents), hold: false, period: "monthly" as const },
              priority: 0,
              directive: "template" as const,
            },
          ];
        }
        return [{ type: "simple", monthly: displayAmount, priority: 0, directive: "template" }];
      case "goal":
        return [{ type: "goal", amount: displayAmount, directive: "goal" }];
      case "by":
        return [
          {
            type: "by",
            amount: displayAmount,
            month: dateToMonth(targetDate),
            ...(byRepeat ? { repeat: 12, annual: true } : {}),
            priority: 0,
            directive: "template",
          },
        ];
      case "average":
        return [
          { type: "average", numMonths: AVG_VALUES[avgIndex], priority: 0, directive: "template" },
        ];
      case "copy":
        return [{ type: "copy", lookBack, priority: 0, directive: "template" }];
      case "periodic":
        return [
          {
            type: "periodic",
            amount: displayAmount,
            period: { period: periodicPeriod, amount: periodicInterval },
            ...(periodicStart ? { starting: periodicStart.toISOString().slice(0, 10) } : {}),
            priority: 0,
            directive: "template",
          },
        ];
      case "spend":
        return [
          {
            type: "spend",
            amount: displayAmount,
            month: dateToMonth(spendToDate),
            from: dateToMonth(spendFromDate),
            ...(spendRepeat ? { repeat: 12, annual: true } : {}),
            priority: 0,
            directive: "template",
          },
        ];
      case "percentage":
        return [
          {
            type: "percentage",
            percent,
            previous: percentPrevious,
            category: percentCategory,
            priority: 0,
            directive: "template",
          },
        ];
      case "remainder":
        return [{ type: "remainder", weight, directive: "template" }];
      case "limit": {
        // Pure spending cap: "#template 0 up to X" — no auto-budgeting
        return [
          {
            type: "simple" as const,
            monthly: 0,
            limit: { amount: displayAmount, hold: limitHold, period: limitPeriod },
            priority: 0,
            directive: "template" as const,
          },
        ];
      }
    }
  }

  const canSave = (() => {
    switch (goalType) {
      case "simple":
        if (capEnabled) return amountCents > 0 && capCents > amountCents;
        return amountCents > 0;
      case "goal":
      case "by":
      case "periodic":
      case "spend":
      case "limit":
        return amountCents > 0;
      case "percentage":
        return percent > 0;
      case "average":
      case "copy":
      case "remainder":
        return true;
    }
  })();

  async function handleSave() {
    if (!categoryId || saving) return;
    setSaving(true);
    try {
      const catNames = new Map(categories.map((c) => [c.id, c.name]));
      await batchMessages(async () => {
        await setGoalTemplates(categoryId, buildTemplates(), catNames);
      });
      // Update goal indicator AFTER batchMessages so it reads the fresh goal_def
      await updateGoalIndicator(useBudgetUIStore.getState().month, categoryId);
      dismiss();
    } catch (e) {
      emitErrorEvent(e);
      Alert.alert(t("couldNotSaveTitle"), t("couldNotSaveMessage"));
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!categoryId) return;
    Alert.alert(t("removeTargetTitle"), t("removeTargetMessage"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("remove"),
        style: "destructive",
        onPress: async () => {
          try {
            await setGoalTemplates(categoryId, []);
            dismiss();
          } catch (e) {
            emitErrorEvent(e);
            Alert.alert(t("errorTitle"), t("couldNotRemoveTarget"));
          }
        },
      },
    ]);
  }

  return {
    // meta / actions
    isEditing,
    saving,
    canSave,
    currencyInputRef,
    incomeCategories,
    dismiss,
    handleSave,
    handleDelete,
    // common
    goalType,
    setGoalType,
    amountCents,
    setAmountCents,
    // simple
    simpleRefill,
    setSimpleRefill,
    capEnabled,
    setCapEnabled,
    capCents,
    setCapCents,
    // by
    targetDate,
    setTargetDate,
    showDatePicker,
    setShowDatePicker,
    byRepeat,
    setByRepeat,
    // average
    avgIndex,
    setAvgIndex,
    // copy
    lookBack,
    setLookBack,
    // periodic
    periodicPeriod,
    setPeriodicPeriod,
    periodicInterval,
    setPeriodicInterval,
    periodicStart,
    setPeriodicStart,
    showPeriodicStartPicker,
    setShowPeriodicStartPicker,
    // spend
    spendFromDate,
    setSpendFromDate,
    spendToDate,
    setSpendToDate,
    showSpendFromPicker,
    setShowSpendFromPicker,
    showSpendToPicker,
    setShowSpendToPicker,
    spendRepeat,
    setSpendRepeat,
    // percentage
    percent,
    setPercent,
    percentCategory,
    setPercentCategory,
    percentPrevious,
    setPercentPrevious,
    // remainder
    weight,
    setWeight,
    // limit
    limitPeriod,
    setLimitPeriod,
    limitHold,
    setLimitHold,
    limitRefill,
    setLimitRefill,
  };
}
