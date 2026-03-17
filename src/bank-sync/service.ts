// ---------------------------------------------------------------------------
// Bank Sync — API service layer
//
// Calls the Actual Budget server's bank sync proxy endpoints.
// The server talks to GoCardless / SimpleFin on our behalf.
// ---------------------------------------------------------------------------

import { post } from "../post";
import { usePrefsStore } from "../stores/prefsStore";
import type {
  BankSyncStatus,
  GoCardlessBank,
  GoCardlessWebToken,
  GoCardlessRequisition,
  SimpleFinAccount,
  BankSyncResponse,
  BankSyncErrorResponse,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getServerConfig(): { serverUrl: string; token: string } {
  const { serverUrl, token } = usePrefsStore.getState();
  if (!serverUrl || !token) {
    throw new Error("Server not configured");
  }
  return { serverUrl, token };
}

function bankPost<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const { serverUrl, token } = getServerConfig();
  return post(`${serverUrl}${path}`, body, { "x-actual-token": token }) as Promise<T>;
}

// ---------------------------------------------------------------------------
// GoCardless
// ---------------------------------------------------------------------------

/** Check if GoCardless is configured on the server */
export function getGoCardlessStatus(): Promise<BankSyncStatus> {
  return bankPost<BankSyncStatus>("/gocardless/status");
}

/** List available banks for a country */
export function getGoCardlessBanks(
  country: string,
  showDemo = false,
): Promise<GoCardlessBank[]> {
  return bankPost<GoCardlessBank[]>("/gocardless/get-banks", { country, showDemo });
}

/** Create a web token to start the GoCardless authorization flow */
export function createGoCardlessWebToken(
  institutionId: string,
  accessValidForDays?: number,
): Promise<GoCardlessWebToken> {
  return bankPost<GoCardlessWebToken>("/gocardless/create-web-token", {
    institutionId,
    accessValidForDays,
  });
}

/** Get accounts linked to a GoCardless requisition */
export function getGoCardlessAccounts(
  requisitionId: string,
): Promise<GoCardlessRequisition> {
  return bankPost<GoCardlessRequisition>("/gocardless/get-accounts", { requisitionId });
}

/**
 * Fetch transactions from a GoCardless-linked account.
 *
 * Returns either a BankSyncResponse (success) or a BankSyncErrorResponse (error).
 * Callers should check for `error_type` in the response.
 */
export function getGoCardlessTransactions(
  requisitionId: string,
  accountId: string,
  startDate: string,
  endDate?: string,
): Promise<BankSyncResponse | BankSyncErrorResponse> {
  return bankPost<BankSyncResponse | BankSyncErrorResponse>("/gocardless/transactions", {
    requisitionId,
    accountId,
    startDate,
    endDate,
    includeBalance: true,
  });
}

/** Remove a GoCardless requisition (unlink) */
export function removeGoCardlessAccount(
  requisitionId: string,
): Promise<{ summary: string }> {
  return bankPost<{ summary: string }>("/gocardless/remove-account", { requisitionId });
}

// ---------------------------------------------------------------------------
// SimpleFin
// ---------------------------------------------------------------------------

/** Check if SimpleFin is configured on the server */
export function getSimpleFinStatus(): Promise<BankSyncStatus> {
  return bankPost<BankSyncStatus>("/simplefin/status");
}

/** List all SimpleFin-connected accounts */
export function getSimpleFinAccounts(): Promise<{ accounts: SimpleFinAccount[] }> {
  return bankPost<{ accounts: SimpleFinAccount[] }>("/simplefin/accounts");
}

/**
 * Fetch transactions from a SimpleFin-linked account.
 *
 * Returns either a BankSyncResponse (success) or a BankSyncErrorResponse (error).
 * Callers should check for `error_type` in the response.
 */
export function getSimpleFinTransactions(
  accountId: string,
  startDate: string,
): Promise<BankSyncResponse | BankSyncErrorResponse> {
  return bankPost<BankSyncResponse | BankSyncErrorResponse>("/simplefin/transactions", {
    accountId,
    startDate,
  });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Type guard: check if a bank sync response is an error */
export function isBankSyncError(
  response: BankSyncResponse | BankSyncErrorResponse,
): response is BankSyncErrorResponse {
  return "error_type" in response && response.error_type != null;
}
