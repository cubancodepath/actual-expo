/**
 * Pure goal/template parsing and serialization — zero native dependencies.
 *
 * This module contains functions that work entirely in-memory:
 * parsing goal_def JSON, inferring goal values, and converting
 * templates to/from note text. Safe to import in tests without mocking.
 */

import { addMonths } from "@/lib/date";
import type { Template, LimitDef } from "./types";

// ---------------------------------------------------------------------------
// Parse templates from a category's goal_def
// ---------------------------------------------------------------------------

/**
 * Parse the goal_def JSON from a category.
 * Returns an empty array if goal_def is null or invalid.
 */
export function parseGoalDef(goalDef: string | null): Template[] {
  if (!goalDef) return [];
  try {
    const parsed = JSON.parse(goalDef);
    if (!Array.isArray(parsed)) return [];
    return parsed as Template[];
  } catch {
    return [];
  }
}

/**
 * Detect categories that still use the legacy text-based template format
 * (#template or #goal in notes) without a goal_def JSON entry.
 *
 * loot-core supports two flows: UI-based (goal_def JSON) and notes-based
 * (#template text parsed via PEG.js). Both are now readable — see
 * parseTemplateNotes() below, which does the actual parsing this function
 * only used to detect.
 *
 * Returns true if legacy template notes are detected.
 */
export function hasLegacyTemplateNotes(notes: string | null, goalDef: string | null): boolean {
  if (goalDef) return false; // already migrated to JSON
  if (!notes) return false;
  return /#template\b/i.test(notes) || /#goal\b/i.test(notes) || /#cleanup\b/i.test(notes);
}

/**
 * Fast, synchronous goal inference from goal_def — no DB queries.
 *
 * Extracts the goal amount and longGoal flag from the primary template.
 * Works for the common types (simple, goal, by, periodic, limit).
 * Returns null for types that need DB queries (average, copy, percentage, spend)
 * or if no goal_def is set.
 *
 * For `by` templates (sinking funds), computes the monthly installment
 * when `month` is provided: (totalTarget - carryIn) / monthsRemaining.
 *
 * Used by getBudgetMonth() to fill in goal/longGoal in-memory when
 * zero_budgets doesn't have a row yet (new month, no applyGoals run).
 */
export function inferGoalFromDef(
  goalDef: string | null,
  month?: string,
  carryIn?: number,
): { goal: number; longGoal: boolean } | null {
  const templates = parseGoalDef(goalDef);
  if (templates.length === 0) return null;

  const primary = templates[0];

  switch (primary.type) {
    case "goal":
      // #goal N — balance-based target
      return { goal: Math.round(primary.amount * 100), longGoal: true };

    case "simple":
      // #template N — fixed monthly amount
      if (primary.monthly != null) {
        // monthly with limit: goal is the monthly amount (limit just caps budget)
        return { goal: Math.round(primary.monthly * 100), longGoal: false };
      }
      // No monthly + limit = refill (#template up to X) — balance-based target
      if (primary.limit) {
        return { goal: Math.round(primary.limit.amount * 100), longGoal: true };
      }
      return null;

    case "by": {
      // #template N by YYYY-MM — sinking fund: compute monthly installment
      if (!month) return null;
      const totalCents = Math.round(primary.amount * 100);
      let targetMonth = primary.month;
      const period = primary.annual ? (primary.repeat || 1) * 12 : (primary.repeat ?? null);

      // Advance target month if it's in the past
      let numMonths = diffMonthsSync(targetMonth, month);
      while (numMonths < 0 && period) {
        targetMonth = addMonths(targetMonth, period);
        numMonths = diffMonthsSync(targetMonth, month);
      }
      if (numMonths < 0) return null; // target in the past, no repeat

      // Mirror engine's runBy: subtract carry-in (existing balance) from total
      const fromLastMonth = carryIn ?? 0;
      const needed = Math.max(0, totalCents - fromLastMonth);
      const monthlyGoal = Math.round(needed / (numMonths + 1));
      if (monthlyGoal <= 0) return null;
      return { goal: monthlyGoal, longGoal: false };
    }

    case "spend":
      // Spend templates need DB queries for previously budgeted amounts
      return null;

    case "periodic":
      // #template N repeat every ... — use per-occurrence amount as goal
      return { goal: Math.round(primary.amount * 100), longGoal: false };

    case "limit":
      // Standalone limit
      return { goal: Math.round(primary.amount * 100), longGoal: false };

    case "refill": {
      // Refill always pairs with a limit — find the companion
      const limitT = templates.find((t) => t.type === "limit");
      if (limitT) return { goal: Math.round(limitT.amount * 100), longGoal: false };
      const simpleLimit = templates.find(
        (t): t is import("./types").SimpleTemplate => t.type === "simple" && !!t.limit,
      );
      if (simpleLimit?.limit)
        return { goal: Math.round(simpleLimit.limit.amount * 100), longGoal: false };
      return null;
    }

    // average, copy, percentage, remainder — need DB or context
    default:
      return null;
  }
}

