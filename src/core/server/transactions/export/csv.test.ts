import { describe, it, expect } from "vitest";
import {
  csvStringify,
  exportTransactionsToCSV,
  exportSplitAwareToCSV,
  type ExportLookups,
  type ExportTxn,
} from "./csv";

const lookups: ExportLookups = {
  accounts: new Map([["a1", "Checking"]]),
  payees: new Map([["p1", "Coffee Shop"]]),
  categories: new Map([["c1", { name: "Dining", groupName: "Food" }]]),
};

describe("csvStringify", () => {
  it("emits a header row from object keys", () => {
    expect(csvStringify([{ A: 1, B: "x" }])).toBe("A,B\n1,x");
  });

  it("quotes fields with commas, quotes, or newlines and doubles quotes", () => {
    expect(csvStringify([{ V: "a,b" }])).toBe('V\n"a,b"');
    expect(csvStringify([{ V: 'he said "hi"' }])).toBe('V\n"he said ""hi"""');
  });

  it("neutralizes CSV-injection with a leading quote", () => {
    expect(csvStringify([{ V: "=SUM(A1:A2)" }])).toBe("V\n'=SUM(A1:A2)");
    expect(csvStringify([{ V: "+1" }])).toBe("V\n'+1");
    expect(csvStringify([{ V: "@x" }])).toBe("V\n'@x");
  });

  it("returns empty string for no rows", () => {
    expect(csvStringify([])).toBe("");
  });
});

describe("exportTransactionsToCSV — flat", () => {
  it("maps columns, resolves names, and signs the amount", () => {
    const txns: ExportTxn[] = [
      {
        id: "t1",
        acct: "a1",
        date: "2026-01-15",
        description: "p1",
        category: "c1",
        notes: "lunch",
        amount: -1550,
        cleared: 1,
        reconciled: 0,
      },
    ];
    const csv = exportTransactionsToCSV(txns, lookups);
    expect(csv).toBe(
      "Account,Date,Payee,Notes,Category,Amount,Cleared,Reconciled\n" +
        "Checking,2026-01-15,Coffee Shop,lunch,Food: Dining,-15.5,true,false",
    );
  });
});

describe("exportSplitAwareToCSV", () => {
  it("adds split markers to notes and routes amount to Split_Amount for parents", () => {
    const txns: ExportTxn[] = [
      {
        id: "p",
        acct: "a1",
        date: "2026-01-15",
        description: "p1",
        category: null,
        notes: "groceries",
        amount: -1000,
        cleared: 1,
        reconciled: 0,
        isParent: 1,
      },
      {
        id: "c1",
        acct: "a1",
        date: "2026-01-15",
        description: "p1",
        category: "c1",
        notes: "veg",
        amount: -600,
        cleared: 1,
        reconciled: 1,
        isChild: 1,
        parent_id: "p",
      },
      {
        id: "c2",
        acct: "a1",
        date: "2026-01-15",
        description: "p1",
        category: "c1",
        notes: "fruit",
        amount: -400,
        cleared: 1,
        reconciled: 0,
        isChild: 1,
        parent_id: "p",
      },
    ];
    const csv = exportSplitAwareToCSV(txns, lookups);
    const lines = csv.split("\n");
    expect(lines[0]).toBe(
      "Account,Date,Payee,Notes,Category_Group,Category,Amount,Split_Amount,Cleared",
    );
    // Parent: Amount 0, Split_Amount = full, note marker "(SPLIT INTO 2)".
    expect(lines[1]).toBe(
      "Checking,2026-01-15,Coffee Shop,(SPLIT INTO 2) groceries,,,0,-10,Cleared",
    );
    // Child 1: reconciled → "Reconciled"; marker "(SPLIT 1 OF 2)".
    expect(lines[2]).toBe(
      "Checking,2026-01-15,Coffee Shop,(SPLIT 1 OF 2) veg,Food,Dining,-6,0,Reconciled",
    );
    expect(lines[3]).toBe(
      "Checking,2026-01-15,Coffee Shop,(SPLIT 2 OF 2) fruit,Food,Dining,-4,0,Cleared",
    );
  });
});
