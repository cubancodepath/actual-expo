/**
 * Export transactions to CSV. Faithful port of loot-core
 * server/transactions/export/export-to-csv.ts, minus the `csv-stringify`
 * dependency (not available under Hermes) — a tiny RFC-4180 serializer with the
 * same CSV-formula-injection guard is used instead.
 *
 * Two column layouts, matching upstream:
 *   - exportTransactionsToCSV: flat list (Account, Date, Payee, Notes, Category,
 *     Amount, Cleared, Reconciled).
 *   - exportSplitAwareToCSV: split markers in Notes + Split_Amount column.
 */

/** Leading chars a spreadsheet may interpret as a formula. */
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

function escapeField(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "string" ? value : String(value);
  // CSV-injection guard: neutralize a leading formula trigger with a quote.
  if (typeof value === "string" && FORMULA_TRIGGERS.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** Serialize an array of uniform objects to a CSV string (header from keys). */
export function csvStringify(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(escapeField).join(",")];
  for (const r of rows) lines.push(headers.map((h) => escapeField(r[h])).join(","));
  return lines.join("\n");
}

/** Integer minor units → signed decimal amount (does NOT strip sign). */
function integerToAmount(int: number | null | undefined): number {
  return int == null ? 0 : int / 100;
}

export type ExportTxn = {
  id: string;
  acct: string | null;
  date: number | string | null;
  description: string | null; // payee id
  category: string | null;
  notes: string | null;
  amount: number | null;
  cleared: number | boolean | null;
  reconciled: number | boolean | null;
  isParent?: number | boolean | null;
  isChild?: number | boolean | null;
  parent_id?: string | null;
  sort_order?: number | null;
};

export type ExportLookups = {
  accounts: Map<string, string>; // id → name
  payees: Map<string, string>; // id → name
  /** category id → { name, groupName } */
  categories: Map<string, { name: string; groupName: string }>;
};

const asBool = (v: number | boolean | null | undefined): boolean => v === 1 || v === true;

function accountName(t: ExportTxn, l: ExportLookups): string {
  return (t.acct && l.accounts.get(t.acct)) || "";
}
function payeeName(t: ExportTxn, l: ExportLookups): string {
  return (t.description && l.payees.get(t.description)) || "";
}
function categoryLabel(t: ExportTxn, l: ExportLookups): string {
  if (!t.category) return "";
  const c = l.categories.get(t.category);
  return c ? `${c.groupName}: ${c.name}` : "";
}

/** Flat export — mirrors upstream exportToCSV. */
export function exportTransactionsToCSV(transactions: ExportTxn[], l: ExportLookups): string {
  return csvStringify(
    transactions.map((t) => ({
      Account: accountName(t, l),
      Date: t.date ?? "",
      Payee: payeeName(t, l),
      Notes: t.notes ?? "",
      Category: categoryLabel(t, l),
      Amount: integerToAmount(t.amount),
      Cleared: asBool(t.cleared),
      Reconciled: asBool(t.reconciled),
    })),
  );
}

/**
 * Split-aware export — mirrors upstream exportQueryToCSV. `transactions` must be
 * ungrouped (each parent immediately followed by its children, or at least all
 * children present) so split counts can be computed.
 */
export function exportSplitAwareToCSV(transactions: ExportTxn[], l: ExportLookups): string {
  const childCountByParent = new Map<string, number>();
  for (const t of transactions) {
    if (asBool(t.isChild) && t.parent_id) {
      childCountByParent.set(t.parent_id, (childCountByParent.get(t.parent_id) ?? 0) + 1);
    }
  }
  const childOrder = new Map<string, number>();
  const seenPerParent = new Map<string, number>();

  return csvStringify(
    transactions.map((t) => {
      const isParent = asBool(t.isParent);
      const isChild = asBool(t.isChild);
      let notes = t.notes ?? "";
      if (isParent) {
        notes = `(SPLIT INTO ${childCountByParent.get(t.id) ?? 0}) ${notes}`;
      } else if (isChild && t.parent_id) {
        const k = (seenPerParent.get(t.parent_id) ?? 0) + 1;
        seenPerParent.set(t.parent_id, k);
        childOrder.set(t.id, k);
        notes = `(SPLIT ${k} OF ${childCountByParent.get(t.parent_id) ?? 0}) ${notes}`;
      }
      return {
        Account: accountName(t, l),
        Date: t.date ?? "",
        Payee: payeeName(t, l),
        Notes: notes,
        Category_Group: t.category ? (l.categories.get(t.category)?.groupName ?? "") : "",
        Category: t.category ? (l.categories.get(t.category)?.name ?? "") : "",
        Amount: isParent ? 0 : integerToAmount(t.amount),
        Split_Amount: isParent ? integerToAmount(t.amount) : 0,
        Cleared: asBool(t.reconciled)
          ? "Reconciled"
          : asBool(t.cleared)
            ? "Cleared"
            : "Not cleared",
      };
    }),
  );
}
