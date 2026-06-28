/**
 * Condition class — validates and evaluates rule conditions.
 * Ported from loot-core/src/server/rules/condition.ts
 */

import { addDays, subDays, isAfter, isBefore, parseISO, format } from "date-fns";

import {
  assert,
  parseDateString,
  parseBetweenAmount,
  parseRecurDate,
  sortNumbers,
  getApproxNumberThreshold,
  FIELD_TYPES,
  isValidOp,
} from "./rule-utils";

// ── Date helpers (matching loot-core's months.ts interface) ──

function parseDate(str: string): Date {
  return parseISO(str);
}

function addDaysStr(dateStr: string, days: number): string {
  return format(addDays(parseISO(dateStr), days), "yyyy-MM-dd");
}

function subDaysStr(dateStr: string, days: number): string {
  return format(subDays(parseISO(dateStr), days), "yyyy-MM-dd");
}

function monthFromDate(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

function yearFromDate(dateStr: string): string {
  return dateStr.slice(0, 4); // "YYYY"
}

// ── Condition types (type-specific parsing) ──

type ConditionTypeInfo = {
  ops: readonly string[];
  nullable: boolean;
  parse?: (op: string, value: unknown, fieldName: string) => unknown;
};

export const CONDITION_TYPES: Record<string, ConditionTypeInfo> = {
  date: {
    ops: ["is", "isapprox", "gt", "gte", "lt", "lte"],
    nullable: false,
    parse(op, value, fieldName) {
      const parsed =
        typeof value === "string"
          ? parseDateString(value)
          : value && typeof value === "object" && "frequency" in (value as Record<string, unknown>)
            ? parseRecurDate(value as Record<string, unknown>)
            : null;

      assert(parsed, "date-format", `Invalid date format (field: ${fieldName})`);

      if (op === "isapprox") {
        assert(
          parsed.type === "date" || parsed.type === "recur",
          "date-format",
          `Invalid date value for "isapprox" (field: ${fieldName})`,
        );
      } else if (op === "gt" || op === "gte" || op === "lt" || op === "lte") {
        assert(
          parsed.type === "date",
          "date-format",
          `Invalid date value for "${op}" (field: ${fieldName})`,
        );
      }

      return parsed;
    },
  },
  id: {
    ops: [
      "is",
      "contains",
      "matches",
      "oneOf",
      "isNot",
      "doesNotContain",
      "notOneOf",
      "and",
      "onBudget",
      "offBudget",
    ],
    nullable: true,
    parse(op, value, fieldName) {
      if (op === "oneOf" || op === "notOneOf" || op === "and") {
        assert(
          Array.isArray(value),
          "no-empty-array",
          `oneOf must have an array value (field: ${fieldName})`,
        );
        return value;
      }
      return value;
    },
  },
  string: {
    ops: ["is", "contains", "matches", "oneOf", "isNot", "doesNotContain", "notOneOf", "hasTags"],
    nullable: true,
    parse(op, value, fieldName) {
      if (op === "oneOf" || op === "notOneOf") {
        assert(
          Array.isArray(value),
          "no-empty-array",
          `oneOf must have an array value (field: ${fieldName}): ${JSON.stringify(value)}`,
        );
        return (value as unknown[]).filter(Boolean).map((val) => String(val).toLowerCase());
      }

      assert(typeof value === "string", "not-string", `Invalid string value (field: ${fieldName})`);

      if (op === "contains" || op === "matches" || op === "doesNotContain" || op === "hasTags") {
        assert(
          (value as string).length > 0,
          "no-empty-string",
          `${op} must have non-empty string (field: ${fieldName})`,
        );
      }

      if (op === "hasTags") return value;

      return (value as string).toLowerCase();
    },
  },
  number: {
    ops: ["is", "isapprox", "isbetween", "gt", "gte", "lt", "lte"],
    nullable: false,
    parse(op, value, fieldName) {
      const parsed =
        typeof value === "number" ? { type: "literal" as const, value } : parseBetweenAmount(value);

      assert(
        parsed != null,
        "not-number",
        `Value must be a number or between amount: ${JSON.stringify(value)} (field: ${fieldName})`,
      );

      if (op === "isbetween") {
        assert(
          parsed.type === "between",
          "number-format",
          `Invalid between value for "${op}" (field: ${fieldName})`,
        );
      } else {
        assert(
          parsed.type === "literal",
          "number-format",
          `Invalid number value for "${op}" (field: ${fieldName})`,
        );
      }

      return parsed;
    },
  },
  boolean: {
    ops: ["is"],
    nullable: false,
    parse(_op, value, fieldName) {
      assert(
        typeof value === "boolean",
        "not-boolean",
        `Value must be a boolean: ${value} (field: ${fieldName})`,
      );
      return value;
    },
  },
};

// ── Condition class ──

export class Condition {
  field: string;
  op: string;
  options: Record<string, unknown> | undefined;
  rawValue: unknown;
  type: string;
  unparsedValue: unknown;
  value: unknown;

  constructor(op: string, field: string, value: unknown, options?: Record<string, unknown>) {
    const typeName = FIELD_TYPES.get(field);
    assert(typeName, "internal", "Invalid condition field: " + field);

    const type = CONDITION_TYPES[typeName];
    assert(type, "internal", `Invalid condition type: ${typeName} (field: ${field})`);
    assert(
      isValidOp(field, op),
      "internal",
      `Invalid condition operator: ${op} (type: ${typeName}, field: ${field})`,
    );

    if (type.nullable !== true) {
      assert(value != null, "no-null", `Field cannot be empty: ${field}`);
    }

    if (typeName === "string" && type.nullable !== true) {
      assert(value !== "", "no-null", `Field cannot be empty: ${field}`);
    }

    this.rawValue = value;
    this.unparsedValue = value;
    this.op = op;
    this.field = field;
    this.value = type.parse ? type.parse(op, value, field) : value;
    this.options = options;
    this.type = typeName;
  }

  eval(object: Record<string, unknown>): boolean {
    let fieldValue = object[this.field];
    const type = this.type;

    if (type === "string") {
      fieldValue ??= "";
    }

    if (fieldValue === undefined) return false;

    if (typeof fieldValue === "string") {
      fieldValue = fieldValue.toLowerCase();
    }

    if (type === "number" && this.options) {
      if (this.options.outflow) {
        if ((fieldValue as number) > 0) return false;
        fieldValue = -(fieldValue as number);
      } else if (this.options.inflow) {
        if ((fieldValue as number) < 0) return false;
      }
    }

    const extractValue = (v: unknown) => (type === "number" ? (v as { value: number }).value : v);

    switch (this.op) {
      case "isapprox":
      case "is":
        if (type === "date") {
          if (fieldValue == null) return false;
          const parsed = this.value as {
            type: string;
            date?: string;
            schedule?: {
              occursOn: (opts: unknown) => boolean;
              occursBetween: (start: Date, end: Date) => boolean;
            };
          };

          if (parsed.type === "recur") {
            const { schedule } = parsed;
            if (!schedule) return false;
            if (this.op === "isapprox") {
              const fieldDate = parseDate(fieldValue as string);
              return schedule.occursBetween(subDays(fieldDate, 2), addDays(fieldDate, 2));
            }
            return schedule.occursOn({ date: parseDate(fieldValue as string) });
          }

          const { date } = parsed;
          if (!date) return false;

          if (this.op === "isapprox") {
            const high = addDaysStr(date, 2);
            const low = subDaysStr(date, 2);
            return (fieldValue as string) >= low && (fieldValue as string) <= high;
          }

          switch (parsed.type) {
            case "date":
              return fieldValue === date;
            case "month":
              return monthFromDate(fieldValue as string) === date;
            case "year":
              return yearFromDate(fieldValue as string) === date;
          }
        } else if (type === "number") {
          const number = (this.value as { value: number }).value;
          if (this.op === "isapprox") {
            const threshold = getApproxNumberThreshold(number);
            return (
              (fieldValue as number) >= number - threshold &&
              (fieldValue as number) <= number + threshold
            );
          }
          return fieldValue === number;
        }
        return fieldValue === this.value;

      case "isNot":
        return fieldValue !== this.value;

      case "isbetween": {
        const between = this.value as { num1: number; num2: number };
        const [low, high] = sortNumbers(between.num1, between.num2);
        return (fieldValue as number) >= low && (fieldValue as number) <= high;
      }

      case "contains":
        if (fieldValue === null) return false;
        return String(fieldValue).indexOf(this.value as string) !== -1;

      case "doesNotContain":
        if (fieldValue === null) return false;
        return String(fieldValue).indexOf(this.value as string) === -1;

      case "oneOf":
        if (fieldValue === null) return false;
        return (this.value as unknown[]).indexOf(fieldValue) !== -1;

      case "hasTags":
        if (fieldValue === null) return false;
        return String(fieldValue).indexOf(this.value as string) !== -1;

      case "notOneOf":
        if (fieldValue === null) return false;
        return (this.value as unknown[]).indexOf(fieldValue) === -1;

      case "gt":
        if (fieldValue === null) return false;
        if (type === "date")
          return isAfter(
            parseDate(fieldValue as string),
            parseDate((this.value as { date: string }).date),
          );
        return (fieldValue as number) > (extractValue(this.value) as number);

      case "gte":
        if (fieldValue === null) return false;
        if (type === "date") {
          return (
            fieldValue === (this.value as { date: string }).date ||
            isAfter(
              parseDate(fieldValue as string),
              parseDate((this.value as { date: string }).date),
            )
          );
        }
        return (fieldValue as number) >= (extractValue(this.value) as number);

      case "lt":
        if (fieldValue === null) return false;
        if (type === "date")
          return isBefore(
            parseDate(fieldValue as string),
            parseDate((this.value as { date: string }).date),
          );
        return (fieldValue as number) < (extractValue(this.value) as number);

      case "lte":
        if (fieldValue === null) return false;
        if (type === "date") {
          return (
            fieldValue === (this.value as { date: string }).date ||
            isBefore(
              parseDate(fieldValue as string),
              parseDate((this.value as { date: string }).date),
            )
          );
        }
        return (fieldValue as number) <= (extractValue(this.value) as number);

      case "matches":
        if (fieldValue === null) return false;
        try {
          return new RegExp(this.value as string).test(fieldValue as string);
        } catch {
          return false;
        }

      case "onBudget":
        if (!object._account) return false;
        return (object._account as { offbudget: number }).offbudget === 0;

      case "offBudget":
        if (!object._account) return false;
        return (object._account as { offbudget: number }).offbudget === 1;
    }

    return false;
  }

  getValue(): unknown {
    return this.value;
  }

  serialize(): Record<string, unknown> {
    return {
      op: this.op,
      field: this.field,
      value: this.unparsedValue,
      type: this.type,
      ...(this.options ? { options: this.options } : null),
    };
  }
}
