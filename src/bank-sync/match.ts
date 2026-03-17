// ---------------------------------------------------------------------------
// Bank Sync — Transaction matching (3-pass fuzzy algorithm)
//
// Ported from loot-core's matchTransactions().
// Runs entirely on local SQLite.
// ---------------------------------------------------------------------------

import { runQuery, first } from "../db";
import { intToStr, strToInt } from "../lib/date";

/** Shape of an existing transaction from the matching query */
export type MatchCandidate = {
  id: string;
  date: number;
  financial_id: string | null;
  description: string | null; // payee id
  imported_description: string | null;
  category: string | null;
  notes: string | null;
  reconciled: 0 | 1;
  cleared: 0 | 1;
  amount: number;
};

/** A normalized transaction paired with its match result */
export type MatchResult = {
  trans: {
    amount: number;
    date: number;
    imported_id: string | null;
    imported_description: string | null;
    cleared: boolean;
    notes: string | null;
    category: string | null;
    description: string | null; // resolved payee id
    raw_synced_data: string;
  };
  payee_name: string;
  match: MatchCandidate | null;
};

const MATCH_COLUMNS = `id, date, financial_id, description, imported_description, category, notes, reconciled, cleared, amount`;

/**
 * Compute a YYYYMMDD integer for a date offset by `days` from `dateInt`.
 */
function offsetDate(dateInt: number, days: number): number {
  const str = intToStr(dateInt); // "YYYY-MM-DD"
  const d = new Date(str);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return parseInt(`${y}${m}${day}`, 10);
}

/**
 * 3-pass transaction matching algorithm.
 *
 * For each incoming transaction:
 *   Pass 1A: Exact match by financial_id (imported_id)
 *   Pass 1B: Query fuzzy candidates (±7 days, same amount)
 *   Pass 2:  Match by payee within candidates
 *   Pass 3:  First unmatched candidate (lowest fidelity)
 */
export async function matchTransactions(
  acctId: string,
  transactions: Array<{
    trans: MatchResult["trans"];
    payee_name: string;
  }>,
): Promise<MatchResult[]> {
  const hasMatched = new Set<string>();

  // ---------------------------------------------------------------------------
  // Pass 1: Exact ID match + gather fuzzy candidates
  // ---------------------------------------------------------------------------
  type Step1 = MatchResult & { fuzzyDataset: MatchCandidate[] | null };
  const step1: Step1[] = [];

  for (const { trans, payee_name } of transactions) {
    let match: MatchCandidate | null = null;
    let fuzzyDataset: MatchCandidate[] | null = null;

    // Pass 1A: Exact match by imported_id
    if (trans.imported_id) {
      match =
        (await first<MatchCandidate>(
          `SELECT ${MATCH_COLUMNS} FROM transactions WHERE financial_id = ? AND acct = ? AND tombstone = 0`,
          [trans.imported_id, acctId],
        )) ?? null;

      if (match) {
        hasMatched.add(match.id);
      }
    }

    // Pass 1B: Query fuzzy candidates if no exact match
    if (!match) {
      const dateMin = offsetDate(trans.date, -7);
      const dateMax = offsetDate(trans.date, 7);

      fuzzyDataset = await runQuery<MatchCandidate>(
        `SELECT ${MATCH_COLUMNS} FROM transactions
         WHERE (financial_id IS NULL OR ? IS NULL)
           AND date >= ? AND date <= ?
           AND amount = ?
           AND acct = ?
           AND tombstone = 0`,
        [trans.imported_id ?? null, dateMin, dateMax, trans.amount, acctId],
      );

      // Sort by date proximity (closest first)
      fuzzyDataset.sort((a, b) => {
        return Math.abs(a.date - trans.date) - Math.abs(b.date - trans.date);
      });
    }

    step1.push({ trans, payee_name, match, fuzzyDataset });
  }

  // ---------------------------------------------------------------------------
  // Pass 2: Fuzzy match by payee
  // ---------------------------------------------------------------------------
  const step2 = step1.map((data) => {
    if (!data.match && data.fuzzyDataset) {
      const found = data.fuzzyDataset.find(
        (row) => !hasMatched.has(row.id) && data.trans.description === row.description,
      );
      if (found) {
        hasMatched.add(found.id);
        return { ...data, match: found };
      }
    }
    return data;
  });

  // ---------------------------------------------------------------------------
  // Pass 3: Fuzzy fallback — first unmatched candidate
  // ---------------------------------------------------------------------------
  const step3 = step2.map((data) => {
    if (!data.match && data.fuzzyDataset) {
      const found = data.fuzzyDataset.find((row) => !hasMatched.has(row.id));
      if (found) {
        hasMatched.add(found.id);
        return { ...data, match: found };
      }
    }
    return data;
  });

  // Strip fuzzyDataset from results
  return step3.map(({ trans, payee_name, match }) => ({
    trans,
    payee_name,
    match,
  }));
}
