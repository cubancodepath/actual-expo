import { randomUUID } from 'expo-crypto';
import { runQuery } from '../db';
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
  const ts = Timestamp.send()!;
  const dbFields: Record<string, unknown> = {
    name: fields.name,
    transfer_acct: fields.transfer_acct ?? null,
    favorite: fields.favorite ? 1 : 0,
  };
  await sendMessages(
    Object.entries(dbFields).map(([column, value]) => ({
      timestamp: ts, dataset: 'payees', row: id, column,
      value: value as string | number | null,
    })),
  );
  return id;
}

export async function updatePayee(
  id: string,
  fields: Partial<Pick<Payee, 'name' | 'favorite'>>,
): Promise<void> {
  const ts = Timestamp.send()!;
  const dbFields: Record<string, unknown> = {};
  if (fields.name !== undefined) dbFields.name = fields.name;
  if (fields.favorite !== undefined) dbFields.favorite = fields.favorite ? 1 : 0;
  if (Object.keys(dbFields).length === 0) return;
  await sendMessages(
    Object.entries(dbFields).map(([column, value]) => ({
      timestamp: ts, dataset: 'payees', row: id, column,
      value: value as string | number | null,
    })),
  );
}

export async function deletePayee(id: string): Promise<void> {
  const ts = Timestamp.send()!;
  await sendMessages([
    { timestamp: ts, dataset: 'payees', row: id, column: 'tombstone', value: 1 },
  ]);
}
