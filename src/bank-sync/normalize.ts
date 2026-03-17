// ---------------------------------------------------------------------------
// Bank Sync — Normalize bank transactions to internal format
// ---------------------------------------------------------------------------

import { strToInt } from "../lib/date";
import type { BankTransaction } from "./types";

/** Internal representation of a normalized bank transaction, ready for matching */
export type NormalizedTransaction = {
  payee_name: string;
  trans: {
    amount: number; // integer cents
    date: number; // YYYYMMDD
    imported_id: string | null;
    imported_description: string | null;
    cleared: boolean;
    notes: string | null;
    category: string | null;
    raw_synced_data: string;
  };
};

/**
 * Convert a string amount (e.g. "-12.50") to integer cents (-1250).
 * Equivalent to loot-core's amountToInteger but handles string input.
 */
export function amountStringToInteger(amount: string): number {
  return Math.round(parseFloat(amount) * 100);
}

/**
 * Build the imported_id for deduplication.
 *
 * Priority:
 * 1. transactionId if present
 * 2. For booked transactions without transactionId: `{acctId}-{internalTransactionId}`
 * 3. null (no stable ID available)
 */
function buildImportedId(tx: BankTransaction, acctId: string): string | null {
  if (tx.transactionId) return tx.transactionId;
  if (tx.booked && tx.internalTransactionId) {
    return `${acctId}-${tx.internalTransactionId}`;
  }
  return null;
}

/**
 * Normalize raw bank transactions into the internal format used by the matching engine.
 *
 * Ported from loot-core's normalizeBankSyncTransactions().
 */
export function normalizeBankTransactions(
  bankTransactions: BankTransaction[],
  acctId: string,
): NormalizedTransaction[] {
  const normalized: NormalizedTransaction[] = [];

  for (const tx of bankTransactions) {
    const payeeName = tx.payeeName?.trim() ?? "";
    const dateInt = strToInt(tx.date);
    if (dateInt == null) continue; // skip transactions with invalid dates

    const amount = amountStringToInteger(tx.transactionAmount.amount);
    const importedId = buildImportedId(tx, acctId);
    const notes = tx.notes ? tx.notes.trim().replace(/#/g, "##") : null;

    normalized.push({
      payee_name: payeeName,
      trans: {
        amount,
        date: dateInt,
        imported_id: importedId,
        imported_description: payeeName || null,
        cleared: Boolean(tx.booked),
        notes,
        category: null,
        raw_synced_data: JSON.stringify(tx),
      },
    });
  }

  return normalized;
}
