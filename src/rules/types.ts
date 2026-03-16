/** Rule domain types — enhanced from original Actual Budget */

// ── Condition operators ──

export type ConditionOp =
  | "is"
  | "isNot"
  | "contains"
  | "doesNotContain"
  | "matches"
  | "oneOf"
  | "notOneOf"
  | "isapprox"
  | "isbetween"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "hasTags";

// ── Action operators ──

export type ActionOp =
  | "set"
  | "set-split-amount"
  | "link-schedule"
  | "prepend-notes"
  | "append-notes"
  | "delete-transaction";

// ── Rule stage ──

export type RuleStage = "pre" | "post" | null;

// ── Condition & Action ──

export type RuleCondition = {
  field: string;
  op: string;
  value: unknown;
  type?: string;
  options?: Record<string, unknown>;
};

export type RuleAction = {
  op: string;
  field?: string;
  value: unknown;
  type?: string;
  options?: Record<string, unknown>;
};

// ── Parsed rule (from DB) ──

export type ParsedRule = {
  id: string;
  stage: RuleStage;
  conditions: RuleCondition[];
  actions: RuleAction[];
  conditionsOp: "and" | "or";
};

// ── Field type mapping ──

export const FIELD_TYPES: Record<string, string> = {
  imported_payee: "string",
  payee: "id",
  payee_name: "string",
  date: "date",
  notes: "string",
  amount: "number",
  category: "id",
  category_group: "id",
  account: "id",
  cleared: "boolean",
  reconciled: "boolean",
  transfer: "boolean",
  parent: "boolean",
};

// ── Field name mapping (public rule field → internal DB column) ──

export const INTERNAL_FIELD_MAP: Record<string, string> = {
  account: "acct",
  payee: "description",
  imported_payee: "imported_description",
  transfer_id: "transferred_id",
  is_parent: "isParent",
  is_child: "isChild",
};
