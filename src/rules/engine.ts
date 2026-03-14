/**
 * Rule evaluation engine — pure functions, no DB dependency.
 *
 * Ports the core condition/action logic from Actual Budget's loot-core.
 * Operates on plain transaction objects (Record<string, unknown>).
 */

import type { ParsedRule, RuleCondition, RuleAction } from './types';
import { FIELD_TYPES, INTERNAL_FIELD_MAP } from './types';

// ── Field resolution ──

/**
 * Resolve a public rule field name to the internal DB column name,
 * then read the value from the transaction object.
 */
function getFieldValue(transaction: Record<string, unknown>, field: string): unknown {
  const internalField = INTERNAL_FIELD_MAP[field] ?? field;
  return transaction[internalField];
}

// ── Value normalization ──

function normalizeStringValue(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : String(value ?? '');
}

// ── Number helpers ──

/**
 * Approximate threshold: 7.5% of absolute value (matches original Actual).
 */
function getApproxThreshold(n: number): number {
  return Math.round(Math.abs(n) * 0.075);
}

// ── Date helpers ──

/**
 * Parse an integer date (YYYYMMDD) into components.
 */
function parseDateInt(d: number): { year: number; month: number; day: number } {
  const day = d % 100;
  const month = Math.floor((d % 10000) / 100);
  const year = Math.floor(d / 10000);
  return { year, month, day };
}

/**
 * Parse a string date ('YYYY-MM-DD', 'YYYY-MM', or 'YYYY') into an integer.
 * Returns { value: YYYYMMDD, precision: 'day'|'month'|'year' }.
 */
function parseDateString(s: string): { value: number; precision: 'day' | 'month' | 'year' } {
  const parts = s.split('-');
  const year = parseInt(parts[0], 10);
  if (parts.length === 1) return { value: year * 10000 + 101, precision: 'year' };
  const month = parseInt(parts[1], 10);
  if (parts.length === 2) return { value: year * 10000 + month * 100 + 1, precision: 'month' };
  const day = parseInt(parts[2], 10);
  return { value: year * 10000 + month * 100 + day, precision: 'day' };
}

function evalDateIs(fieldValue: unknown, condValue: unknown): boolean {
  if (typeof condValue !== 'string' || typeof fieldValue !== 'number') return false;
  const parsed = parseDateString(condValue);
  const field = parseDateInt(fieldValue as number);

  switch (parsed.precision) {
    case 'year':
      return field.year === Math.floor(parsed.value / 10000);
    case 'month': {
      const condParsed = parseDateInt(parsed.value);
      return field.year === condParsed.year && field.month === condParsed.month;
    }
    case 'day':
      return fieldValue === parsed.value;
  }
}

function evalDateIsApprox(fieldValue: unknown, condValue: unknown): boolean {
  if (typeof condValue !== 'string' || typeof fieldValue !== 'number') return false;
  const parsed = parseDateString(condValue);
  // ±2 days approximation
  return (fieldValue as number) >= parsed.value - 2 && (fieldValue as number) <= parsed.value + 2;
}

function compareDateValues(fieldValue: unknown, condValue: unknown): number | null {
  if (typeof fieldValue !== 'number') return null;
  if (typeof condValue === 'string') {
    const parsed = parseDateString(condValue);
    return (fieldValue as number) - parsed.value;
  }
  if (typeof condValue === 'number') {
    return (fieldValue as number) - condValue;
  }
  return null;
}

// ── Condition evaluation ──

/**
 * Evaluate a single condition against a transaction.
 */
