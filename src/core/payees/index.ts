import { randomUUID } from "expo-crypto";
import { runQuery, first } from "../db";
import { sendMessages } from "../sync";
import { undoable } from "../sync/undo";
import { Timestamp } from "../crdt";
import type { PayeeRow } from "../db/types";
import type { Payee } from "./types";

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
  // Mirrors loot-core's getPayees(): join with accounts so transfer payees show
  // the account name. Transfer payees are listed first (transfer_acct IS NOT NULL).
  const rows = await runQuery<PayeeRow & { display_name: string }>(
    `SELECT p.id,
            COALESCE(a.name, p.name) AS display_name,
            p.transfer_acct,
            p.favorite,
            p.tombstone
     FROM payees p
     LEFT JOIN accounts a ON p.transfer_acct = a.id AND a.tombstone = 0
     WHERE p.tombstone = 0
       AND (p.transfer_acct IS NULL OR a.id IS NOT NULL)
     ORDER BY p.transfer_acct IS NULL, COALESCE(a.name, p.name) COLLATE NOCASE`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.display_name,
    transfer_acct: r.transfer_acct,
    favorite: r.favorite === 1,
    tombstone: r.tombstone === 1,
  }));
}

export const createPayee = undoable(async function createPayee(
  fields: Pick<Payee, "name"> & Partial<Pick<Payee, "transfer_acct" | "favorite">>,
): Promise<string> {
  const id = randomUUID();
  const dbFields: Record<string, unknown> = {
    name: fields.name,
    transfer_acct: fields.transfer_acct ?? null,
    favorite: fields.favorite ? 1 : 0,
  };
  await sendMessages([
    ...Object.entries(dbFields).map(([column, value]) => ({
      timestamp: Timestamp.send()!,
      dataset: "payees",
      row: id,
      column,
      value: value as string | number | null,
    })),
    // loot-core inserts a self-referencing mapping on every payee creation
    // so that payee_mapping can later be updated when payees are merged
    {
      timestamp: Timestamp.send()!,
      dataset: "payee_mapping",
      row: id,
      column: "targetId",
      value: id,
    },
  ]);
  return id;
});

export const updatePayee = undoable(async function updatePayee(
  id: string,
  fields: Partial<Pick<Payee, "name" | "favorite">>,
): Promise<void> {
  const dbFields: Record<string, unknown> = {};
  if (fields.name !== undefined) dbFields.name = fields.name;
  if (fields.favorite !== undefined) dbFields.favorite = fields.favorite ? 1 : 0;
  if (Object.keys(dbFields).length === 0) return;
  await sendMessages(
    Object.entries(dbFields).map(([column, value]) => ({
      timestamp: Timestamp.send()!,
      dataset: "payees",
      row: id,
      column,
      value: value as string | number | null,
    })),
  );
});

export const deletePayee = undoable(async function deletePayee(id: string): Promise<void> {
  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: "payees", row: id, column: "tombstone", value: 1 },
  ]);
});

/**
 * Merge one or more payees into a target payee via payee_mapping redirects.
 * Transfer payees are excluded. Merged payees are tombstoned.
 */
export const mergePayees = undoable(async function mergePayees(
  targetId: string,
  ids: string[],
): Promise<void> {
  // Validate target is not a transfer payee
  const target = await first<PayeeRow>("SELECT * FROM payees WHERE id = ? AND tombstone = 0", [
    targetId,
  ]);
  if (!target || target.transfer_acct != null) return;

  // Filter out transfer payees and the target itself
  const candidates = await runQuery<PayeeRow>(
    `SELECT * FROM payees WHERE id IN (${ids.map(() => "?").join(",")}) AND tombstone = 0`,
    ids,
  );
  const mergeIds = candidates
    .filter((p) => p.transfer_acct == null && p.id !== targetId)
    .map((p) => p.id);
  if (mergeIds.length === 0) return;

  const messages: Parameters<typeof sendMessages>[0] = [];

  for (const id of mergeIds) {
    // Find all mappings currently pointing to this payee and redirect to target
    const mappings = await runQuery<{ id: string }>(
      "SELECT id FROM payee_mapping WHERE targetId = ?",
      [id],
    );
    for (const m of mappings) {
      messages.push({
        timestamp: Timestamp.send()!,
        dataset: "payee_mapping",
        row: m.id,
        column: "targetId",
        value: targetId,
      });
    }
    // Update the payee's own mapping to point to target
    messages.push({
      timestamp: Timestamp.send()!,
      dataset: "payee_mapping",
      row: id,
      column: "targetId",
      value: targetId,
    });
    // Tombstone the merged payee
    messages.push({
      timestamp: Timestamp.send()!,
      dataset: "payees",
      row: id,
      column: "tombstone",
      value: 1,
    });
  }

  await sendMessages(messages);
});

/** Find an existing payee by name (case-insensitive). Returns the ID or null. */
export async function findPayeeByName(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const row = await first<{ id: string }>(
    `SELECT id FROM payees WHERE LOWER(name) = LOWER(?) AND tombstone = 0 LIMIT 1`,
    [trimmed],
  );
  return row?.id ?? null;
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
    { timestamp: Timestamp.send()!, dataset: "payees", row: id, column: "name", value: trimmed },
    {
      timestamp: Timestamp.send()!,
      dataset: "payees",
      row: id,
      column: "transfer_acct",
      value: null,
    },
    { timestamp: Timestamp.send()!, dataset: "payees", row: id, column: "favorite", value: 0 },
    // Self-referencing mapping — same as loot-core's insertPayee()
    {
      timestamp: Timestamp.send()!,
      dataset: "payee_mapping",
      row: id,
      column: "targetId",
      value: id,
    },
  ]);
  return id;
}
