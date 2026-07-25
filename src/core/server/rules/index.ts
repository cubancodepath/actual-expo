/**
 * Rules module — CRUD + read-all for sync compatibility with Actual Budget.
 *
 * Rules store schedule conditions (payee, account, amount, date) and
 * link-schedule actions. Full rules engine is in the Rule class.
 */

import { randomUUID } from "@/core/platform/crypto";
import { sendMessages } from "@/core/sync";
import { undoable } from "@/core/server/undo";
import { first, runQuery } from "@/core/db";
import { Timestamp } from "@/core/crdt";
import type { RuleRow } from "@/core/db/types";
import type { RuleCondition, RuleAction, RuleStage } from "@/core/types/models";
import { Rule } from "./rule";
import { Condition } from "./condition";
import { Action } from "./action";
import { deserializeField, migrateIds } from "./rule-utils";
import { RuleError } from "./errors";
import { getMappings, ensureMappingsLoaded } from "@/core/db/mappings";

export { Rule };
export type { RuleCondition, RuleAction };

// ── Field name mapping (internal ↔ public) ──

const INTERNAL_TO_PUBLIC: Record<string, string> = {
  acct: "account",
  description: "payee",
  imported_description: "imported_payee",
  transferred_id: "transfer_id",
  isParent: "is_parent",
  isChild: "is_child",
};

const PUBLIC_TO_INTERNAL: Record<string, string> = {
  account: "acct",
  payee: "description",
  imported_payee: "imported_description",
  transfer_id: "transferred_id",
  is_parent: "isParent",
  is_child: "isChild",
};

function fromInternalField(item: Record<string, unknown>): Record<string, unknown> {
  if (item.field && typeof item.field === "string" && INTERNAL_TO_PUBLIC[item.field]) {
    return { ...item, field: INTERNAL_TO_PUBLIC[item.field] };
  }
  return item;
}

function parseConditionsOrActions(str: string | null): Record<string, unknown>[] {
  if (!str) return [];
  let value: unknown;
  try {
    value = typeof str === "string" ? JSON.parse(str) : str;
  } catch {
    throw new RuleError("internal", "Cannot parse rule json");
  }
  if (!Array.isArray(value)) {
    throw new RuleError("internal", "Rule json must be an array");
  }
  return value.map((item) => fromInternalField(item));
}

// ── Helpers ──

/**
 * Expands serialized condition fields (`amount-inflow`/`amount-outflow` →
 * `amount` + inflow/outflow option) so a stored inflow/outflow condition
 * constructs a valid `amount` Condition instead of throwing on an unknown
 * field. Merges the derived option under any explicitly-stored options.
 */
function expandConditionField(item: Record<string, unknown>): Record<string, unknown> {
  if (typeof item.field !== "string") return item;
  const { field, options } = deserializeField(item.field);
  if (field === item.field) return item;
  return {
    ...item,
    field,
    ...(options
      ? { options: { ...options, ...((item.options as Record<string, unknown>) ?? {}) } }
      : {}),
  };
}

/** Normalize a stored stage, folding legacy `cleanup`/`modify` into `pre`. */
function normalizeStage(stage: unknown): RuleStage {
  if (stage === "pre" || stage === "post") return stage;
  if (stage === "cleanup" || stage === "modify") return "pre";
  return null;
}

/**
 * Validate rule parts by constructing them — a Condition/Action constructor
 * throws RuleError on an invalid field/op/value, so this surfaces a bad rule at
 * write time instead of silently storing one that `makeRule` later skips.
 */
function validateConditions(conditions: RuleCondition[]): void {
  for (const raw of conditions.map((c) =>
    expandConditionField(c as unknown as Record<string, unknown>),
  )) {
    new Condition(
      raw.op as string,
      raw.field as string,
      raw.value,
      raw.options as Record<string, unknown> | undefined,
    );
  }
}

function validateActions(actions: RuleAction[]): void {
  for (const a of actions) {
    new Action(a.op, (a.field ?? null) as string | null, a.value, a.options);
  }
}

/**
 * Validate a rule's conditions/actions individually, returning per-item error
 * codes (or null when valid). Mirrors upstream server/rules/app.ts validateRule
 * — surfaces which condition/action is bad without throwing.
 */
