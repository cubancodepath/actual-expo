/**
 * Rule utilities — shared helpers for the rules engine.
 * Ported from loot-core/src/server/rules/rule-utils.ts
 */

import { isValid, parseISO } from "date-fns";

import { RuleError } from "./errors";
import type { Rule } from "./rule";

// ── Assert ──

export function assert(test: unknown, type: string, msg: string): asserts test {
  if (!test) {
    throw new RuleError(type, msg);
  }
}

// ── Date parsing ──

export function parseDateString(
  str: unknown,
): { type: "date" | "month" | "year"; date: string } | null {
  if (typeof str !== "string") return null;

  if (str.length === 10) {
    // YYYY-MM-DD
    if (!isValid(parseISO(str))) return null;
    return { type: "date", date: str };
  }
  if (str.length === 7) {
    // YYYY-MM
    if (!isValid(parseISO(str + "-01"))) return null;
    return { type: "month", date: str };
  }
  if (str.length === 4) {
    // YYYY
    if (!isValid(parseISO(str + "-01-01"))) return null;
    return { type: "year", date: str };
  }

  return null;
}

// ── Number parsing ──

export function parseBetweenAmount(
  between: unknown,
): { type: "between"; num1: number; num2: number } | null {
  if (!between || typeof between !== "object") return null;
  const { num1, num2 } = between as { num1: unknown; num2: unknown };
  if (typeof num1 !== "number" || typeof num2 !== "number") return null;
  return { type: "between", num1, num2 };
}

// ── Recurring date parsing (via RSchedule) ──

let rscheduleAvailable = false;
let RScheduleClass: unknown = null;
let recurConfigToRScheduleFn: ((config: unknown) => unknown[]) | null = null;

// Lazy-load rschedule to avoid issues if the package is missing
async function ensureRSchedule() {
  if (rscheduleAvailable) return;
  try {
    await import("@rschedule/standard-date-adapter/setup");
    const { Schedule } = await import("@rschedule/core/generators");
    RScheduleClass = Schedule;
    // We'll port recurConfigToRSchedule inline since importing from loot-core isn't possible
    rscheduleAvailable = true;
  } catch {
    // rschedule not available — recurring dates won't work
  }
}

// Port of recurConfigToRSchedule from loot-core/src/shared/schedules.ts
function recurConfigToRSchedule(config: Record<string, unknown>): unknown[] {
  const start = parseISO(config.start as string);
  const frequency = (config.frequency as string).toUpperCase();

  const base: Record<string, unknown> = {
    start,
    frequency,
    byHourOfDay: [12],
  };

  if (config.interval) {
    base.interval = config.interval;
  }

  switch (config.endMode) {
    case "after_n_occurrences":
      base.count = config.endOccurrences;
      break;
    case "on_date":
      base.end = parseISO(config.endDate as string);
      break;
  }

  const abbrevDay = (name: string) => name.slice(0, 2).toUpperCase();

  switch (config.frequency) {
    case "daily":
    case "weekly":
    case "yearly":
      return [base];
    case "monthly": {
      const patterns = config.patterns as Array<{ type: string; value: number }> | undefined;
      if (patterns && patterns.length > 0) {
        const days = patterns.filter((p) => p.type === "day");
        const dayNames = patterns.filter((p) => p.type !== "day");
        return [
          days.length > 0 && { ...base, byDayOfMonth: days.map((p) => p.value) },
          dayNames.length > 0 && {
            ...base,
            byDayOfWeek: dayNames.map((p) => [abbrevDay(p.type), p.value]),
          },
        ].filter(Boolean) as unknown[];
      }
      return [base];
    }
    default:
      throw new Error("Invalid recurring date config");
  }
}

export function parseRecurDate(desc: Record<string, unknown>): {
  type: "recur";
  schedule: {
    occursOn: (opts: unknown) => boolean;
    occursBetween: (start: Date, end: Date) => boolean;
  };
} {
  if (!rscheduleAvailable || !RScheduleClass) {
    throw new RuleError("parse-recur-date", "RSchedule not available");
  }
  try {
    const rules = recurConfigToRSchedule(desc);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ScheduleClass = RScheduleClass as any;
    const schedule = new ScheduleClass({
      rrules: rules,
      data: {
        skipWeekend: desc.skipWeekend,
        weekendSolve: desc.weekendSolveMode,
      },
    });
    return { type: "recur", schedule };
  } catch (e) {
    throw new RuleError("parse-recur-date", e instanceof Error ? e.message : String(e));
  }
}

// Initialize rschedule on module load (non-blocking)
ensureRSchedule();

// ── Shared rule helpers ──

export function sortNumbers(num1: number, num2: number): [number, number] {
  return num1 < num2 ? [num1, num2] : [num2, num1];
}

export function getApproxNumberThreshold(n: number): number {
  return Math.round(Math.abs(n) * 0.075);
}

// ── Field type info ──

export const FIELD_TYPES = new Map<string, string>([
  ["imported_payee", "string"],
  ["payee", "id"],
  ["payee_name", "string"],
  ["date", "date"],
  ["notes", "string"],
  ["amount", "number"],
  ["category", "id"],
  ["category_group", "id"],
  ["account", "id"],
  ["cleared", "boolean"],
  ["reconciled", "boolean"],
  ["saved", "saved"],
  ["transfer", "boolean"],
  ["parent", "boolean"],
]);

