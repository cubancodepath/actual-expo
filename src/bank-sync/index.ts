// ---------------------------------------------------------------------------
// Bank Sync — Orchestrator
//
// High-level operations: sync an account, link/unlink accounts.
// ---------------------------------------------------------------------------

import { randomUUID } from "expo-crypto";
import { first } from "../db";
import { sendMessages, batchMessages } from "../sync";
import { Timestamp } from "../crdt";
import { intToStr, todayInt } from "../lib/date";
import {
  getGoCardlessTransactions,
  getSimpleFinTransactions,
  isBankSyncError,
} from "./service";
import { reconcileTransactions } from "./reconcile";
import type { BankSyncProvider, BankSyncResult, BankSyncErrorResponse } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AccountSyncInfo = {
  id: string;
  account_sync_source: string | null;
  bank: string | null; // bank_id in banks table (requisitionId for GoCardless)
  account_id: string | null; // remote account id
  last_sync: string | null;
};

export class BankSyncError extends Error {
  errorType: string;
  errorCode: string;

  constructor(errorResponse: BankSyncErrorResponse) {
    super(errorResponse.reason ?? `${errorResponse.error_type}: ${errorResponse.error_code}`);
    this.name = "BankSyncError";
    this.errorType = errorResponse.error_type;
    this.errorCode = errorResponse.error_code;
  }
}

// ---------------------------------------------------------------------------
// Sync a linked account
// ---------------------------------------------------------------------------

/**
 * Sync a single bank-linked account: fetch transactions from the bank provider
 * and reconcile with local data.
 *
 * @throws {BankSyncError} if the bank provider returns an error
 * @throws {Error} if the account is not linked to a bank
 */
export async function syncAccount(localAccountId: string): Promise<BankSyncResult> {
  // Read account's bank sync info
  const account = await first<AccountSyncInfo>(
    `SELECT id, account_sync_source, bank, account_id, last_sync
     FROM accounts WHERE id = ? AND tombstone = 0`,
    [localAccountId],
  );

  if (!account?.account_sync_source || !account.account_id) {
    throw new Error("Account is not linked to a bank sync provider");
  }

  const provider = account.account_sync_source as BankSyncProvider;

  // Calculate start date: last_sync or 90 days ago
  const startDate = calculateStartDate(account.last_sync);

  // Fetch transactions from the bank provider
  const response =
    provider === "goCardless"
      ? await getGoCardlessTransactions(
          account.bank!, // requisitionId
          account.account_id,
          startDate,
        )
      : await getSimpleFinTransactions(account.account_id, startDate);

  // Handle error responses
  if (isBankSyncError(response)) {
    throw new BankSyncError(response);
  }

  // Reconcile with local data
  const allTransactions = [...response.transactions.booked, ...response.transactions.pending];
  const result = await reconcileTransactions(localAccountId, allTransactions);

  // Update last_sync timestamp
  const now = new Date().toISOString();
  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: "accounts",
      row: localAccountId,
      column: "last_sync",
      value: now,
    },
  ]);

  return result;
}

// ---------------------------------------------------------------------------
// Link / Unlink
// ---------------------------------------------------------------------------

/**
 * Link a local account to a bank sync provider.
 * Creates a bank record if needed (for GoCardless requisitions).
 */
export async function linkAccount(
  localAccountId: string,
  provider: BankSyncProvider,
  remoteAccountId: string,
  bankName?: string,
  requisitionId?: string,
): Promise<void> {
  let bankId: string | null = null;

  // For GoCardless, create/find bank record
  if (provider === "goCardless" && requisitionId) {
    bankId = await findOrCreateBank(bankName ?? "Bank", requisitionId);
  }

  await batchMessages(async () => {
    const fields: Record<string, string | null> = {
      account_sync_source: provider,
      account_id: remoteAccountId,
    };

    if (bankId != null) {
      fields.bank = bankId;
    }

    await sendMessages(
      Object.entries(fields).map(([column, value]) => ({
        timestamp: Timestamp.send()!,
        dataset: "accounts",
        row: localAccountId,
        column,
        value,
      })),
    );
  });
}

/**
 * Unlink a local account from its bank sync provider.
 */
export async function unlinkAccount(localAccountId: string): Promise<void> {
  await sendMessages(
    ["account_sync_source", "bank", "account_id", "last_sync"].map((column) => ({
      timestamp: Timestamp.send()!,
      dataset: "accounts",
      row: localAccountId,
      column,
      value: null,
    })),
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find an existing bank record by requisitionId, or create a new one.
 * Returns the bank's `bank_id` field value (requisitionId).
 */
async function findOrCreateBank(
  institutionName: string,
  requisitionId: string,
): Promise<string> {
  const existing = await first<{ id: string; bank_id: string }>(
    `SELECT id, bank_id FROM banks WHERE bank_id = ? AND tombstone = 0`,
    [requisitionId],
  );

  if (existing) return existing.bank_id;

  const id = randomUUID();
  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: "banks", row: id, column: "bank_id", value: requisitionId },
    { timestamp: Timestamp.send()!, dataset: "banks", row: id, column: "name", value: institutionName },
  ]);

  return requisitionId;
}

/**
 * Calculate the start date for fetching transactions.
 * Uses last_sync if available, otherwise 90 days ago.
 * Returns "YYYY-MM-DD" string.
 */
function calculateStartDate(lastSync: string | null): string {
  if (lastSync) {
    // lastSync is an ISO timestamp — extract the date part
    const date = new Date(lastSync);
    if (!isNaN(date.getTime())) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }

  // Default: 90 days ago
  const now = new Date();
  now.setDate(now.getDate() - 90);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
