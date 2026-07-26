/**
 * A goal template in plain language.
 *
 * Upstream's counterpart is `TemplateSentence.tsx`, a component per template
 * type. This is one pure function instead — it keeps running under vitest's
 * node environment, which never sees a `.test.tsx`.
 *
 * It takes `t` rather than returning a key/params pair for the caller to
 * translate: that indirection only existed because the file used to live in
 * core, where react-i18next is off limits.
 */

import { integerToCurrency } from "@/core/shared/util";
import { amountToInteger } from "@/core/server/budget/category-template-context";
import type { Template } from "@/core/types/models";

/** Structurally compatible with i18next's TFunction. */
export type Translate = (key: any, params?: any) => string;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDisplayAmount(displayUnits: number): string {
  return integerToCurrency(amountToInteger(displayUnits));
}

function formatMonth(yyyyMm: string, locale: string): string {
  const [year, month] = yyyyMm.split("-").map(Number);
  return new Date(year, month - 1).toLocaleDateString(locale, { month: "short", year: "numeric" });
}

/** Periods are their own key set, so they read right inside a sentence. */
function period(t: Translate, key: string): string {
  return t(`budget:describe.period.${key}`);
}

/**
 * Recurrences are stored as adverbs ("monthly") but the period key set holds
 * nouns ("month"), because that is what reads right mid-sentence.
 */
function periodNoun(recurrence: "daily" | "weekly" | "monthly"): string {
  return recurrence === "weekly" ? "week" : recurrence === "daily" ? "day" : "month";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function describeTemplate(tmpl: Template, t: Translate, locale: string = "en"): string {
  switch (tmpl.type) {
    case "simple": {
      if (tmpl.monthly != null) {
        if (tmpl.limit?.amount) {
          return t("budget:describe.budgetMonthlyWithLimit", {
            amount: formatDisplayAmount(tmpl.monthly),
            limit: formatDisplayAmount(tmpl.limit.amount),
          });
        }
        return t("budget:describe.budgetMonthly", {
          amount: formatDisplayAmount(tmpl.monthly),
        });
      }
      if (tmpl.limit) {
        // No contribution, only a cap: refill up to the cap each period.
        return t("budget:describe.refillUpTo", {
          amount: formatDisplayAmount(tmpl.limit.amount),
          period: period(t, periodNoun(tmpl.limit.period)),
        });
      }
      return t("budget:describe.budgetMonthlyBase");
    }
    case "goal":
      return t("budget:describe.reachBalance", { amount: formatDisplayAmount(tmpl.amount) });
    case "by": {
      const baseParams = {
        amount: formatDisplayAmount(tmpl.amount),
        date: formatMonth(tmpl.month, locale),
      };
      if (tmpl.repeat) {
        if (tmpl.annual) {
          return t("budget:describe.saveByRepeatsAnnually", baseParams);
        }
        return t("budget:describe.saveByEveryNMonths", { ...baseParams, count: tmpl.repeat });
      }
      return t("budget:describe.saveBy", baseParams);
    }
    case "average": {
      if (tmpl.adjustment) {
        const sign = tmpl.adjustment > 0 ? "+" : "";
        const suffix = tmpl.adjustmentType === "percent" ? "%" : "";
        return t("budget:describe.averageOfLastWithAdjustment", {
          count: tmpl.numMonths,
          sign,
          value: tmpl.adjustment,
          suffix,
        });
      }
      return t("budget:describe.averageOfLast", { count: tmpl.numMonths });
    }
    case "copy":
      return t("budget:describe.copyFrom", { count: tmpl.lookBack });
    case "periodic": {
      const p = tmpl.period.period;
      const plural = tmpl.period.amount > 1 ? `${p}s` : p;
      return t("budget:describe.budgetEvery", {
        amount: formatDisplayAmount(tmpl.amount),
        periodAmount: tmpl.period.amount,
        period: period(t, plural),
      });
    }
    case "spend":
      return t("budget:describe.spendBy", {
        amount: formatDisplayAmount(tmpl.amount),
        date: formatMonth(tmpl.month, locale),
      });
    case "percentage":
      return t(
        tmpl.previous ? "budget:describe.percentOfLastIncome" : "budget:describe.percentOfIncome",
        { percent: tmpl.percent },
      );
    case "remainder": {
      if (tmpl.weight !== 1) {
        return t("budget:describe.fillRemainingWeight", { weight: tmpl.weight });
      }
      return t("budget:describe.fillRemaining");
    }
    case "refill":
      return t("budget:describe.refillToLimit");
    case "limit":
      return t(tmpl.hold ? "budget:describe.limitPeriodHold" : "budget:describe.limitPeriod", {
        amount: formatDisplayAmount(tmpl.amount),
        period: period(t, periodNoun(tmpl.period)),
      });
    case "schedule":
      return t("budget:describe.linkedToSchedule");
  }
}
