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
  | "hasTags"
  | "hasAnyTag"
  | "onBudget"
  | "offBudget";

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

// NOTE: the runtime FIELD_TYPES map lives in the rules module (rule-utils.ts),
// matching upstream loot-core where models/rule.ts is types-only.