export function validateRule(rule: { conditions: RuleCondition[]; actions: RuleAction[] }): {
  conditionErrors: (string | null)[];
  actionErrors: (string | null)[];
} | null {
  const conditionError = (raw: RuleCondition): string | null => {
    try {
      const c = expandConditionField(raw as unknown as Record<string, unknown>);
      new Condition(
        c.op as string,
        c.field as string,
        c.value,
        c.options as Record<string, unknown> | undefined,
      );
      return null;
    } catch (e) {
      return e instanceof RuleError ? e.type : "internal";
    }
  };
  const actionError = (a: RuleAction): string | null => {
    try {
      new Action(a.op, (a.field ?? null) as string | null, a.value, a.options);
      return null;
    } catch (e) {
      return e instanceof RuleError ? e.type : "internal";
    }
  };

  const conditionErrors = rule.conditions.map(conditionError);
  const actionErrors = rule.actions.map(actionError);
  if (conditionErrors.some(Boolean) || actionErrors.some(Boolean)) {
    return { conditionErrors, actionErrors };
  }
  return null;
}

export function makeRule(row: RuleRow): Rule | null {
  try {
    const conditions = parseConditionsOrActions(row.conditions).map(expandConditionField);
    const actions = parseConditionsOrActions(row.actions);

    const rule = new Rule({
      id: row.id,
      stage: normalizeStage(row.stage),
      conditionsOp: (row.conditions_op as "and" | "or") ?? "and",
      conditions: conditions as Array<{
        op: string;
        field: string;
        value: unknown;
        options?: Record<string, unknown>;
      }>,
      actions: actions as Array<{
        op: string;
        field?: string;
        value: unknown;
        options?: Record<string, unknown>;
      }>,
    });

    // Project payee/category ids to their merge target (mirrors loot-core's
    // makeRule → migrateIds). Reads the synchronous in-memory cache; callers
    // that need current mappings await ensureMappingsLoaded() first.
    migrateIds(rule, getMappings());
    return rule;
  } catch (e) {
    if (e instanceof RuleError) {
      console.warn(`[rules] Skipping invalid rule ${row.id}: ${e.message}`);
      return null;
    }
    console.warn(`[rules] Unexpected error loading rule ${row.id}:`, e);
    return null;
  }
}

// ── Queries ──

export async function getRules(): Promise<Rule[]> {
  // Authoritative rules now live in the in-memory store owned by
  // transaction-rules.ts (upstream layout). Delegate to it (dynamic import
  // breaks the module cycle — transaction-rules imports makeRule/createRule
  // from here). The store lazy-loads from the DB + ensures RSchedule/mappings.
  const { getRules: storeGetRules } = await import("@/core/server/transactions/transaction-rules");
  return storeGetRules();
}

export async function getRuleById(id: string): Promise<Rule | null> {
  await ensureMappingsLoaded();
  const row = await first<RuleRow>("SELECT * FROM rules WHERE id = ? AND tombstone = 0", [id]);
  if (!row) return null;
  return makeRule(row);
}

// ── Mutations ──

function toInternalField(item: Record<string, unknown>): Record<string, unknown> {
  if (item.field && typeof item.field === "string" && PUBLIC_TO_INTERNAL[item.field]) {
    return { ...item, field: PUBLIC_TO_INTERNAL[item.field] };
  }
  return item;
}

/**
 * Serialize rule conditions/actions to their stored JSON form (public → internal
 * field names). Inverse of `parseConditionsOrActions`. Upstream
 * `serializeConditionsOrActions`.
 */
export function serializeConditionsOrActions(arr: Record<string, unknown>[]): string {
  return JSON.stringify(arr.map((item) => toInternalField(item)));
}

/**
 * Rule row ↔ JS model, mirroring upstream `ruleModel` (validate / toJS / fromJS).
 * `toJS` parses the stored conditions/actions and maps `conditions_op →
 * conditionsOp`; `fromJS` does the reverse (serializing arrays). Used by import
 * paths (e.g. YNAB5) and any code that round-trips a raw rule row.
 */
