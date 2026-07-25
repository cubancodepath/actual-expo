/**
 * Shared rule field/op metadata + value parse helpers.
 * Ported from loot-core/src/shared/rules.ts.
 *
 * This is the SHARED layer (no server/DB imports) — it holds the field-type
 * table, op validation, and the UI-facing value (un)parsers. The engine-only
 * helpers (ranking, id migration, recur-date parsing, etc.) live in
 * `@/core/server/rules/rule-utils`, which re-exports the field/op helpers from
 * here for backward compatibility.
 */

type FieldType = "date" | "id" | "saved" | "string" | "number" | "boolean";

// For now, this info is duplicated from the backend. Figure out how to share
// it later (upstream carries the same note).
const TYPE_INFO: Record<FieldType, { ops: string[]; nullable: boolean }> = {
  date: {
    ops: ["is", "isapprox", "gt", "gte", "lt", "lte"],
    nullable: false,
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
      "onBudget",
      "offBudget",
    ],
    nullable: true,
  },
  saved: {
    ops: [],
    nullable: false,
  },
  string: {
    ops: [
      "is",
      "contains",
      "matches",
      "oneOf",
      "isNot",
      "doesNotContain",
      "notOneOf",
      "hasTags",
      "hasAnyTag",
    ],
    nullable: true,
  },
  number: {
    ops: ["is", "isapprox", "isbetween", "gt", "gte", "lt", "lte"],
    nullable: false,
  },
  boolean: {
    ops: ["is"],
    nullable: false,
  },
};

type FieldInfo = {
  type: FieldType;
  disallowedOps?: Set<string>;
  internalOps?: Set<string>;
};

const fieldInfo: Record<string, FieldInfo> = {
  imported_payee: {
    type: "string",
    disallowedOps: new Set(["hasTags", "hasAnyTag"]),
  },
  payee: { type: "id", disallowedOps: new Set(["onBudget", "offBudget"]) },
  payee_name: { type: "string" },
  date: { type: "date" },
  notes: { type: "string", disallowedOps: new Set(["oneOf", "notOneOf"]) },
  amount: { type: "number" },
  category: {
    type: "id",
    disallowedOps: new Set(["onBudget", "offBudget"]),
    internalOps: new Set(["and"]),
  },
  category_group: {
    type: "id",
    disallowedOps: new Set(["onBudget", "offBudget"]),
    internalOps: new Set(["and"]),
  },
  account: { type: "id" },
  cleared: { type: "boolean" },
  reconciled: { type: "boolean" },
  saved: { type: "saved" },
  transfer: { type: "boolean" },
  parent: { type: "boolean" },
};

export const FIELD_TYPES = new Map<string, string>(
  Object.entries(fieldInfo).map(([field, info]) => [field, info.type]),
);

export function isValidOp(field: string, op: string): boolean {
  const type = FIELD_TYPES.get(field) as FieldType | undefined;
  if (!type) return false;
  if (fieldInfo[field].disallowedOps?.has(op)) return false;
  return TYPE_INFO[type].ops.includes(op) || (fieldInfo[field].internalOps?.has(op) ?? false);
}

export function getValidOps(field: string): string[] {
  const type = FIELD_TYPES.get(field) as FieldType | undefined;
  if (!type) return [];
  return TYPE_INFO[type].ops.filter((op) => !fieldInfo[field].disallowedOps?.has(op));
}

export function deserializeField(field: string): {
  field: string;
  options?: Record<string, unknown>;
} {
  if (field === "amount-inflow") {
    return { field: "amount", options: { inflow: true } };
  }
  if (field === "amount-outflow") {
    return { field: "amount", options: { outflow: true } };
  }
  return { field };
}

export function getFieldError(type: string): string {
  switch (type) {
    case "date-format":
      return "Invalid date format";
    case "no-null":
    case "no-empty-array":
    case "no-empty-string":
      return "Value cannot be empty";
    case "not-string":
      return "Value must be a string";
    case "not-boolean":
      return "Value must be a boolean";
    case "not-number":
      return "Value must be a number";
    case "invalid-field":
      return "Please choose a valid field for this type of rule";
    case "invalid-template":
      return "Invalid handlebars template";
    default:
      return "Internal error, sorry! Please get in touch https://actualbudget.org/contact/ for support";
  }
}

export function sortNumbers(num1: number, num2: number): [number, number] {
  return num1 < num2 ? [num1, num2] : [num2, num1];
}

export function getApproxNumberThreshold(number: number): number {
  return Math.round(Math.abs(number) * 0.075);
}

// ── UI-facing value (un)parsers ──

type RuleItem = {
  op?: string;
  type?: string;
  value?: unknown;
  options?: { method?: string; [k: string]: unknown };
  error?: unknown;
  inputKey?: unknown;
  [k: string]: unknown;
};

export function parse(item: RuleItem): RuleItem {
  if (item.op === "set-split-amount") {
    if (item.options?.method === "fixed-amount") {
      return { ...item };
    }
    return item;
  }

  switch (item.type) {
    case "number": {
      return { ...item };
    }
    case "string": {
      const parsed = item.value == null ? "" : item.value;
      return { ...item, value: parsed };
    }
    case "boolean": {
      const parsed = item.value;
      return { ...item, value: parsed };
    }
    default:
  }

  return { ...item, error: null };
}

export function unparse({ error: _error, inputKey: _inputKey, ...item }: RuleItem): RuleItem {
  if (item.op === "set-split-amount") {
    if (item.options?.method === "fixed-amount") {
      return { ...item };
    }
    if (item.options?.method === "fixed-percent") {
      return {
        ...item,
        value: item.value != null && parseFloat(item.value as string),
      };
    }
    return item;
  }

  switch (item.type) {
    case "number": {
      return { ...item };
    }
    case "string": {
      const unparsed = item.value == null ? "" : item.value;
      return { ...item, value: unparsed };
    }
    case "boolean": {
      const unparsed = item.value == null ? false : item.value;
      return { ...item, value: unparsed };
    }
    default:
  }

  return item;
}

export function makeValue(value: unknown, cond: RuleItem): RuleItem {
  const isMulti = ["oneOf", "notOneOf"].includes(cond.op ?? "");

  if (isMulti) {
    return { ...cond, error: null, value: value || [] };
  }

  if (cond.type === "number" && value == null) {
    return { ...cond, error: null, value: 0 };
  }

  return { ...cond, error: null, value };
}
