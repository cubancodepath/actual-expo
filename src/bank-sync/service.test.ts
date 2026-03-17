import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the post module and prefsStore to avoid native module resolution
const mockPost = vi.fn();
vi.mock("../post", () => ({
  post: (...args: unknown[]) => mockPost(...args),
}));

vi.mock("../stores/prefsStore", () => ({
  usePrefsStore: {
    getState: () => ({
      serverUrl: "http://localhost:5006",
      token: "test-token-123",
    }),
  },
}));

import {
  getGoCardlessStatus,
  getGoCardlessBanks,
  createGoCardlessWebToken,
  getGoCardlessAccounts,
  getGoCardlessTransactions,
  removeGoCardlessAccount,
  getSimpleFinStatus,
  getSimpleFinAccounts,
  getSimpleFinTransactions,
  isBankSyncError,
} from "./service";

beforeEach(() => {
  mockPost.mockReset();
});

function assertCall(path: string, body: Record<string, unknown>) {
  expect(mockPost).toHaveBeenCalledWith(
    `http://localhost:5006${path}`,
    body,
    { "x-actual-token": "test-token-123" },
  );
}

// ---------------------------------------------------------------------------
// GoCardless
// ---------------------------------------------------------------------------

describe("GoCardless service", () => {
  it("getGoCardlessStatus calls /gocardless/status", async () => {
    mockPost.mockResolvedValueOnce({ configured: true });
    const result = await getGoCardlessStatus();
    assertCall("/gocardless/status", {});
    expect(result).toEqual({ configured: true });
  });

  it("getGoCardlessBanks sends country and showDemo", async () => {
    const banks = [
      { id: "SANDBOXFINANCE_SFIN0000", name: "DEMO bank" },
      { id: "REVOLUT_REVOGB21", name: "Revolut" },
    ];
    mockPost.mockResolvedValueOnce(banks);
    const result = await getGoCardlessBanks("GB", true);
    assertCall("/gocardless/get-banks", { country: "GB", showDemo: true });
    expect(result).toEqual(banks);
  });

  it("createGoCardlessWebToken sends institutionId", async () => {
    const token = { link: "https://ob.gocardless.com/...", requisitionId: "req-123" };
    mockPost.mockResolvedValueOnce(token);
    const result = await createGoCardlessWebToken("SANDBOXFINANCE_SFIN0000");
    assertCall("/gocardless/create-web-token", {
      institutionId: "SANDBOXFINANCE_SFIN0000",
    });
    expect(result).toEqual(token);
  });

  it("getGoCardlessAccounts sends requisitionId", async () => {
    const requisition = {
      id: "req-123",
      status: "LN",
      accounts: [{ id: "acct-1", name: "Main Account" }],
    };
    mockPost.mockResolvedValueOnce(requisition);
    const result = await getGoCardlessAccounts("req-123");
    assertCall("/gocardless/get-accounts", { requisitionId: "req-123" });
    expect(result).toEqual(requisition);
  });

  it("getGoCardlessTransactions returns transactions", async () => {
    const response = {
      transactions: {
        all: [{ transactionId: "tx-1", date: "2026-03-01", payeeName: "Shop", booked: true }],
        booked: [{ transactionId: "tx-1", date: "2026-03-01", payeeName: "Shop", booked: true }],
        pending: [],
      },
      balances: [],
      startingBalance: 100000,
    };
    mockPost.mockResolvedValueOnce(response);
    const result = await getGoCardlessTransactions("req-123", "acct-1", "2026-03-01");
    assertCall("/gocardless/transactions", {
      requisitionId: "req-123",
      accountId: "acct-1",
      startDate: "2026-03-01",
      includeBalance: true,
    });
    expect(result).toEqual(response);
  });

  it("getGoCardlessTransactions returns error response", async () => {
    const errorResp = {
      error_type: "ITEM_ERROR",
      error_code: "ITEM_LOGIN_REQUIRED",
      reason: "Requisition expired",
      status: "expired",
    };
    mockPost.mockResolvedValueOnce(errorResp);
    const result = await getGoCardlessTransactions("req-expired", "acct-1", "2026-03-01");
    expect(isBankSyncError(result)).toBe(true);
  });

  it("removeGoCardlessAccount sends requisitionId", async () => {
    mockPost.mockResolvedValueOnce({ summary: "Requisition deleted" });
    const result = await removeGoCardlessAccount("req-123");
    assertCall("/gocardless/remove-account", { requisitionId: "req-123" });
    expect(result).toEqual({ summary: "Requisition deleted" });
  });
});

// ---------------------------------------------------------------------------
// SimpleFin
// ---------------------------------------------------------------------------

describe("SimpleFin service", () => {
  it("getSimpleFinStatus calls /simplefin/status", async () => {
    mockPost.mockResolvedValueOnce({ configured: false });
    const result = await getSimpleFinStatus();
    assertCall("/simplefin/status", {});
    expect(result).toEqual({ configured: false });
  });

  it("getSimpleFinAccounts returns accounts", async () => {
    const data = {
      accounts: [
        { id: "sf-1", name: "Checking", balance: 250000, org: { name: "My Bank" } },
        { id: "sf-2", name: "Savings", balance: 1000000, org: { name: "My Bank" } },
      ],
    };
    mockPost.mockResolvedValueOnce(data);
    const result = await getSimpleFinAccounts();
    assertCall("/simplefin/accounts", {});
    expect(result).toEqual(data);
  });

  it("getSimpleFinTransactions sends accountId and startDate", async () => {
    const response = {
      transactions: {
        all: [{ transactionId: "sf-tx-1", date: "2026-03-10", payeeName: "Grocery", booked: true }],
        booked: [
          { transactionId: "sf-tx-1", date: "2026-03-10", payeeName: "Grocery", booked: true },
        ],
        pending: [],
      },
      balances: [],
      startingBalance: 250000,
    };
    mockPost.mockResolvedValueOnce(response);
    const result = await getSimpleFinTransactions("sf-1", "2026-03-01");
    assertCall("/simplefin/transactions", { accountId: "sf-1", startDate: "2026-03-01" });
    expect(result).toEqual(response);
  });
});

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

describe("isBankSyncError", () => {
  it("returns true for error responses", () => {
    expect(isBankSyncError({ error_type: "ITEM_ERROR", error_code: "EXPIRED" })).toBe(true);
  });

  it("returns false for successful responses", () => {
    expect(
      isBankSyncError({
        transactions: { all: [], booked: [], pending: [] },
        balances: [],
        startingBalance: 0,
      }),
    ).toBe(false);
  });
});
