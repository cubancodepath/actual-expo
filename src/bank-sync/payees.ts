// ---------------------------------------------------------------------------
// Bank Sync — Payee resolution
//
// Resolves bank payee names to local payee IDs, creating new payees as needed.
// ---------------------------------------------------------------------------

import { randomUUID } from "expo-crypto";
import { first } from "../db";
import { sendMessages } from "../sync";
import { Timestamp } from "../crdt";

/**
 * Tracks payees created during a single sync batch to avoid duplicates.
 * Call `reset()` before starting a new sync operation.
 */
const createdPayees = new Map<string, string>();

export function resetCreatedPayees(): void {
  createdPayees.clear();
}

/**
 * Resolve a bank payee name to a local payee ID.
 *
 * 1. Check if we already created this payee in the current batch
 * 2. Look up existing payee by name (case-insensitive, non-transfer)
 * 3. Create a new payee if not found
 */
export async function resolvePayee(payeeName: string): Promise<string> {
  if (!payeeName) return "";

  const normalizedName = payeeName.trim().toLowerCase();

  // Check batch cache
  const cached = createdPayees.get(normalizedName);
  if (cached) return cached;

  // Look up existing payee (exclude transfer payees)
  const existing = await first<{ id: string }>(
    `SELECT id FROM payees WHERE LOWER(name) = ? AND tombstone = 0 AND transfer_acct IS NULL LIMIT 1`,
    [normalizedName],
  );

  if (existing) {
    createdPayees.set(normalizedName, existing.id);
    return existing.id;
  }

  // Create new payee
  const id = randomUUID();
  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: "payees", row: id, column: "name", value: payeeName.trim() },
    { timestamp: Timestamp.send()!, dataset: "payees", row: id, column: "transfer_acct", value: null },
    { timestamp: Timestamp.send()!, dataset: "payees", row: id, column: "favorite", value: 0 },
  ]);

  createdPayees.set(normalizedName, id);
  return id;
}