// Field-specific disallowed ops
const FIELD_DISALLOWED_OPS: Record<string, Set<string>> = {
  imported_payee: new Set(["hasTags"]),
  payee: new Set(["onBudget", "offBudget"]),
  notes: new Set(["oneOf", "notOneOf"]),
  category: new Set(["onBudget", "offBudget"]),
  category_group: new Set(["onBudget", "offBudget"]),
};

// Field-specific internal ops (not in TYPE_INFO but allowed)
const FIELD_INTERNAL_OPS: Record<string, Set<string>> = {
  category: new Set(["and"]),
  category_group: new Set(["and"]),
};

// Type-level ops
const TYPE_OPS: Record<string, readonly string[]> = {
  date: ["is", "isapprox", "gt", "gte", "lt", "lte"],
  id: [
    "is",
    "contains",
    "matches",
    "oneOf",
    "isNot",
    "doesNotContain",
    "notOneOf",
    "onBudget",
    "offBudget",
  ],
  string: ["is", "contains", "matches", "oneOf", "isNot", "doesNotContain", "notOneOf", "hasTags"],
  number: ["is", "isapprox", "isbetween", "gt", "gte", "lt", "lte"],
  boolean: ["is"],
  saved: [],
};

export function isValidOp(field: string, op: string): boolean {
  const type = FIELD_TYPES.get(field);
  if (!type) return false;
  if (FIELD_DISALLOWED_OPS[field]?.has(op)) return false;
  return TYPE_OPS[type]?.includes(op) || FIELD_INTERNAL_OPS[field]?.has(op) || false;
}

// ── Rule scoring & ranking ──

const OP_SCORES: Record<string, number> = {
  is: 10,
  isNot: 10,
  oneOf: 9,
  notOneOf: 9,
  isapprox: 5,
  isbetween: 5,
  gt: 1,
  gte: 1,
  lt: 1,
  lte: 1,
  contains: 0,
  doesNotContain: 0,
  matches: 0,
  hasTags: 0,
  onBudget: 0,
  offBudget: 0,
};

function computeScore(rule: Rule): number {
  const score = rule.conditions.reduce((acc, cond) => {
    if (OP_SCORES[cond.op] == null) {
      console.warn(`[rules] Invalid operation while ranking: ${cond.op}`);
      return 0;
    }
    return acc + OP_SCORES[cond.op];
  }, 0);

  if (
    rule.conditions.every(
      (c) =>
        c.op === "is" ||
        c.op === "isNot" ||
        c.op === "isapprox" ||
        c.op === "oneOf" ||
        c.op === "notOneOf",
    )
  ) {
    return score * 2;
  }
  return score;
}

function _rankRules(rules: Rule[]): Rule[] {
  const scores = new Map<Rule, number>();
  for (const rule of rules) {
    scores.set(rule, computeScore(rule));
  }
  return [...rules].sort((r1, r2) => {
    const s1 = scores.get(r1)!;
    const s2 = scores.get(r2)!;
    if (s1 < s2) return -1;
    if (s1 > s2) return 1;
    const id1 = r1.getId() ?? "";
    const id2 = r2.getId() ?? "";
    return id1 < id2 ? -1 : id1 > id2 ? 1 : 0;
  });
}

export function rankRules(rules: Iterable<Rule>): Rule[] {
  const pre: Rule[] = [];
  const normal: Rule[] = [];
  const post: Rule[] = [];

  for (const rule of rules) {
    switch (rule.stage) {
      case "pre":
        pre.push(rule);
        break;
      case "post":
        post.push(rule);
        break;
      default:
        normal.push(rule);
    }
  }

  return [..._rankRules(pre), ..._rankRules(normal), ..._rankRules(post)];
}

// ── ID migration ──

export function migrateIds(rule: Rule, mappings: Map<string, string>): void {
  for (const cond of rule.conditions) {
    if (cond.type === "id") {
      switch (cond.op) {
        case "is":
        case "isNot":
          cond.value = mappings.get(cond.rawValue as string) || cond.rawValue;
          cond.unparsedValue = cond.value;
          break;
        case "oneOf":
        case "notOneOf":
          cond.value = (cond.rawValue as string[]).map((v: string) => mappings.get(v) || v);
          cond.unparsedValue = [...(cond.value as string[])];
          break;
      }
    }
  }

  for (const action of rule.actions) {
    if (action.type === "id" && action.op === "set") {
      action.value = mappings.get(action.rawValue as string) || action.rawValue;
    }
  }
}

// ── ID iteration ──

export function iterateIds(
  rules: Rule[],
  fieldName: string,
  func: (rule: Rule, id: string) => void | boolean,
): void {
  ruleiter: for (const rule of rules) {
    for (const cond of rule.conditions) {
      if (cond.type === "id" && cond.field === fieldName) {
        switch (cond.op) {
          case "is":
          case "isNot":
            if (func(rule, cond.value as string)) continue ruleiter;
            break;
          case "oneOf":
          case "notOneOf":
            for (const v of cond.value as string[]) {
              if (func(rule, v)) continue ruleiter;
            }
            break;
        }
      }
    }

    for (const action of rule.actions) {
      if (action.type === "id" && action.field === fieldName && action.op === "set") {
        if (func(rule, action.value as string)) break;
      }
    }
  }
}

// ── Set merge helper ──

export function fastSetMerge<T>(a: Set<T>, b: Set<T>): Set<T> {
  const result = new Set(a);
  for (const item of b) result.add(item);
  return result;
}
