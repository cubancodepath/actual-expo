import { describe, it, expect } from "vitest";
import { normalizeBankTransactions, amountStringToInteger } from "./normalize";
import type { BankTransaction } from "./types";

// ---------------------------------------------------------------------------
// amountStringToInteger
// ---------------------------------------------------------------------------

describe("amountStringToInteger", () => {
  it("converts positive amount", () => {
    expect(amountStringToInteger("12.50")).toBe(1250);
  });

  it("converts negative amount", () => {
    expect(amountStringToInteger("-99.99")).toBe(-9999);
  });

  it("converts zero", () => {
    expect(amountStringToInteger("0.00")).toBe(0);
  });

  it("handles integer strings", () => {
    expect(amountStringToInteger("100")).toBe(10000);
  });

  it("rounds to nearest cent", () => {
    expect(amountStringToInteger("12.345")).toBe(1235);
    expect(amountStringToInteger("12.344")).toBe(1234);
  });
});

// ---------------------------------------------------------------------------
// normalizeBankTransactions
// ---------------------------------------------------------------------------

function makeBankTx(overrides: Partial<BankTransaction> = {}): BankTransaction {
  return {
    transactionId: "tx-001",
    date: "2026-03-15",
    payeeName: "Walmart Supercenter",
    notes: undefined,
    transactionAmount: { amount: "-42.50", currency: "USD" },
    booked: true,
    ...overrides,
  };
}

describe("normalizeBankTransactions", () => {
  it("converts amount string to integer cents", () => {
    const result = normalizeBankTransactions([makeBankTx()], "acct-1");
    expect(result[0].trans.amount).toBe(-4250);
  });

  it("converts date string to YYYYMMDD integer", () => {
    const result = normalizeBankTransactions([makeBankTx({ date: "2026-01-05" })], "acct-1");
    expect(result[0].trans.date).toBe(20260105);
  });

  it("uses transactionId as imported_id when present", () => {
    const result = normalizeBankTransactions(
      [makeBankTx({ transactionId: "bank-tx-123" })],
      "acct-1",
    );
    expect(result[0].trans.imported_id).toBe("bank-tx-123");
  });

  it("constructs imported_id from internalTransactionId for booked transactions", () => {
    const result = normalizeBankTransactions(
      [makeBankTx({ transactionId: undefined, internalTransactionId: "int-456", booked: true })],
      "acct-1",
    );
    expect(result[0].trans.imported_id).toBe("acct-1-int-456");
  });

  it("sets imported_id to null when no IDs available", () => {
    const result = normalizeBankTransactions(
      [makeBankTx({ transactionId: undefined, internalTransactionId: undefined })],
      "acct-1",
    );
    expect(result[0].trans.imported_id).toBeNull();
  });

  it("does not use internalTransactionId for pending (unbooked) transactions", () => {
    const result = normalizeBankTransactions(
      [makeBankTx({ transactionId: undefined, internalTransactionId: "int-789", booked: false })],
      "acct-1",
    );
    expect(result[0].trans.imported_id).toBeNull();
  });

  it("sets cleared from booked field", () => {
    const booked = normalizeBankTransactions([makeBankTx({ booked: true })], "acct-1");
    expect(booked[0].trans.cleared).toBe(true);

    const pending = normalizeBankTransactions([makeBankTx({ booked: false })], "acct-1");
    expect(pending[0].trans.cleared).toBe(false);
  });

  it("trims payeeName and stores as imported_description", () => {
    const result = normalizeBankTransactions(
      [makeBankTx({ payeeName: "  Costco Wholesale  " })],
      "acct-1",
    );
    expect(result[0].trans.imported_description).toBe("Costco Wholesale");
    expect(result[0].payee_name).toBe("Costco Wholesale");
  });

  it("escapes # in notes", () => {
    const result = normalizeBankTransactions(
      [makeBankTx({ notes: "Payment #123" })],
      "acct-1",
    );
    expect(result[0].trans.notes).toBe("Payment ##123");
  });

  it("trims notes", () => {
    const result = normalizeBankTransactions(
      [makeBankTx({ notes: "  some notes  " })],
      "acct-1",
    );
    expect(result[0].trans.notes).toBe("some notes");
  });

  it("sets notes to null when not provided", () => {
    const result = normalizeBankTransactions(
      [makeBankTx({ notes: undefined })],
      "acct-1",
    );
    expect(result[0].trans.notes).toBeNull();
  });

  it("stores raw synced data as JSON string", () => {
    const tx = makeBankTx({ transactionId: "raw-test" });
    const result = normalizeBankTransactions([tx], "acct-1");
    const parsed = JSON.parse(result[0].trans.raw_synced_data);
    expect(parsed.transactionId).toBe("raw-test");
    expect(parsed.payeeName).toBe("Walmart Supercenter");
  });

  it("initializes category as null", () => {
    const result = normalizeBankTransactions([makeBankTx()], "acct-1");
    expect(result[0].trans.category).toBeNull();
  });

  it("skips transactions with invalid dates", () => {
    const result = normalizeBankTransactions(
      [makeBankTx({ date: "invalid-date" })],
      "acct-1",
    );
    expect(result).toHaveLength(0);
  });

  it("normalizes multiple transactions", () => {
    const result = normalizeBankTransactions(
      [
        makeBankTx({ transactionId: "a", transactionAmount: { amount: "-10.00", currency: "USD" } }),
        makeBankTx({ transactionId: "b", transactionAmount: { amount: "25.00", currency: "USD" } }),
      ],
      "acct-1",
    );
    expect(result).toHaveLength(2);
    expect(result[0].trans.amount).toBe(-1000);
    expect(result[1].trans.amount).toBe(2500);
  });
});
