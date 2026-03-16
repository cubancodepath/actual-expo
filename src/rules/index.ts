/**
 * Rules module — CRUD + read-all for sync compatibility with Actual Budget.
 *
 * Rules store schedule conditions (payee, account, amount, date) and
 * link-schedule actions. Full rules engine is in engine.ts.
 */

import { randomUUID } from "expo-crypto";
import { sendMessages } from "../sync";
import { first, runQuery } from "../db";
import { Timestamp } from "../crdt";
import type { RuleRow } from "../db/types";
import type { ParsedRule, RuleStage, RuleCondition, RuleAction } from "./types";

export type { ParsedRule, RuleCondition, RuleAction };

// ── Helpers ──

function rowToRule(row: RuleRow): ParsedRule {
  return {
    id: row.id,
    stage: (row.stage as RuleStage) ?? null,
    conditions: row.conditions ? JSON.parse(row.conditions) : [],
    actions: row.actions ? JSON.parse(row.actions) : [],
    conditionsOp: (row.conditions_op as "and" | "or") ?? "and",
  };
}

// ── Queries ──

export async function getRules(): Promise<ParsedRule[]> {
  const rows = await runQuery<RuleRow>(
    "SELECT * FROM rules WHERE tombstone = 0 AND conditions IS NOT NULL AND actions IS NOT NULL",
  );
  return rows.map(rowToRule);
}

export async function getRuleById(id: string): Promise<ParsedRule | null> {
  const row = await first<RuleRow>("SELECT * FROM rules WHERE id = ? AND tombstone = 0", [id]);
  if (!row) return null;
  return rowToRule(row);
}

// ── Mutations ──

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
      conditions: JSON.stringify(opts.conditions),
      actions: JSON.stringify(opts.actions),
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
    dbFields.conditions = JSON.stringify(fields.conditions);
  }
  if (fields.conditionsOp !== undefined) {
    dbFields.conditions_op = fields.conditionsOp;
  }
  if (fields.actions !== undefined) {
    dbFields.actions = JSON.stringify(fields.actions);
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
