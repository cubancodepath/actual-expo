import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — set up before imports
// ---------------------------------------------------------------------------

// Mock DB
const mockFirst = vi.fn();
const mockRunQuery = vi.fn();
vi.mock("../db", () => ({
  first: (...args: unknown[]) => mockFirst(...args),
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

// Mock sync (sendMessages + batchMessages)
const sentMessages: Array<{ dataset: string; row: string; column: string; value: unknown }> = [];
vi.mock("../sync", () => ({
  sendMessages: (msgs: Array<{ dataset: string; row: string; column: string; value: unknown }>) => {
    sentMessages.push(...msgs);
    return Promise.resolve();
  },
  batchMessages: async (fn: () => Promise<void>) => {
    await fn();
  },
}));

// Mock CRDT timestamps
let timestampCounter = 0;
vi.mock("../crdt", () => ({
  Timestamp: {
    send: () => `ts-${++timestampCounter}`,
  },
}));

// Mock expo-crypto
vi.mock("expo-crypto", () => ({
  randomUUID: () => `uuid-${++timestampCounter}`,
}));

// Mock rules store (no rules by default)
vi.mock("../stores/rulesStore", () => ({
  useRulesStore: {
    getState: () => ({ rules: [] }),
  },
}));

import { reconcileTransactions } from "./reconcile";
import type { BankTransaction } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBankTx(overrides: Partial<BankTransaction> = {}): BankTransaction {
  return {
    transactionId: "bank-tx-1",
    date: "2026-03-15",
    payeeName: "Walmart",
    transactionAmount: { amount: "-42.50", currency: "USD" },
    booked: true,
    ...overrides,
  };
}

function makeExistingTx(overrides: Record<string, unknown> = {}) {
  return {
    id: "existing-tx-1",
    date: 20260315,
    financial_id: null as string | null,
    description: null as string | null,
    imported_description: null as string | null,
    category: null as string | null,
    notes: null as string | null,
    reconciled: 0 as 0 | 1,
    cleared: 0 as 0 | 1,
    amount: -4250,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sentMessages.length = 0;
  timestampCounter = 0;

  // Default: no existing payee found → create new
  mockFirst.mockImplementation((sql: string) => {
    if (sql.includes("payees")) return Promise.resolve(null);
    if (sql.includes("transactions")) return Promise.resolve(null);
    return Promise.resolve(null);
  });

  // Default: no fuzzy candidates
  mockRunQuery.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("reconcileTransactions", () => {
  it("creates a new transaction when no match exists", async () => {
    const result = await reconcileTransactions("acct-1", [makeBankTx()]);

    expect(result.added).toHaveLength(1);
    expect(result.updated).toHaveLength(0);

    // Should have created a payee + a transaction
    const txMessages = sentMessages.filter((m) => m.dataset === "transactions");
    expect(txMessages.length).toBeGreaterThan(0);

    const amountMsg = txMessages.find((m) => m.column === "amount");
    expect(amountMsg?.value).toBe(-4250);

    const dateMsg = txMessages.find((m) => m.column === "date");
    expect(dateMsg?.value).toBe(20260315);

    const clearedMsg = txMessages.find((m) => m.column === "cleared");
    expect(clearedMsg?.value).toBe(1);

    const importedIdMsg = txMessages.find((m) => m.column === "financial_id");
    expect(importedIdMsg?.value).toBe("bank-tx-1");
  });

  it("updates an existing transaction matched by financial_id", async () => {
    const existing = makeExistingTx({ financial_id: "bank-tx-1" });

    // Exact match by financial_id
    mockFirst.mockImplementation((sql: string) => {
      if (sql.includes("payees")) return Promise.resolve(null);
      if (sql.includes("financial_id = ?")) return Promise.resolve(existing);
      return Promise.resolve(null);
    });

    const result = await reconcileTransactions("acct-1", [
      makeBankTx({ transactionId: "bank-tx-1" }),
    ]);

    expect(result.added).toHaveLength(0);
    expect(result.updated).toHaveLength(1);
    expect(result.updated[0]).toBe("existing-tx-1");
  });

  it("updates via fuzzy match by amount + date", async () => {
    const existing = makeExistingTx({ date: 20260315, amount: -4250 });

    // No exact match, but fuzzy candidates found
    mockFirst.mockImplementation((sql: string) => {
      if (sql.includes("payees")) return Promise.resolve(null);
      return Promise.resolve(null);
    });
    mockRunQuery.mockResolvedValue([existing]);

    const result = await reconcileTransactions("acct-1", [
      makeBankTx({ transactionId: undefined, internalTransactionId: undefined }),
    ]);

    expect(result.added).toHaveLength(0);
    expect(result.updated).toHaveLength(1);
    expect(result.updated[0]).toBe("existing-tx-1");
  });

  it("skips reconciled (locked) transactions", async () => {
    const existing = makeExistingTx({ financial_id: "bank-tx-1", reconciled: 1 });

    mockFirst.mockImplementation((sql: string) => {
      if (sql.includes("payees")) return Promise.resolve(null);
      if (sql.includes("financial_id = ?")) return Promise.resolve(existing);
      return Promise.resolve(null);
    });

    const result = await reconcileTransactions("acct-1", [makeBankTx()]);

    expect(result.added).toHaveLength(0);
    expect(result.updated).toHaveLength(0);
  });

  it("preserves existing payee when already set", async () => {
    const existing = makeExistingTx({
      financial_id: "bank-tx-1",
      description: "existing-payee-id",
    });

    mockFirst.mockImplementation((sql: string) => {
      if (sql.includes("payees")) return Promise.resolve(null);
      if (sql.includes("financial_id = ?")) return Promise.resolve(existing);
      return Promise.resolve(null);
    });

    await reconcileTransactions("acct-1", [makeBankTx()]);

    // Should NOT have a description update message (existing payee preserved)
    const descriptionUpdates = sentMessages.filter(
      (m) => m.dataset === "transactions" && m.column === "description",
    );
    expect(descriptionUpdates).toHaveLength(0);
  });

  it("preserves existing category when already set", async () => {
    const existing = makeExistingTx({
      financial_id: "bank-tx-1",
      category: "existing-cat-id",
    });

    mockFirst.mockImplementation((sql: string) => {
      if (sql.includes("payees")) return Promise.resolve(null);
      if (sql.includes("financial_id = ?")) return Promise.resolve(existing);
      return Promise.resolve(null);
    });

    await reconcileTransactions("acct-1", [makeBankTx()]);

    const categoryUpdates = sentMessages.filter(
      (m) => m.dataset === "transactions" && m.column === "category",
    );
    expect(categoryUpdates).toHaveLength(0);
  });

  it("preserves existing notes when already set", async () => {
    const existing = makeExistingTx({
      financial_id: "bank-tx-1",
      notes: "My personal notes",
    });

    mockFirst.mockImplementation((sql: string) => {
      if (sql.includes("payees")) return Promise.resolve(null);
      if (sql.includes("financial_id = ?")) return Promise.resolve(existing);
      return Promise.resolve(null);
    });

    await reconcileTransactions("acct-1", [makeBankTx({ notes: "Bank notes" })]);

    const notesUpdates = sentMessages.filter(
      (m) => m.dataset === "transactions" && m.column === "notes",
    );
    expect(notesUpdates).toHaveLength(0);
  });

  it("sets cleared to true once booked (OR logic)", async () => {
    const existing = makeExistingTx({
      financial_id: "bank-tx-1",
      cleared: 0,
    });

    mockFirst.mockImplementation((sql: string) => {
      if (sql.includes("payees")) return Promise.resolve(null);
      if (sql.includes("financial_id = ?")) return Promise.resolve(existing);
      return Promise.resolve(null);
    });

    await reconcileTransactions("acct-1", [makeBankTx({ booked: true })]);

    const clearedUpdates = sentMessages.filter(
      (m) => m.dataset === "transactions" && m.column === "cleared",
    );
    expect(clearedUpdates).toHaveLength(1);
    expect(clearedUpdates[0].value).toBe(1);
  });

  it("always updates raw_synced_data", async () => {
    const existing = makeExistingTx({ financial_id: "bank-tx-1" });

    mockFirst.mockImplementation((sql: string) => {
      if (sql.includes("payees")) return Promise.resolve(null);
      if (sql.includes("financial_id = ?")) return Promise.resolve(existing);
      return Promise.resolve(null);
    });

    await reconcileTransactions("acct-1", [makeBankTx()]);

    const rawDataUpdates = sentMessages.filter(
      (m) => m.dataset === "transactions" && m.column === "raw_synced_data",
    );
    expect(rawDataUpdates).toHaveLength(1);
    const parsed = JSON.parse(rawDataUpdates[0].value as string);
    expect(parsed.transactionId).toBe("bank-tx-1");
  });

  it("handles multiple transactions in one batch", async () => {
    const result = await reconcileTransactions("acct-1", [
      makeBankTx({ transactionId: "tx-a", transactionAmount: { amount: "-10.00", currency: "USD" } }),
      makeBankTx({ transactionId: "tx-b", transactionAmount: { amount: "-20.00", currency: "USD" } }),
    ]);

    expect(result.added).toHaveLength(2);
  });

  it("reuses existing payee by name", async () => {
    mockFirst.mockImplementation((sql: string) => {
      if (sql.includes("payees")) return Promise.resolve({ id: "payee-walmart" });
      return Promise.resolve(null);
    });
    mockRunQuery.mockResolvedValue([]);

    await reconcileTransactions("acct-1", [makeBankTx()]);

    // Should NOT have created a new payee
    const payeeMessages = sentMessages.filter((m) => m.dataset === "payees");
    expect(payeeMessages).toHaveLength(0);

    // Transaction should reference existing payee
    const descMsg = sentMessages.find(
      (m) => m.dataset === "transactions" && m.column === "description",
    );
    expect(descMsg?.value).toBe("payee-walmart");
  });

  it("sets imported_description on new transactions", async () => {
    await reconcileTransactions("acct-1", [makeBankTx({ payeeName: "WALMART #1234" })]);

    const importedDescMsg = sentMessages.find(
      (m) => m.dataset === "transactions" && m.column === "imported_description",
    );
    expect(importedDescMsg?.value).toBe("WALMART #1234");
  });
});
