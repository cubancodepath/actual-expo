/**
 * Human-readable description of a goal template.
 * Returns structured data (translation key + params) instead of hardcoded strings.
 * The UI layer is responsible for translating via i18next.
 */

import { formatBalance } from "@/lib/format";
import { amountToInteger } from "./engine";
import type { Template } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplateDescription {
  /** i18next translation key (e.g. 'budget:describe.saveBy') */
  key: string;
  /** Interpolation params for the translation key */
  params?: Record<string, string | number>;
  /** When set, the UI must translate this period key separately
   *  (e.g. 'week' → t('budget:describe.period.week')) and inject as `period` param */
  periodKey?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDisplayAmount(displayUnits: number): string {
  return formatBalance(amountToInteger(displayUnits));
}

function formatMonth(yyyyMm: string, locale: string): string {
  const [year, month] = yyyyMm.split("-").map(Number);
  return new Date(year, month - 1).toLocaleDateString(locale, { month: "short", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function describeTemplate(tmpl: Template, locale: string = "en"): TemplateDescription {
  switch (tmpl.type) {
    case "simple": {
      if (tmpl.monthly != null) {
        if (tmpl.limit?.amount) {
          return {
            key: "budget:describe.budgetMonthlyWithLimit",
            params: {
              amount: formatDisplayAmount(tmpl.monthly),
              limit: formatDisplayAmount(tmpl.limit.amount),
            },
          };
        }
        return {
          key: "budget:describe.budgetMonthly",
          params: { amount: formatDisplayAmount(tmpl.monthly) },
        };
      }
      return { key: "budget:describe.budgetMonthlyBase" };
    }
    case "goal":
      return {
        key: "budget:describe.reachBalance",
        params: { amount: formatDisplayAmount(tmpl.amount) },
      };
    case "by": {
      const baseParams = {
        amount: formatDisplayAmount(tmpl.amount),
        date: formatMonth(tmpl.month, locale),
      };
      if (tmpl.repeat) {
        if (tmpl.annual) {
          return {
            key: "budget:describe.saveByRepeatsAnnually",
            params: baseParams,
          };
        }
        return {
          key: "budget:describe.saveByEveryNMonths",
          params: { ...baseParams, count: tmpl.repeat },
        };
      }
      return { key: "budget:describe.saveBy", params: baseParams };
    }
    case "average": {
      if (tmpl.adjustment) {
        const sign = tmpl.adjustment > 0 ? "+" : "";
        const suffix = tmpl.adjustmentType === "percent" ? "%" : "";
        return {
          key: "budget:describe.averageOfLastWithAdjustment",
          params: { count: tmpl.numMonths, sign, value: tmpl.adjustment, suffix },
        };
      }
      return {
        key: "budget:describe.averageOfLast",
        params: { count: tmpl.numMonths },
      };
    }
    case "copy":
      return {
        key: "budget:describe.copyFrom",
        params: { count: tmpl.lookBack },
      };
    case "periodic": {
      const p = tmpl.period.period;
      const plural = tmpl.period.amount > 1 ? `${p}s` : p;
      return {
        key: "budget:describe.budgetEvery",
        params: { amount: formatDisplayAmount(tmpl.amount), periodAmount: tmpl.period.amount },
        periodKey: plural,
      };
    }
    case "spend":
      return {
        key: "budget:describe.spendBy",
        params: { amount: formatDisplayAmount(tmpl.amount), date: formatMonth(tmpl.month, locale) },
      };
    case "percentage": {
      const key = tmpl.previous
        ? "budget:describe.percentOfLastIncome"
        : "budget:describe.percentOfIncome";
      return { key, params: { percent: tmpl.percent } };
    }
    case "remainder": {
      if (tmpl.weight !== 1) {
        return {
          key: "budget:describe.fillRemainingWeight",
          params: { weight: tmpl.weight },
        };
      }
      return { key: "budget:describe.fillRemaining" };
    }
    case "refill":
      return { key: "budget:describe.refillToLimit" };
    case "limit": {
      const key = tmpl.hold ? "budget:describe.limitPeriodHold" : "budget:describe.limitPeriod";
      return {
        key,
        params: { amount: formatDisplayAmount(tmpl.amount) },
        periodKey: tmpl.period,
      };
    }
  }
}

/**
 * Helper to translate a TemplateDescription using a t() function.
 * Resolves periodKey sub-translations automatically.
 * Accepts any translation function compatible with i18next's TFunction.
 */
export function translateDescription(
  desc: TemplateDescription,
  t: (key: any, params?: any) => string,
): string {
  const params: Record<string, unknown> = { ...desc.params };
  if (desc.periodKey) {
    params.period = t(`budget:describe.period.${desc.periodKey}`);
  }
  return t(desc.key, params);
}
