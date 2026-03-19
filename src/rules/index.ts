/**
 * Rules module — CRUD + read-all for sync compatibility with Actual Budget.
 *
 * Rules store schedule conditions (payee, account, amount, date) and
 * link-schedule actions. Full rules engine is in the Rule class.
 */

import { randomUUID } from "expo-crypto";
import { sendMessages } from "../sync";
import { first, runQuery } from "../db";
import { Timestamp } from "../crdt";
import type { RuleRow } from "../db/types";
import type { RuleCondition, RuleAction, RuleStage } from "./types";
import { Rule } from "./rule";
import { RuleError } from "./errors";

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

function makeRule(row: RuleRow): Rule | null {
  try {
    const conditions = parseConditionsOrActions(row.conditions);
    const actions = parseConditionsOrActions(row.actions);

    return new Rule({
      id: row.id,
      stage: (row.stage as RuleStage) ?? null,
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
  const rows = await runQuery<RuleRow>(
    "SELECT * FROM rules WHERE tombstone = 0 AND conditions IS NOT NULL AND actions IS NOT NULL",
  );
  return rows.map(makeRule).filter((r): r is Rule => r !== null);
}

export async function getRuleById(id: string): Promise<Rule | null> {
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

export async function createRule(opts: {
  conditionsOp?: "and" | "or";
  conditions: RuleCondition[];
  actions: RuleAction[];
}): Promise<string> {
  const id = randomUUID();

  await sendMessages(
    Object.entries({
      stage: null,
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

export async function updateRule(
  id: string,
  fields: { conditions?: RuleCondition[]; conditionsOp?: string; actions?: RuleAction[] },
): Promise<void> {
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
}

export async function deleteRule(id: string): Promise<void> {
  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: "rules",
      row: id,
      column: "tombstone",
      value: 1,
    },
  ]);
}
