// ---------------------------------------------------------------------------
// Bank Sync — Types
// ---------------------------------------------------------------------------

/** Supported bank sync providers */
export type BankSyncProvider = "goCardless" | "simpleFin";

/** Server-side provider configuration status */
export type BankSyncStatus = {
  configured: boolean;
};

// ---------------------------------------------------------------------------
// GoCardless types
// ---------------------------------------------------------------------------

export type GoCardlessBank = {
  id: string;
  name: string;
  bic?: string;
  logo?: string;
  countries?: string[];
};

export type GoCardlessWebToken = {
  link: string;
  requisitionId: string;
};

export type GoCardlessRequisitionStatus =
  | "CR" // Created
  | "GC" // Giving consent
  | "UA" // Undergoing authentication
  | "RJ" // Rejected
  | "SA" // Selecting accounts
  | "QA" // Queued for authentication (not yet used)
  | "GA" // Granting access
  | "LN" // Linked (success)
  | "SU" // Suspended
  | "EX"; // Expired

export type GoCardlessAccount = {
  id: string;
  name?: string;
  iban?: string;
  institution_id?: string;
  status?: string;
};

export type GoCardlessRequisition = {
  id: string;
  status: GoCardlessRequisitionStatus;
  accounts: GoCardlessAccount[];
};

// ---------------------------------------------------------------------------
// SimpleFin types
// ---------------------------------------------------------------------------

export type SimpleFinOrg = {
  id?: string;
  name: string;
  domain?: string;
};

export type SimpleFinAccount = {
  id: string;
  name: string;
  balance: number;
  org: SimpleFinOrg;
};

// ---------------------------------------------------------------------------
// Shared bank transaction types (normalized from any provider)
// ---------------------------------------------------------------------------

export type BankTransactionAmount = {
  amount: string; // e.g. "-12.50"
  currency: string; // e.g. "EUR"
};

export type BankTransaction = {
  transactionId?: string;
  internalTransactionId?: string;
  date: string; // YYYY-MM-DD
  bookingDate?: string;
  valueDate?: string;
  payeeName: string;
  notes?: string;
  transactionAmount: BankTransactionAmount;
  booked: boolean;
};

export type BankSyncTransactions = {
  all: BankTransaction[];
  booked: BankTransaction[];
  pending: BankTransaction[];
};

export type BankSyncBalance = {
  balanceAmount: BankTransactionAmount;
  balanceType: string;
};

export type BankSyncResponse = {
  transactions: BankSyncTransactions;
  balances: BankSyncBalance[];
  startingBalance: number;
};

export type BankSyncErrorResponse = {
  error_type: string;
  error_code: string;
  reason?: string;
  status?: string;
};

/** Result of reconciling bank transactions with local data */
export type BankSyncResult = {
  added: string[];
  updated: string[];
};
