/**
 * The "recurring amount" (fixed) goal, as the editor thinks about it.
 *
 * The editor speaks in user terms — a weekday, a day of the month, a month of
 * the year, and whether next period should ADD the amount ("set aside") or
 * TOP UP to it ("refill"). Storage speaks standard Actual templates. This
 * module is the bridge, and the reason nothing here breaks compatibility:
 *
 * | segment  | set aside (start over)                     | refill up to (keep building)          |
 * |----------|--------------------------------------------|---------------------------------------|
 * | weekly   | periodic{week,1, starting=<weekday date>}  | simple{limit:{weekly, start}}         |
 * | monthly  | periodic{month,1, starting=<day date>}     | simple{limit:{monthly}}               |
 * | yearly   | periodic{year,1, starting=<date>} — the    | by{month, annual, repeat:1} — spreads |
 * |          | full amount lands when the date arrives    | toward the date, counting the balance |
 * | custom   | periodic{N unit} edited raw                | —                                     |
 *
 * The chosen day rides inside real dates: `starting`'s weekday IS the chosen
 * weekday, its day-of-month IS the chosen day. Desktop reads all of it as-is.
 *
 * Pure — no native or React dependencies, safe to unit test in Node.
 */

import { currentMonth } from "@/core/shared/months";
import type {
  ByTemplate,
  PeriodicTemplate,
  SimpleTemplate,
  SpendTemplate,
  Template,
} from "@/core/types/models";

export type FixedMode = "setAside" | "refill" | "spend";

export type RepeatUnit = "day" | "week" | "month" | "year";

export type CustomRepeat = { unit: RepeatUnit; interval: number };

export type FixedGoalConfig =
  | { segment: "weekly"; mode: FixedMode; amountCents: number; weekday: number } // 0=Sunday … 6=Saturday
  | {
      segment: "monthly";
      mode: FixedMode;
      amountCents: number;
      dayOfMonth: number; // 1–31
      /** Refill only: keep leftover money instead of releasing it. */
      hold?: boolean;
    }
  | { segment: "yearly"; mode: FixedMode; amountCents: number; date: string } // YYYY-MM-DD
  | {
      segment: "custom";
      mode: FixedMode;
      amountCents: number;
      /** YYYY-MM-DD. Month-granular in refill/spend mode (by and spend store no day). */
      dueDate: string;
      /** Spend mode only: start of the spending window, YYYY-MM-DD. */
      from?: string;
      /** null = one shot. */
      repeat: CustomRepeat | null;
    };

/**
 * How far each unit's interval may go. Weeks stop at 12 — past a quarter
 * people think in months, and the wheel stays short enough to spin.
 */
export const REPEAT_MAX: Record<RepeatUnit, number> = {
  day: 30,
  week: 12,
  month: 11,
  year: 2,
};

export type FixedTemplate = PeriodicTemplate | SimpleTemplate | ByTemplate | SpendTemplate;

// ---------------------------------------------------------------------------
// Date helpers ("YYYY-MM-DD" strings, local time)
// ---------------------------------------------------------------------------

function toDayString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDay(day: string): Date | null {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** 0=Sunday … 6=Saturday, or null when the string doesn't parse. */
export function weekdayOf(day: string | undefined): number | null {
  if (!day) return null;
  return parseDay(day)?.getDay() ?? null;
}

export function dayOfMonthOf(day: string | undefined): number | null {
  if (!day) return null;
  return parseDay(day)?.getDate() ?? null;
}

/** Next date (today included) that falls on the given weekday. */
export function nextDateForWeekday(weekday: number, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7));
  return toDayString(d);
}

/**
 * Next date (today included) with the given day of month. Months too short
 * for the day are skipped — "every 31st" lands on months that have a 31st,
 * which is also how the engine's own occurrence counting sees it.
 */
export function nextDateForDayOfMonth(dayOfMonth: number, from: Date = new Date()): string {
  for (let offset = 0; offset < 12; offset++) {
    const d = new Date(from.getFullYear(), from.getMonth() + offset, dayOfMonth);
    // A rolled-over date (Feb 31 → Mar 3) means the month was too short.
    if (d.getDate() !== dayOfMonth) continue;
    if (offset === 0 && d.getDate() < from.getDate()) continue;
    return toDayString(d);
  }
  // Unreachable for valid 1–31 input, but keep a sane fallback.
  return toDayString(from);
}

