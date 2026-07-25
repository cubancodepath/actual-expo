/**
 * Repair corrupted split transactions. Faithful port of loot-core
 * server/tools/app.ts::fixSplitTransactions. Each repair is a separate query +
 * CRDT batch. Repair #4 (mismatched split totals) is detection-only, matching
 * upstream — it is reported, never auto-corrected.
 */
import { runQuery } from "@/core/server/db";
import { sendMessages } from "@/core/server/sync";
import { Timestamp } from "@/core/crdt";

export type FixSplitsResult = {
  numBlankPayees: number;
  numCleared: number;
  numDeleted: number;
  numTransfersFixed: number;
  numNonParentErrorsFixed: number;
  numParentTransactionsWithCategoryFixed: number;
  mismatchedSplits: Array<{ id: string; parentAmount: number; childTotal: number }>;
};

function setCol(id: string, column: string, value: string | number | null) {
  return { timestamp: Timestamp.send()!, dataset: "transactions" as const, row: id, column, value };
}

export async function fixSplitTransactions(): Promise<FixSplitsResult> {
  // 1. Blank child payees → copy the parent's payee down.
  const blankPayees = await runQuery<{ id: string; parentPayee: string }>(
    `SELECT t.id AS id, p.description AS parentPayee
     FROM transactions t
     JOIN transactions p ON t.parent_id = p.id
     WHERE t.isChild = 1 AND t.tombstone = 0
       AND t.description IS NULL AND p.description IS NOT NULL`,
  );
  if (blankPayees.length > 0) {
    await sendMessages(blankPayees.map((r) => setCol(r.id, "description", r.parentPayee)));
  }

  // 2. Child cleared flag out of sync with its parent → match the parent.
  const clearedMismatch = await runQuery<{ id: string; cleared: number }>(
    `SELECT t.id AS id, p.cleared AS cleared
     FROM transactions t
     JOIN transactions p ON t.parent_id = p.id
     WHERE t.isChild = 1 AND t.tombstone = 0 AND t.cleared != p.cleared`,
  );
  if (clearedMismatch.length > 0) {
    await sendMessages(clearedMismatch.map((r) => setCol(r.id, "cleared", r.cleared)));
  }

  // 3. Orphan children (parent tombstoned or gone) → tombstone.
  const orphans = await runQuery<{ id: string }>(
    `SELECT t.id AS id
     FROM transactions t
     LEFT JOIN transactions p ON t.parent_id = p.id
     WHERE t.isChild = 1 AND t.tombstone = 0
       AND (p.tombstone = 1 OR p.id IS NULL)`,
  );
  if (orphans.length > 0) {
    await sendMessages(orphans.map((r) => setCol(r.id, "tombstone", 1)));
  }

  // 4. Mismatched split totals — DETECTION ONLY (report, do not fix).
  const parentSums = await runQuery<{ id: string; parentAmount: number; childTotal: number }>(
    `SELECT p.id AS id, p.amount AS parentAmount,
            COALESCE(SUM(c.amount), 0) AS childTotal
     FROM transactions p
     JOIN transactions c ON c.parent_id = p.id AND c.tombstone = 0
     WHERE p.isParent = 1 AND p.tombstone = 0
     GROUP BY p.id, p.amount`,
  );
  const mismatchedSplits = parentSums.filter((r) => r.parentAmount !== r.childTotal);

  // 5. Transfers whose two sides share offbudget status must have no category.
  const badTransferCats = await runQuery<{ id: string }>(
    `SELECT t1.id AS id
     FROM transactions t1
     JOIN accounts a1 ON t1.acct = a1.id
     JOIN transactions t2 ON t1.transferred_id = t2.id
     JOIN accounts a2 ON t2.acct = a2.id
     WHERE t1.tombstone = 0 AND a1.offbudget = a2.offbudget AND t1.category IS NOT NULL`,
  );
  if (badTransferCats.length > 0) {
    await sendMessages(badTransferCats.map((r) => setCol(r.id, "category", null)));
  }

  // 6. Stale errors on non-parent rows → clear.
  const staleErrors = await runQuery<{ id: string }>(
    "SELECT id FROM transactions WHERE error IS NOT NULL AND isParent = 0 AND tombstone = 0",
  );
  if (staleErrors.length > 0) {
    await sendMessages(staleErrors.map((r) => setCol(r.id, "error", null)));
  }

  // 7. Parent transactions must not carry a category.
  const parentCats = await runQuery<{ id: string }>(
    "SELECT id FROM transactions WHERE isParent = 1 AND category IS NOT NULL AND tombstone = 0",
  );
  if (parentCats.length > 0) {
    await sendMessages(parentCats.map((r) => setCol(r.id, "category", null)));
  }

  return {
    numBlankPayees: blankPayees.length,
    numCleared: clearedMismatch.length,
    numDeleted: orphans.length,
    numTransfersFixed: badTransferCats.length,
    numNonParentErrorsFixed: staleErrors.length,
    numParentTransactionsWithCategoryFixed: parentCats.length,
    mismatchedSplits,
  };
}
