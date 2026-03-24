/**
 * Handlebars helpers for rule templates.
 * Ported from loot-core/src/server/rules/handlebars-helpers.ts
 */

import * as Handlebars from "handlebars";
import {
  addDays,
  subDays,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addYears,
  subYears,
  parseISO,
  format as fnsFormat,
} from "date-fns";

function formatDate(dateStr: string, fmt: string): string {
  return fnsFormat(parseISO(dateStr), fmt);
}

function addDaysStr(dateStr: string, days: number): string {
  return fnsFormat(addDays(parseISO(dateStr), days), "yyyy-MM-dd");
}

function subDaysStr(dateStr: string, days: number): string {
  return fnsFormat(subDays(parseISO(dateStr), days), "yyyy-MM-dd");
}

export function registerHandlebarsHelpers(): void {
  const regexTest = /^\/(.*)\/([gimuy]*)$/;

  function mathHelper(fn: (a: number, b: number) => number) {
    return (a: unknown, ...b: unknown[]) => b.map(Number).reduce(fn, Number(a));
  }

  function regexHelper(
    mapRegex: (regex: string, flags: string) => string | RegExp,
    mapNonRegex: (value: string) => string | RegExp,
    apply: (value: string, regex: string | RegExp, replace: string) => string,
  ) {
    return (value: unknown, regex: unknown, replace: unknown) => {
      if (value == null) return null;
      if (typeof regex !== "string" || typeof replace !== "string") return "";
      let regexp: string | RegExp;
      const match = regexTest.exec(regex);
      if (match) {
        regexp = mapRegex(match[1], match[2]);
      } else {
        regexp = mapNonRegex(regex);
      }
      return apply(String(value), regexp, replace);
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const helpers: Record<string, (...args: any[]) => unknown> = {
    regex: regexHelper(
      (regex, flags) => new RegExp(regex, flags),
      (value) => new RegExp(value),
      (value, regex, replace) => value.replace(regex, replace),
    ),
    replace: regexHelper(
      (regex, flags) => new RegExp(regex, flags),
      (value) => value,
      (value, regex, replace) => value.replace(regex, replace),
    ),
    replaceAll: regexHelper(
      (regex, flags) => new RegExp(regex, flags),
      (value) => value,
      (value, regex, replace) => value.replaceAll(regex, replace),
    ),
    add: mathHelper((a, b) => a + b),
    sub: mathHelper((a, b) => a - b),
    div: mathHelper((a, b) => a / b),
    mul: mathHelper((a, b) => a * b),
    mod: mathHelper((a, b) => a % b),
    floor: (a: unknown) => Math.floor(Number(a)),
    ceil: (a: unknown) => Math.ceil(Number(a)),
    round: (a: unknown) => Math.round(Number(a)),
    abs: (a: unknown) => Math.abs(Number(a)),
    min: mathHelper((a, b) => Math.min(a, b)),
    max: mathHelper((a, b) => Math.max(a, b)),
    fixed: (a: unknown, digits: unknown) => Number(a).toFixed(Number(digits)),
    day: (date?: string) => date && formatDate(date, "d"),
    month: (date?: string) => date && formatDate(date, "M"),
    year: (date?: string) => date && formatDate(date, "yyyy"),
    format: (date?: string, f?: string) => date && f && formatDate(date, f as string),
    addDays: (date?: string, days?: number) => {
      if (!date || !days) return date;
      return addDaysStr(date as string, days as number);
    },
    subDays: (date?: string, days?: number) => {
      if (!date || !days) return date;
      return subDaysStr(date as string, days as number);
    },
    addMonths: (date?: string, months?: number) => {
      if (!date || !months) return date;
      return fnsFormat(addMonths(parseISO(date as string), months as number), "yyyy-MM-dd");
    },
    subMonths: (date?: string, months?: number) => {
      if (!date || !months) return date;
      return fnsFormat(subMonths(parseISO(date as string), months as number), "yyyy-MM-dd");
    },
    addWeeks: (date?: string, weeks?: number) => {
      if (!date || !weeks) return date;
      return fnsFormat(addWeeks(parseISO(date as string), weeks as number), "yyyy-MM-dd");
    },
    subWeeks: (date?: string, weeks?: number) => {
      if (!date || !weeks) return date;
      return fnsFormat(subWeeks(parseISO(date as string), weeks as number), "yyyy-MM-dd");
    },
    addYears: (date?: string, years?: number) => {
      if (!date || !years) return date;
      return fnsFormat(addYears(parseISO(date as string), years as number), "yyyy-MM-dd");
    },
    subYears: (date?: string, years?: number) => {
      if (!date || !years) return date;
      return fnsFormat(subYears(parseISO(date as string), years as number), "yyyy-MM-dd");
    },
    setDay: (date?: string, day?: number) => {
      if (!date || day == null) return date;
      const actualDay = Number(formatDate(date as string, "d"));
      return addDaysStr(date as string, (day as number) - actualDay);
    },
    debug: (value: unknown) => {
      console.log("[rules:handlebars]", value);
    },
    concat: (...args: unknown[]) => args.join(""),
  };

  for (const [name, fn] of Object.entries(helpers)) {
    Handlebars.registerHelper(name, (...args: unknown[]) => {
      // The last argument is the Handlebars options object
      return fn(...args.slice(0, -1));
    });
  }
}

// Register helpers on module load
registerHandlebarsHelpers();