export function evalCondition(
  condition: RuleCondition,
  transaction: Record<string, unknown>,
): boolean {
  const type = condition.type ?? FIELD_TYPES[condition.field] ?? 'string';
  let fieldValue = getFieldValue(transaction, condition.field);

  // Default empty strings for string fields
  if (type === 'string' && fieldValue == null) {
    fieldValue = '';
  }

  if (fieldValue === undefined) return false;

  // Number inflow/outflow option filtering
  if (type === 'number' && condition.options) {
    const numValue = fieldValue as number;
    if (condition.options.outflow) {
      if (numValue > 0) return false;
      fieldValue = -numValue;
    } else if (condition.options.inflow) {
      if (numValue < 0) return false;
    }
  }

  const { op, value: condValue } = condition;

  switch (op) {
    // ── Equality ──
    case 'is': {
      if (type === 'date') return evalDateIs(fieldValue, condValue);
      if (type === 'boolean') return fieldValue === condValue;
      if (type === 'number') return fieldValue === condValue;
      // string / id: case-insensitive
      return normalizeStringValue(fieldValue) === normalizeStringValue(condValue);
    }

    case 'isNot': {
      if (type === 'boolean') return fieldValue !== condValue;
      if (type === 'number') return fieldValue !== condValue;
      return normalizeStringValue(fieldValue) !== normalizeStringValue(condValue);
    }

    // ── Approximate ──
    case 'isapprox': {
      if (type === 'date') return evalDateIsApprox(fieldValue, condValue);
      if (type === 'number') {
        const threshold = getApproxThreshold(condValue as number);
        const fv = fieldValue as number;
        const cv = condValue as number;
        return fv >= cv - threshold && fv <= cv + threshold;
      }
      return false;
    }

    // ── Range ──
    case 'isbetween': {
      const range = condValue as { num1: number; num2: number };
      if (!range || range.num1 == null || range.num2 == null) return false;
      const [low, high] = range.num1 < range.num2
        ? [range.num1, range.num2]
        : [range.num2, range.num1];
      return (fieldValue as number) >= low && (fieldValue as number) <= high;
    }

    // ── String search ──
    case 'contains':
      return normalizeStringValue(fieldValue).includes(normalizeStringValue(condValue));

    case 'doesNotContain':
      return !normalizeStringValue(fieldValue).includes(normalizeStringValue(condValue));

    case 'matches': {
      try {
        const pattern = typeof condValue === 'string' ? condValue : String(condValue);
        return new RegExp(pattern, 'i').test(String(fieldValue ?? ''));
      } catch {
        return false;
      }
    }

    // ── Set membership ──
    case 'oneOf': {
      if (fieldValue == null) return false;
      const normalized = normalizeStringValue(fieldValue);
      return Array.isArray(condValue) && condValue.some(
        v => normalizeStringValue(v) === normalized,
      );
    }

    case 'notOneOf': {
      if (fieldValue == null) return false;
      const normalized = normalizeStringValue(fieldValue);
      return Array.isArray(condValue) && !condValue.some(
        v => normalizeStringValue(v) === normalized,
      );
    }

    // ── Comparison ──
    case 'gt': {
      if (type === 'date') { const d = compareDateValues(fieldValue, condValue); return d !== null && d > 0; }
      return fieldValue != null && (fieldValue as number) > (condValue as number);
    }
    case 'gte': {
      if (type === 'date') { const d = compareDateValues(fieldValue, condValue); return d !== null && d >= 0; }
      return fieldValue != null && (fieldValue as number) >= (condValue as number);
    }
    case 'lt': {
      if (type === 'date') { const d = compareDateValues(fieldValue, condValue); return d !== null && d < 0; }
      return fieldValue != null && (fieldValue as number) < (condValue as number);
    }
    case 'lte': {
      if (type === 'date') { const d = compareDateValues(fieldValue, condValue); return d !== null && d <= 0; }
      return fieldValue != null && (fieldValue as number) <= (condValue as number);
    }

    // ── Tags ──
    case 'hasTags':
      return fieldValue != null && normalizeStringValue(fieldValue).includes(
        normalizeStringValue(condValue),
      );

    default:
      return false;
  }
}

// ── Action execution ──

/**
 * Execute a single action on a transaction object (mutates in place).
 */
export function execAction(
  action: RuleAction,
  transaction: Record<string, unknown>,
): void {
  switch (action.op) {
    case 'set': {
      if (!action.field) break;
      const internalField = INTERNAL_FIELD_MAP[action.field] ?? action.field;
      transaction[internalField] = action.value;
      break;
    }
    case 'set-split-amount': {
      if (action.options?.method === 'fixed-amount') {
        transaction.amount = action.value;
      }
      break;
    }
    case 'link-schedule':
      transaction.schedule = action.value;
      break;
    case 'prepend-notes':
      transaction.notes = transaction.notes
        ? `${action.value}${transaction.notes}`
        : action.value;
      break;
    case 'append-notes':
      transaction.notes = transaction.notes
        ? `${transaction.notes}${action.value}`
        : action.value;
      break;
    case 'delete-transaction':
      transaction.tombstone = 1;
      break;
  }
}

// ── Rule-level evaluation ──

/**
 * Evaluate all conditions of a rule against a transaction.
 */
export function evalConditions(
  rule: ParsedRule,
  transaction: Record<string, unknown>,
): boolean {
  if (rule.conditions.length === 0) return false;
  const fn = rule.conditionsOp === 'or' ? 'some' : 'every';
  return rule.conditions[fn](c => evalCondition(c, transaction));
}

/**
 * Apply a rule to a transaction: if conditions match, execute all actions.
 * Returns a new object with modifications, or the original if no match.
 */
export function applyRule(
  rule: ParsedRule,
  transaction: Record<string, unknown>,
): Record<string, unknown> {
  if (!evalConditions(rule, transaction)) return transaction;
  const result = { ...transaction };
  for (const action of rule.actions) {
    execAction(action, result);
  }
  return result;
}

// ── Rule ranking ──

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
};

const HIGH_PRIORITY_OPS = new Set(['is', 'isNot', 'isapprox', 'oneOf', 'notOneOf']);

function computeScore(rule: ParsedRule): number {
  const base = rule.conditions.reduce(
    (score, c) => score + (OP_SCORES[c.op] ?? 0),
    0,
  );
  const allHighPriority = rule.conditions.length > 0 &&
    rule.conditions.every(c => HIGH_PRIORITY_OPS.has(c.op));
  return allHighPriority ? base * 2 : base;
}

const STAGE_ORDER: Record<string, number> = { pre: 0, post: 2 };

function stageOf(rule: ParsedRule): number {
  return STAGE_ORDER[rule.stage ?? ''] ?? 1;
}

/**
 * Sort rules by stage (pre → normal → post), then by specificity score
 * (higher first), then by id for deterministic ordering.
 */
export function rankRules(rules: ParsedRule[]): ParsedRule[] {
  return [...rules].sort((a, b) => {
    const stageDiff = stageOf(a) - stageOf(b);
    if (stageDiff !== 0) return stageDiff;

    const scoreDiff = computeScore(b) - computeScore(a);
    if (scoreDiff !== 0) return scoreDiff;

    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Run all rules against a transaction in ranked order.
 * Returns a new transaction object with all applicable rules applied.
 */
export function runRules(
  rules: ParsedRule[],
  transaction: Record<string, unknown>,
): Record<string, unknown> {
  const ranked = rankRules(rules);
  let result = { ...transaction };
  for (const rule of ranked) {
    result = applyRule(rule, result);
  }
  return result;
}
