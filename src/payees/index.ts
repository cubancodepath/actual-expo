import { randomUUID } from 'expo-crypto';
import { runQuery, first } from '../db';
import { sendMessages } from '../sync';
import { Timestamp } from '../crdt';
import type { PayeeRow } from '../db/types';
import type { Payee } from './types';

function rowToPayee(r: PayeeRow): Payee {
  return {
    id: r.id,
    name: r.name,
    transfer_acct: r.transfer_acct,
    favorite: r.favorite === 1,
    tombstone: r.tombstone === 1,
  };
}

export async function getPayees(): Promise<Payee[]> {
  return (
    await runQuery<PayeeRow>(
      'SELECT * FROM payees WHERE tombstone = 0 ORDER BY name ASC',
    )
  ).map(rowToPayee);
}

export async function createPayee(
  fields: Pick<Payee, 'name'> & Partial<Pick<Payee, 'transfer_acct' | 'favorite'>>,
): Promise<string> {
  const id = randomUUID();
  const dbFields: Record<string, unknown> = {
    name: fields.name,
    transfer_acct: fields.transfer_acct ?? null,
    favorite: fields.favorite ? 1 : 0,
  };
  await sendMessages([
    ...Object.entries(dbFields).map(([column, value]) => ({
      timestamp: Timestamp.send()!, dataset: 'payees', row: id, column,
      value: value as string | number | null,
    })),
    // loot-core inserts a self-referencing mapping on every payee creation
    // so that payee_mapping can later be updated when payees are merged
    { timestamp: Timestamp.send()!, dataset: 'payee_mapping', row: id, column: 'targetId', value: id },
  ]);
  return id;
}

export async function updatePayee(
  id: string,
  fields: Partial<Pick<Payee, 'name' | 'favorite'>>,
): Promise<void> {
  const dbFields: Record<string, unknown> = {};
  if (fields.name !== undefined) dbFields.name = fields.name;
  if (fields.favorite !== undefined) dbFields.favorite = fields.favorite ? 1 : 0;
  if (Object.keys(dbFields).length === 0) return;
  await sendMessages(
    Object.entries(dbFields).map(([column, value]) => ({
      timestamp: Timestamp.send()!, dataset: 'payees', row: id, column,
      value: value as string | number | null,
    })),
  );
}

export async function deletePayee(id: string): Promise<void> {
  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: 'payees', row: id, column: 'tombstone', value: 1 },
  ]);
}

/** Find an existing payee by name (case-insensitive) or create a new one. */
export async function findOrCreatePayee(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const existing = await first<{ id: string }>(
    `SELECT id FROM payees WHERE LOWER(name) = LOWER(?) AND tombstone = 0 LIMIT 1`,
    [trimmed],
  );
  if (existing) return existing.id;

  const id = randomUUID();
  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: 'payees',         row: id, column: 'name',         value: trimmed },
    { timestamp: Timestamp.send()!, dataset: 'payees',         row: id, column: 'transfer_acct', value: null },
    { timestamp: Timestamp.send()!, dataset: 'payees',         row: id, column: 'favorite',      value: 0 },
    // Self-referencing mapping — same as loot-core's insertPayee()
    { timestamp: Timestamp.send()!, dataset: 'payee_mapping',  row: id, column: 'targetId',      value: id },
  ]);
  return id;
}
