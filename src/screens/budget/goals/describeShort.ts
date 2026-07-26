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

/**
 * "monthly" instead of "each month" — one word where the full description
 * needs three, which is the whole point of this module. `describe.period.*`
 * holds nouns because they sit mid-sentence there; here the adverb stands
 * alone, so it gets its own key set.
 */
function recurrence(t: Translate, unit: "day" | "week" | "month" | "year"): string {
  return t(`budget:describeShort.recurrence.${unit}`);
}

/** Recurrences are stored as adverbs on limits; the unit is what we need. */
function limitUnit(period: "daily" | "weekly" | "monthly"): "day" | "week" | "month" {
  return period === "weekly" ? "week" : period === "daily" ? "day" : "month";
}

export function describeTemplateShort(tmpl: Template, t: Translate, locale: string = "en"): string {
  switch (tmpl.type) {
    case "simple": {
      // A cap with no contribution is a refill, and it keeps the noun: dropping
      // it would leave a bare "weekly" that reads exactly like a plain weekly
      // contribution, which is not what a refill does.
      if (tmpl.monthly == null && tmpl.limit) {
        return t("budget:describeShort.refillRecurrence", {
          recurrence: recurrence(t, limitUnit(tmpl.limit.period)),
        });
      }
      return recurrence(t, "month");
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
      const { period, amount } = tmpl.period;
      // Every single period is just the adverb; only a multiple needs spelling
      // out, and then the noun has to be plural.
      if (amount === 1) return recurrence(t, period);
      return t("budget:describeShort.everyN", {
        count: amount,
        period: t(`budget:describe.period.${period}s`),
      });
    }
    case "remainder":
      return t("budget:describeShort.remaining");
    case "refill":
      return t("budget:describeShort.refill");
    // Also keeps its noun: a bare "monthly" would read as money going in, when
    // a limit is the opposite — a ceiling on what goes out.
    case "limit":
      return t("budget:describeShort.limitRecurrence", {
        recurrence: recurrence(t, limitUnit(tmpl.period)),
      });
    case "schedule":
      return t("budget:describeShort.scheduled");
  }
}
