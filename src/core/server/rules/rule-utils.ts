/**
 * Rule utilities — shared helpers for the rules engine.
 * Ported from loot-core/src/server/rules/rule-utils.ts
 */

import { isValid, parseISO } from "date-fns";

import { RuleError } from "./errors";
import type { Rule } from "./rule";
import { scheduleFromRecurConfig } from "@/core/shared/schedules";
import type { ScheduleRecurData } from "@/core/shared/schedules";
import type { RSchedule } from "@/core/server/util/rschedule";
import type { RecurConfig } from "@/core/types/models";

// Field/op metadata + value (un)parsers now live in the shared layer
// (@/core/shared/rules, mirroring upstream loot-core/src/shared/rules.ts).
// Re-exported here so existing engine imports keep resolving.
export {
  FIELD_TYPES,
  isValidOp,
  getValidOps,
  deserializeField,
  sortNumbers,
  getApproxNumberThreshold,
  getFieldError,
  parse,
  unparse,
  makeValue,
} from "@/core/shared/rules";

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

// ── Recurring date parsing ──

/** Port of loot-core/src/server/rules/rule-utils.ts `parseRecurDate`. */
export function parseRecurDate(desc: Record<string, unknown>): {
  type: "recur";
  schedule: RSchedule<ScheduleRecurData>;
} {
  try {
    return { type: "recur", schedule: scheduleFromRecurConfig(desc as unknown as RecurConfig) };
  } catch (e) {
    throw new RuleError("parse-recur-date", e instanceof Error ? e.message : String(e));
  }
}

// ── Tag helpers ──

/**
 * For a given string, returns an array of unique words (whitespace-separated)
 * with only a single `#` prepended, so "one #one ##one ##two three" becomes
 * ["#one", "#two", "#three"]. Pure port of loot-core/src/shared/tags.ts
 * `extractTagsForFilter`, used by the `hasTags`/`hasAnyTag` condition ops.
 */
export function extractTagsForFilter(value: string): string[] {
  if (!value) return [];
  const tagValues: string[] = [];
  const seenTags = new Set<string>();
  for (const match of value.matchAll(/#*([^#\s]+)/g)) {
    const tagWithHash = "#" + match[1];
    if (!seenTags.has(tagWithHash)) {
      seenTags.add(tagWithHash);
      tagValues.push(tagWithHash);
    }
  }
  return tagValues;
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
  hasAnyTag: 0,
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