/** Difference in calendar months between two "YYYY-MM" strings. */
function diffMonthsSync(to: string, from: string): number {
  const [toY, toM] = to.split("-").map(Number);
  const [fromY, fromM] = from.split("-").map(Number);
  return (toY - fromY) * 12 + (toM - fromM);
}

// ---------------------------------------------------------------------------
// Convert templates to note text (#template / #goal lines)
// ---------------------------------------------------------------------------

function limitToNote(limit: LimitDef): string {
  if (limit.period === "daily") return ` up to ${limit.amount} per day`;
  if (limit.period === "weekly")
    return ` up to ${limit.amount} per week${limit.start ? ` starting ${limit.start}` : ""}`;
  // monthly
  return ` up to ${limit.amount}${limit.hold ? " hold" : ""}`;
}

function priorityPrefix(priority: number): string {
  return priority === 0 ? "#template" : `#template-${priority}`;
}

/**
 * Convert a single Template to its note-text representation.
 * For percentage templates, `categoryName` must be provided (resolved externally).
 */
export function templateToNoteLine(t: Template, categoryName?: string): string {
  switch (t.type) {
    case "simple": {
      const prefix = priorityPrefix(t.priority);
      if (t.monthly != null && t.limit) return `${prefix} ${t.monthly}${limitToNote(t.limit)}`;
      if (t.monthly != null) return `${prefix} ${t.monthly}`;
      if (t.limit) return `${prefix}${limitToNote(t.limit)}`;
      return `${prefix} 0`;
    }
    case "goal":
      return `#goal ${t.amount}`;
    case "by": {
      const prefix = priorityPrefix(t.priority);
      let line = `${prefix} ${t.amount} by ${t.month}`;
      if (t.repeat) {
        if (t.annual)
          line += ` repeat every ${t.repeat === 1 ? "" : `${t.repeat} `}year${t.repeat === 1 ? "" : "s"}`;
        else line += ` repeat every ${t.repeat} months`;
      }
      return line;
    }
    case "average": {
      const prefix = priorityPrefix(t.priority);
      let line = `${prefix} average ${t.numMonths} months`;
      if (t.adjustment && t.adjustmentType === "percent")
        line += ` [${t.adjustment > 0 ? "increase" : "decrease"} ${Math.abs(t.adjustment)}%]`;
      else if (t.adjustment && t.adjustmentType === "fixed")
        line += ` [${t.adjustment > 0 ? "increase" : "decrease"} ${Math.abs(t.adjustment)}]`;
      return line;
    }
    case "copy":
      return `${priorityPrefix(t.priority)} copy from ${t.lookBack} months ago`;
    case "periodic": {
      const prefix = priorityPrefix(t.priority);
      const pStr =
        t.period.amount === 1 ? t.period.period : `${t.period.amount} ${t.period.period}s`;
      let line = `${prefix} ${t.amount} repeat every ${pStr}`;
      if (t.starting) line += ` starting ${t.starting}`;
      if (t.limit) line += limitToNote(t.limit);
      return line;
    }
    case "spend": {
      const prefix = priorityPrefix(t.priority);
      let line = `${prefix} ${t.amount} by ${t.month} spend from ${t.from}`;
      if (t.repeat) {
        if (t.annual)
          line += ` repeat every ${t.repeat === 1 ? "" : `${t.repeat} `}year${t.repeat === 1 ? "" : "s"}`;
        else line += ` repeat every ${t.repeat} months`;
      }
      return line;
    }
    case "percentage": {
      const prefix = priorityPrefix(t.priority);
      const prev = t.previous ? "previous " : "";
      const catName = t.category === "all-income" ? "all income" : (categoryName ?? t.category);
      return `${prefix} ${t.percent}% of ${prev}${catName}`;
    }
    case "remainder": {
      let line = `#template remainder`;
      if (t.weight !== 1) line += ` ${t.weight}`;
      if (t.limit) line += limitToNote(t.limit);
      return line;
    }
    case "refill":
      return `${priorityPrefix(t.priority)} refill`;
    case "limit":
      return `#template${limitToNote({ amount: t.amount, hold: t.hold, period: t.period, start: t.start })}`;
    case "schedule": {
      const prefix = priorityPrefix(t.priority);
      let line = `${prefix} schedule ${t.full ? "full " : ""}${t.name ?? t.scheduleId ?? ""}`;
      if (t.adjustment && t.adjustmentType === "percent")
        line += ` [${t.adjustment > 0 ? "increase" : "decrease"} ${Math.abs(t.adjustment)}%]`;
      else if (t.adjustment && t.adjustmentType === "fixed")
        line += ` [${t.adjustment > 0 ? "increase" : "decrease"} ${Math.abs(t.adjustment)}]`;
      return line;
    }
  }
}