export const ruleModel = {
  validate(rule: Record<string, unknown>, { update }: { update?: boolean } = {}) {
    if (!update && (rule.conditions == null || rule.actions == null)) {
      throw new RuleError("internal", "Rule must have conditions and actions");
    }
    if (!update || "stage" in rule) {
      const s = rule.stage;
      if (s !== "pre" && s !== "post" && s !== null) {
        throw new RuleError("internal", `Invalid rule stage: ${String(s)}`);
      }
    }
    if (!update || "conditionsOp" in rule) {
      if (!["and", "or"].includes(rule.conditionsOp as string)) {
        throw new RuleError("internal", `Invalid rule conditionsOp: ${String(rule.conditionsOp)}`);
      }
    }
    return rule;
  },

  toJS(row: Record<string, unknown>) {
    const { conditions, conditions_op, actions, ...fields } = row;
    return {
      ...fields,
      conditionsOp: conditions_op,
      conditions: parseConditionsOrActions(conditions as string | null),
      actions: parseConditionsOrActions(actions as string | null),
    };
  },

  fromJS(rule: Record<string, unknown>) {
    const { conditions, conditionsOp, actions, ...rest } = rule;
    const row = rest as Record<string, unknown>;
    if (conditionsOp) row.conditions_op = conditionsOp;
    if (Array.isArray(conditions)) {
      row.conditions = serializeConditionsOrActions(conditions as Record<string, unknown>[]);
    }
    if (Array.isArray(actions)) {
      row.actions = serializeConditionsOrActions(actions as Record<string, unknown>[]);
    }
    return row;
  },
};

export async function createRule(opts: {
  stage?: RuleStage;
  conditionsOp?: "and" | "or";
  conditions: RuleCondition[];
  actions: RuleAction[];
}): Promise<string> {
  // Reject invalid rules up front.
  validateConditions(opts.conditions);
  validateActions(opts.actions);

  const id = randomUUID();

  await sendMessages(
    Object.entries({
      stage: normalizeStage(opts.stage),
      conditions_op: opts.conditionsOp ?? "and",
      conditions: JSON.stringify(
        opts.conditions.map((c) => toInternalField(c as unknown as Record<string, unknown>)),
      ),
      actions: JSON.stringify(
        opts.actions.map((a) => toInternalField(a as unknown as Record<string, unknown>)),
      ),
      tombstone: 0,
    }).map(([column, value]) => ({
      timestamp: Timestamp.send()!,
      dataset: "rules",
      row: id,
      column,
      value: value as string | number | null,
    })),
  );

  return id;
}

export const updateRule = undoable(async function updateRule(
  id: string,
  fields: { conditions?: RuleCondition[]; conditionsOp?: string; actions?: RuleAction[] },
): Promise<void> {
  if (fields.conditions !== undefined || fields.actions !== undefined) {
    if (fields.conditions !== undefined) validateConditions(fields.conditions);
    if (fields.actions !== undefined) validateActions(fields.actions);
  }

  const dbFields: Record<string, string | number | null> = {};
  if (fields.conditions !== undefined) {
    dbFields.conditions = JSON.stringify(
      fields.conditions.map((c) => toInternalField(c as unknown as Record<string, unknown>)),
    );
  }
  if (fields.conditionsOp !== undefined) {
    dbFields.conditions_op = fields.conditionsOp;
  }
  if (fields.actions !== undefined) {
    dbFields.actions = JSON.stringify(
      fields.actions.map((a) => toInternalField(a as unknown as Record<string, unknown>)),
    );
  }
  if (Object.keys(dbFields).length === 0) return;

  await sendMessages(
    Object.entries(dbFields).map(([column, value]) => ({
      timestamp: Timestamp.send()!,
      dataset: "rules",
      row: id,
      column,
      value,
    })),
  );
});

/**
 * Tombstone a rule. By default refuses to delete a rule still referenced by a
 * live schedule (mirrors upstream's guard, protecting user-initiated deletion
 * from the rule-management UI). Schedule teardown passes `force` because it
 * deletes the schedule's own rule as part of removing the schedule.
 */
export const deleteRule = undoable(async function deleteRule(
  id: string,
  opts?: { force?: boolean },
): Promise<void> {
  if (!opts?.force) {
    const schedule = await first<{ id: string }>(
      "SELECT id FROM schedules WHERE rule = ? AND tombstone = 0",
      [id],
    );
    if (schedule) {
      throw new RuleError(
        "rule-referenced-by-schedule",
        "Cannot delete a rule that is linked to a schedule",
      );
    }
  }

  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: "rules",
      row: id,
      column: "tombstone",
      value: 1,
    },
  ]);
});

/** Tombstone every rule (upstream `rule-delete-all`). */
export const deleteAllRules = undoable(async function deleteAllRules(): Promise<void> {
  const rows = await runQuery<{ id: string }>("SELECT id FROM rules WHERE tombstone = 0");
  if (rows.length === 0) return;
  await sendMessages(
    rows.map((r) => ({
      timestamp: Timestamp.send()!,
      dataset: "rules",
      row: r.id,
      column: "tombstone",
      value: 1 as number,
    })),
  );
});
