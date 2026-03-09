/**
 * Rules module — minimal CRUD for sync compatibility with Actual Budget.
 *
 * Rules store schedule conditions (payee, account, amount, date) and
 * link-schedule actions. Full rules engine is deferred.
 */

import { randomUUID } from 'expo-crypto';
import { sendMessages } from '../sync';
import { first } from '../db';
import { Timestamp } from '../crdt';
import type { RuleRow } from '../db/types';
import type { RuleCondition, RuleAction } from '../schedules/types';

export type ParsedRule = {
  id: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  conditionsOp: string;
};

export async function createRule(opts: {
  conditionsOp?: 'and' | 'or';
  conditions: RuleCondition[];
  actions: RuleAction[];
}): Promise<string> {
  const id = randomUUID();

  await sendMessages(
    Object.entries({
      stage: null,
      conditions_op: opts.conditionsOp ?? 'and',
      conditions: JSON.stringify(opts.conditions),
      actions: JSON.stringify(opts.actions),
      tombstone: 0,
    }).map(([column, value]) => ({
      timestamp: Timestamp.send()!,
      dataset: 'rules',
      row: id,
      column,
      value: value as string | number | null,
    })),
  );

  return id;
}

export async function updateRule(
  id: string,
  fields: { conditions?: RuleCondition[]; conditionsOp?: string },
): Promise<void> {
  const dbFields: Record<string, string | number | null> = {};
  if (fields.conditions !== undefined) {
    dbFields.conditions = JSON.stringify(fields.conditions);
  }
  if (fields.conditionsOp !== undefined) {
    dbFields.conditions_op = fields.conditionsOp;
  }
  if (Object.keys(dbFields).length === 0) return;

  await sendMessages(
    Object.entries(dbFields).map(([column, value]) => ({
      timestamp: Timestamp.send()!,
      dataset: 'rules',
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
      dataset: 'rules',
      row: id,
      column: 'tombstone',
      value: 1,
    },
  ]);
}

export async function getRuleById(id: string): Promise<ParsedRule | null> {
  const row = await first<RuleRow>(
    'SELECT * FROM rules WHERE id = ? AND tombstone = 0',
    [id],
  );
  if (!row) return null;
  return {
    id: row.id,
    conditions: row.conditions ? JSON.parse(row.conditions) : [],
    actions: row.actions ? JSON.parse(row.actions) : [],
    conditionsOp: row.conditions_op ?? 'and',
  };
}
