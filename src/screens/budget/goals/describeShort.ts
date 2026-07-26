/**
 * A goal template in as few words as fit beside a category name.
 *
 * The rule that shapes every string here: **never repeat the amount**. This is
 * written for the plan editor's row, where the goal figure is already the line
 * above — saying "$1,200" twice wastes the only space there is. So the short
 * form carries the *shape* of the goal (when it recurs, what it's a share of,
 * what it's measured against), which is exactly what the figure can't say.
 *
 * Types with no fixed amount (`average`, `copy`, `remainder`, `schedule`) are
 * the ones whose full description was already shape-only, so their short form
 * is just a tighter phrasing of the same thing.
 *
 * For the full sentence — the goals card, the editor list — use
 * {@link describeTemplate} instead.
 */

import type { Template } from "@/core/types/models";
import type { Translate } from "./describe";

function formatMonth(yyyyMm: string, locale: string): string {
  const [year, month] = yyyyMm.split("-").map(Number);
  return new Date(year, month - 1).toLocaleDateString(locale, { month: "short", year: "numeric" });
}

/** Recurrences are stored as adverbs; the period key set holds nouns. */
function periodNoun(recurrence: "daily" | "weekly" | "monthly"): string {
  return recurrence === "weekly" ? "week" : recurrence === "daily" ? "day" : "month";
}

export function describeTemplateShort(tmpl: Template, t: Translate, locale: string = "en"): string {
  switch (tmpl.type) {
    case "simple": {
      // A cap with no contribution is a refill, and its period is the whole
      // point — a weekly cap behaves nothing like a monthly one.
      if (tmpl.monthly == null && tmpl.limit) {
        return t("budget:describeShort.upToEach", {
          period: t(`budget:describe.period.${periodNoun(tmpl.limit.period)}`),
        });
      }
      return t("budget:describeShort.monthly");
    }
    case "goal":
      return t("budget:describeShort.balanceTarget");
    case "by":
    case "spend": {
      const date = formatMonth(tmpl.month, locale);
      if (tmpl.type === "by" && tmpl.repeat) {
        if (tmpl.annual) return t("budget:describeShort.byDateYearly", { date });
        return t("budget:describeShort.byDateEveryN", { date, count: tmpl.repeat });
      }
      return t("budget:describeShort.byDate", { date });
    }
    case "percentage":
      return t("budget:describeShort.percentOfIncome", { percent: tmpl.percent });
    case "average":
      return t("budget:describeShort.averageMonths", { count: tmpl.numMonths });
    case "copy":
      return t("budget:describeShort.copyMonthsAgo", { count: tmpl.lookBack });
    case "periodic": {
      const p = tmpl.period.period;
      return t("budget:describeShort.everyPeriod", {
        count: tmpl.period.amount,
        period: t(`budget:describe.period.${tmpl.period.amount > 1 ? `${p}s` : p}`),
      });
    }
    case "remainder":
      return t("budget:describeShort.remaining");
    case "refill":
      return t("budget:describeShort.refill");
    case "limit":
      return t("budget:describeShort.limitPeriod", {
        period: t(`budget:describe.period.${periodNoun(tmpl.period)}`),
      });
    case "schedule":
      return t("budget:describeShort.scheduled");
  }
}