/**
 * Convert an array of templates to note text (one line per template).
 */
export function templatesToNoteText(
  templates: Template[],
  categoryNames?: Map<string, string>,
): string {
  return templates
    .map((t) => {
      const catName =
        t.type === "percentage" && t.category !== "all-income"
          ? categoryNames?.get(t.category)
          : undefined;
      return templateToNoteLine(t, catName);
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Parse legacy #template / #goal note text into templates
//
// Hand-written parser covering the syntax templateToNoteLine() emits above
// (a subset of upstream's goal-template.pegjs grammar) — the desktop app's
// legacy notes-based template format, still supported there alongside the
// goal_def JSON UI. Previously only detected (hasLegacyTemplateNotes),
// never actually parsed, so a budget authored with notes-only templates on
// desktop rendered with no goals at all on mobile.
// ---------------------------------------------------------------------------

const PRIORITY_RE = /^#template(?:-(\d+))?\s*/i;
const GOAL_RE = /^#goal\s+(-?[\d.]+)\s*$/i;
const LIMIT_CLAUSE_RE =
  /\bup to\s+([\d.]+)(?:\s+per\s+(day|week)(?:\s+starting\s+(\d{4}-\d{2}-\d{2}))?)?(\s+hold\b)?/i;
const MODIFIER_RE = /\[(increase|decrease)\s+([\d.]+)(%)?\]/i;

function parseLimitClause(text: string): LimitDef | null {
  const m = text.match(LIMIT_CLAUSE_RE);
  if (!m) return null;
  const amount = parseFloat(m[1]);
  if (m[2] === "day") return { amount, hold: false, period: "daily" };
  if (m[2] === "week") return { amount, hold: false, period: "weekly", start: m[3] };
  return { amount, hold: !!m[4], period: "monthly" };
}

function stripLimitClause(text: string): string {
  return text.replace(LIMIT_CLAUSE_RE, "").trim();
}

function parseModifier(
  text: string,
): { adjustment: number; adjustmentType: "percent" | "fixed" } | undefined {
  const m = text.match(MODIFIER_RE);
  if (!m) return undefined;
  const sign = m[1].toLowerCase() === "increase" ? 1 : -1;
  return { adjustment: sign * parseFloat(m[2]), adjustmentType: m[3] ? "percent" : "fixed" };
}

/**
 * Parse a single legacy #template / #goal note line into a Template.
 * Returns null for lines that aren't recognized template syntax — most
 * lines in a notes field are just regular user notes, which is expected
 * and not an error.
 *
 * @param categoryNameToId  Resolves a percentage template's category name
 *   (percentage templates reference categories by display name in text
 *   form) to an id. Percentage lines are skipped if no map is provided or
 *   the name isn't found, rather than emitting a template with a broken
 *   category reference.
 */
export function parseTemplateNoteLine(
  line: string,
  categoryNameToId?: Map<string, string>,
): Template | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const goalMatch = trimmed.match(GOAL_RE);
  if (goalMatch) {
    return { type: "goal", amount: parseFloat(goalMatch[1]), directive: "goal" };
  }

  const priorityMatch = trimmed.match(PRIORITY_RE);
  if (!priorityMatch) return null; // not a template/goal line — ordinary note text
  const priority = priorityMatch[1] ? parseInt(priorityMatch[1], 10) : 0;
  const rest = trimmed.slice(priorityMatch[0].length).trim();
  const directive = "template" as const;

  let m: RegExpMatchArray | null;

  m = rest.match(/^remainder\s*(\d+(?:\.\d+)?)?/i);
  if (m) {
    return {
      type: "remainder",
      weight: m[1] ? parseFloat(m[1]) : 1,
      limit: parseLimitClause(rest),
      directive,
    };
  }

  m = rest.match(/^schedule\s+(full\s+)?(.+?)(\s*\[.*\])?$/i);
  if (m) {
    const mod = parseModifier(rest);
    return {
      type: "schedule",
      full: !!m[1],
      name: m[2].trim(),
      adjustment: mod?.adjustment,
      adjustmentType: mod?.adjustmentType,
      priority,
      directive,
    };
  }

  if (/^refill\s*$/i.test(rest)) {
    return { type: "refill", priority, directive };
  }

  m = rest.match(/^average\s+(\d+)\s*months?/i);
  if (m) {
    const mod = parseModifier(rest);
    return {
      type: "average",
      numMonths: parseInt(m[1], 10),
      adjustment: mod?.adjustment,
      adjustmentType: mod?.adjustmentType,
      priority,
      directive,
    };
  }

  m = rest.match(/^copy from\s+(\d+)\s+months ago/i);
  if (m) {
    return { type: "copy", lookBack: parseInt(m[1], 10), priority, directive };
  }

  m = rest.match(/^([\d.]+)%\s+of\s+(previous\s+)?(.+)$/i);
  if (m) {
    const catText = m[3].trim();
    const category =
      catText.toLowerCase() === "all income" ? "all-income" : categoryNameToId?.get(catText);
    if (!category) return null; // can't resolve — skip rather than emit a broken reference
    return {
      type: "percentage",
      percent: parseFloat(m[1]),
      previous: !!m[2],
      category,
      priority,
      directive,
    };
  }

  // "by" / "spend": "<amount> by <YYYY-MM>[ spend from <YYYY-MM>][ repeat every ...]"
  m = rest.match(
    /^([\d.]+)\s+by\s+(\d{4}-\d{2})(?:\s+spend from\s+(\d{4}-\d{2}))?(?:\s+repeat every\s+(?:(\d+)\s+)?(year|month)s?)?/i,
  );
  if (m) {
    const amount = parseFloat(m[1]);
    const month = m[2];
    const from = m[3];
    const repeatUnit = m[5];
    const repeat = repeatUnit ? parseInt(m[4] ?? "1", 10) : undefined;
    const annual = repeatUnit === "year";
    if (from) {
      return { type: "spend", amount, month, from, annual, repeat, priority, directive };
    }
    return { type: "by", amount, month, annual, repeat, priority, directive };
  }

  // "periodic": "<amount> repeat every [N ]day|week|month|year(s)[ starting DATE][ up to ...]"
  m = rest.match(/^([\d.]+)\s+repeat every\s+(?:(\d+)\s+)?(day|week|month|year)s?/i);
  if (m) {
    const amount = parseFloat(m[1]);
    const periodAmount = m[2] ? parseInt(m[2], 10) : 1;
    const period = m[3].toLowerCase() as "day" | "week" | "month" | "year";
    const startingMatch = rest.match(/\bstarting\s+(\d{4}-\d{2}-\d{2})/i);
    return {
      type: "periodic",
      amount,
      period: { period, amount: periodAmount },
      starting: startingMatch?.[1],
      limit: parseLimitClause(rest),
      priority,
      directive,
    };
  }

  // "simple" (with optional limit clause): "<amount>?[ up to ...]"
  const limit = parseLimitClause(rest);
  const withoutLimit = stripLimitClause(rest);
  m = withoutLimit.match(/^([\d.]+)\s*$/);
  if (m) {
    return { type: "simple", monthly: parseFloat(m[1]), limit, priority, directive };
  }
  if (limit && withoutLimit === "") {
    return { type: "simple", monthly: undefined, limit, priority, directive };
  }

  return null; // unrecognized syntax — leave it as plain note text
}

/**
 * Parse every recognized #template/#goal line out of a category's notes
 * text into templates. Non-template lines (regular user notes) are
 * silently skipped. This is the read path for budgets that still use the
 * legacy notes-based template format instead of goal_def JSON.
 */
export function parseTemplateNotes(
  notes: string | null,
  categoryNameToId?: Map<string, string>,
): Template[] {
  if (!notes) return [];
  return notes
    .split("\n")
    .map((line) => parseTemplateNoteLine(line, categoryNameToId))
    .filter((t): t is Template => t !== null);
}

/**
 * Drop every line that parses as a template, keeping the rest of a category's
 * notes verbatim.
 *
 * The notes field is shared: it holds both the #template mirror we write for
 * desktop compatibility and whatever the user typed about the category. When
 * rewriting the mirror we replace only the lines we own — anything we don't
 * recognize (plain notes, and directives we don't manage like #cleanup) is
 * the user's and survives.
 *
 * `categoryNameToId` should match what was passed to parseTemplateNotes, so a
 * percentage line whose category can't be resolved is treated the same by
 * both (left alone as plain text rather than silently dropped).
 */
export function stripTemplateLines(
  notes: string | null,
  categoryNameToId?: Map<string, string>,
): string {
  if (!notes) return "";
  return notes
    .split("\n")
    .filter((line) => parseTemplateNoteLine(line, categoryNameToId) === null)
    .join("\n")
    .trim();
}