/** Next "YYYY-MM" (this month included) whose month-of-year is `month` (1–12). */
export function nextYearMonth(month: number, from: Date = new Date()): string {
  const year = from.getMonth() + 1 <= month ? from.getFullYear() : from.getFullYear() + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Month-of-year (1–12) of a "YYYY-MM" string, or null. */
export function monthOf(yearMonth: string | undefined): number | null {
  if (!yearMonth) return null;
  const m = Number(yearMonth.slice(5, 7));
  return m >= 1 && m <= 12 ? m : null;
}

/** Same day next year — the default anchor for a fresh yearly goal. */
export function defaultYearlyDate(from: Date = new Date()): string {
  return toDayString(new Date(from.getFullYear() + 1, from.getMonth(), from.getDate()));
}

// ---------------------------------------------------------------------------
// Template → config
// ---------------------------------------------------------------------------

const DEFAULT_WEEKDAY = 1; // Monday
const DEFAULT_DAY_OF_MONTH = 1;

/**
 * Whether a template is one of the shapes the fixed editor owns — which is
 * every shape built on a typed-in amount: `periodic`, `simple`, `by`, and
 * `spend` (Custom's "spend it down" mode). The remaining goal types derive
 * their amount from something else (a schedule, income, history, leftovers)
 * and keep their own editors.
 */
export function isFixedTemplate(t: Template): t is FixedTemplate {
  return t.type === "periodic" || t.type === "simple" || t.type === "by" || t.type === "spend";
}

/**
 * Which modes a Custom setup can actually express.
 *
 * `by` counts the balance and spreads toward the date — that IS refill, and
 * `spend` is its sibling meant to be drained over a window; both work as one
 * shots. `periodic` drops the amount on each occurrence regardless of balance
 * — that's set-aside, and the only shape for a daily or weekly cadence (`by`
 * and `spend` have no such repeat).
 */
export function allowedCustomModes(repeat: CustomRepeat | null): FixedMode[] {
  if (!repeat) return ["refill", "spend"];
  if (repeat.unit === "day" || repeat.unit === "week") return ["setAside"];
  return ["setAside", "refill", "spend"];
}

/** Clamp the interval to its unit's range and force a representable mode. */
export function normalizeCustomConfig(
  config: Extract<FixedGoalConfig, { segment: "custom" }>,
): Extract<FixedGoalConfig, { segment: "custom" }> {
  const repeat = config.repeat
    ? {
        unit: config.repeat.unit,
        interval: Math.min(Math.max(1, config.repeat.interval), REPEAT_MAX[config.repeat.unit]),
      }
    : null;
  const allowed = allowedCustomModes(repeat);
  const mode = allowed.includes(config.mode) ? config.mode : allowed[0];
  return { ...config, repeat, mode };
}

/**
 * Read a stored template into the editor's terms. Unrecognized periodic
 * cadences (every 2 weeks, daily…) come back as `custom`.
 *
 * @param preferCustom Read the template as Custom even when its shape is a
 *   preset. Custom can produce preset-identical templates — "every 1 month"
 *   IS `periodic{month,1}`, same as Monthly — so without this the editor
 *   would bounce out of Custom the moment the interval hit 1.
 */
export function fixedConfigFromTemplate(t: FixedTemplate, preferCustom = false): FixedGoalConfig {
  if (t.type === "by" || t.type === "spend") {
    const amountCents = Math.round(t.amount * 100);
    // by/spend only store months, so any day reads back as the 1st.
    const date = monthOf(t.month) != null ? `${t.month}-01` : defaultYearlyDate();
    const repeat = t.repeat ?? null;

    if (t.type === "spend") {
      return normalizeCustomConfig({
        segment: "custom",
        mode: "spend",
        amountCents,
        dueDate: date,
        from: monthOf(t.from) != null ? `${t.from}-01` : undefined,
        repeat: repeat ? { unit: t.annual ? "year" : "month", interval: repeat } : null,
      });
    }

    // A plain yearly repeat is the Yearly preset; everything else is Custom.
    if (!preferCustom && t.annual && (repeat ?? 1) === 1) {
      return { segment: "yearly", mode: "refill", amountCents, date };
    }
    return normalizeCustomConfig({
      segment: "custom",
      mode: "refill",
      amountCents,
      dueDate: date,
      repeat: repeat ? { unit: t.annual ? "year" : "month", interval: repeat } : null,
    });
  }

  if (t.type === "simple") {
    // No monthly amount + a limit = "refill up to the cap".
    const limit = t.limit;
    const amountCents = Math.round((limit?.amount ?? t.monthly ?? 0) * 100);
    if (limit?.period === "weekly") {
      return {
        segment: "weekly",
        mode: "refill",
        amountCents,
        weekday: weekdayOf(limit.start) ?? DEFAULT_WEEKDAY,
      };
    }
    // Monthly limit (or a legacy plain simple) — the engine has no day here.
    if (limit && t.monthly == null) {
      return {
        segment: "monthly",
        mode: "refill",
        amountCents,
        dayOfMonth: DEFAULT_DAY_OF_MONTH,
        hold: limit.hold,
      };
    }
    return {
      segment: "monthly",
      mode: "setAside",
      amountCents: Math.round((t.monthly ?? 0) * 100),
      dayOfMonth: DEFAULT_DAY_OF_MONTH,
    };
  }

  // periodic
  const amountCents = Math.round(t.amount * 100);
  const { period, amount: interval } = t.period;
  if (!preferCustom && interval === 1 && period === "week") {
    return {
      segment: "weekly",
      mode: "setAside",
      amountCents,
      weekday: weekdayOf(t.starting) ?? DEFAULT_WEEKDAY,
    };
  }
  if (!preferCustom && interval === 1 && period === "month") {
    return {
      segment: "monthly",
      mode: "setAside",
      amountCents,
      dayOfMonth: dayOfMonthOf(t.starting) ?? DEFAULT_DAY_OF_MONTH,
    };
  }
  if (!preferCustom && interval === 1 && period === "year") {
    // Set-aside mode: the full amount lands on the date each year.
    return {
      segment: "yearly",
      mode: "setAside",
      amountCents,
      date: t.starting ?? defaultYearlyDate(),
    };
  }
  // Any other cadence is Custom, always set-aside (periodic ignores balance).
  return normalizeCustomConfig({
    segment: "custom",
    mode: "setAside",
    amountCents,
    dueDate: t.starting ?? defaultYearlyDate(),
    repeat: { unit: period, interval },
  });
}

// ---------------------------------------------------------------------------
// Config → template
// ---------------------------------------------------------------------------

function priorityOf(prev: Template): number {
  return "priority" in prev ? prev.priority : 0;
}

/**
 * Write the editor's terms back to a stored template, keeping the previous
 * template's priority so the entry's place in the funding order survives a
 * segment or mode change.
 */
export function templateFromFixedConfig(config: FixedGoalConfig, prev: Template): Template {
  const amount = "amountCents" in config ? config.amountCents / 100 : 0;
  const priority = priorityOf(prev);

  switch (config.segment) {
    case "weekly": {
      const start = nextDateForWeekday(config.weekday);
      if (config.mode === "refill") {
        return {
          type: "simple",
          limit: { amount, hold: false, period: "weekly", start },
          priority,
          directive: "template",
        };
      }
      return {
        type: "periodic",
        amount,
        period: { period: "week", amount: 1 },
        starting: start,
        priority,
        directive: "template",
      };
    }

    case "monthly": {
      if (config.mode === "refill") {
        return {
          type: "simple",
          limit: { amount, hold: config.hold ?? false, period: "monthly" },
          priority,
          directive: "template",
        };
      }
      return {
        type: "periodic",
        amount,
        period: { period: "month", amount: 1 },
        starting: nextDateForDayOfMonth(config.dayOfMonth),
        priority,
        directive: "template",
      };
    }

    case "yearly": {
      if (config.mode === "setAside") {
        // Start over each year: the whole amount lands when the date arrives.
        return {
          type: "periodic",
          amount,
          period: { period: "year", amount: 1 },
          starting: config.date,
          priority,
          directive: "template",
        };
      }
      // Keep building: spread toward the date, counting what's already saved.
      return {
        type: "by",
        amount,
        month: config.date.slice(0, 7),
        annual: true,
        repeat: 1,
        priority,
        directive: "template",
      };
    }

    case "custom": {
      const { mode, repeat, dueDate, from } = normalizeCustomConfig(config);

      if (mode === "setAside" && repeat) {
        // Drops the amount on each occurrence, counting from the due date.
        return {
          type: "periodic",
          amount,
          period: { period: repeat.unit, amount: repeat.interval },
          starting: dueDate,
          priority,
          directive: "template",
        };
      }

      const repeatFields =
        repeat?.unit === "year"
          ? { annual: true, repeat: repeat.interval }
          : repeat
            ? { repeat: repeat.interval }
            : {};

      if (mode === "spend") {
        // A window to drain: set the total aside across from → due, spending
        // as it goes. Month-granular, like `by`.
        return {
          type: "spend",
          amount,
          month: dueDate.slice(0, 7),
          from: (from ?? `${currentMonth()}-01`).slice(0, 7),
          ...repeatFields,
          priority,
          directive: "template",
        };
      }

      // Refill: spread toward the date, counting the balance. One shot when
      // there's no repeat; month-granular either way.
      return {
        type: "by",
        amount,
        month: dueDate.slice(0, 7),
        ...repeatFields,
        priority,
        directive: "template",
      };
    }
  }
}
