/**
 * Merge two duplicate transactions into one. Faithful port of loot-core
 * server/transactions/merge.ts (+ shared/merge.ts validation).
 *
 * The two must be in the same account with the same amount. One is kept, the
 * other tombstoned; selected fields are coalesced onto the kept row with
 * keep-wins semantics. Splits and transfers are handled (see below). All writes
 * go out as raw CRDT messages in a single undoable batch.
 */
import { first, runQuery } from "@/core/db";
import { sendMessages } from "@/core/sync";
import { undoable } from "@/core/server/undo";
import { Timestamp } from "@/core/crdt";

type Msg = {
  timestamp: Timestamp;
  dataset: "transactions";
  row: string;
  column: string;
  value: string | number | null;
};

type MergeRow = {
  id: string;
  acct: string;
  amount: number;
  date: number;
  category: string | null;
  description: string | null;
  notes: string | null;
  cleared: 0 | 1;
  reconciled: 0 | 1;
  schedule: string | null;
  isParent: 0 | 1;
  parent_id: string | null;
  transferred_id: string | null;
  financial_id: string | null;
  imported_description: string | null;
};

const MERGE_COLS =
  "id, acct, amount, date, category, description, notes, cleared, reconciled, schedule, isParent, parent_id, transferred_id, financial_id, imported_description";

async function getRow(id: string): Promise<MergeRow | null> {
  return (
    (await first<MergeRow>(
      `SELECT ${MERGE_COLS} FROM transactions WHERE id = ? AND tombstone = 0`,
      [id],
    )) ?? null
  );
}

function set(msgs: Msg[], id: string, column: string, value: string | number | null): void {
  msgs.push({ timestamp: Timestamp.send()!, dataset: "transactions", row: id, column, value });
}

/** Mirror of shared/merge.ts::validForMergeExplanation — throws when invalid. */
function validate(a: MergeRow | null, b: MergeRow | null): asserts a is MergeRow {
  if (!a || !b) throw new Error("Cannot merge: transaction not found");
  if (a.acct !== b.acct) throw new Error("Cannot merge transactions from different accounts");
  if (a.amount !== b.amount) throw new Error("Cannot merge transactions with different amounts");
  if (a.transferred_id && b.transferred_id && a.description !== b.description) {
    throw new Error("Cannot merge transfers to different accounts");
  }
}

/** Priority: bank-imported wins, then imported-payee, then the earlier date. */
function determineKeepDrop(a: MergeRow, b: MergeRow): [MergeRow, MergeRow] {
  if (a.financial_id && !b.financial_id) return [a, b];
  if (b.financial_id && !a.financial_id) return [b, a];
  if (a.imported_description && !b.imported_description) return [a, b];
  if (b.imported_description && !a.imported_description) return [b, a];
  // Tie → keep b (mirrors upstream localeCompare(a,b) < 0 ? a : b).
  return a.date < b.date ? [a, b] : [b, a];
}

async function mergeNoTransfer(keep: MergeRow, drop: MergeRow, msgs: Msg[]): Promise<string> {
  const children = await runQuery<{ id: string; parent_id: string }>(
    "SELECT id, parent_id FROM transactions WHERE parent_id IN (?, ?) AND tombstone = 0",
    [keep.id, drop.id],
  );
  const keepHasSplits = children.some((c) => c.parent_id === keep.id);
  const dropChildren = children.filter((c) => c.parent_id === drop.id);

  if (!keepHasSplits && dropChildren.length > 0) {
    // Re-parent drop's children onto keep, and promote keep to a split parent.
    for (const child of dropChildren) set(msgs, child.id, "parent_id", keep.id);
    set(msgs, keep.id, "isParent", 1);
    set(msgs, keep.id, "category", null);
    set(msgs, keep.id, "description", keep.description ?? drop.description ?? null);
    set(msgs, keep.id, "notes", keep.notes ?? drop.notes ?? null);
    set(msgs, keep.id, "cleared", keep.cleared || drop.cleared ? 1 : 0);
    set(msgs, keep.id, "reconciled", keep.reconciled || drop.reconciled ? 1 : 0);
    set(msgs, keep.id, "schedule", keep.schedule ?? drop.schedule ?? null);
  } else {
    // Coalesce fields drop → keep, keep value taking precedence.
    set(msgs, keep.id, "description", keep.description ?? drop.description ?? null);
    set(msgs, keep.id, "category", keep.category ?? drop.category ?? null);
    set(msgs, keep.id, "notes", keep.notes ?? drop.notes ?? null);
    set(msgs, keep.id, "cleared", keep.cleared || drop.cleared ? 1 : 0);
    set(msgs, keep.id, "reconciled", keep.reconciled || drop.reconciled ? 1 : 0);
    set(msgs, keep.id, "schedule", keep.schedule ?? drop.schedule ?? null);
  }

  // Tombstone drop and cascade any of its remaining live children (in the
  // re-parent case above there are none left).
  set(msgs, drop.id, "tombstone", 1);
  const remaining = await runQuery<{ id: string }>(
    "SELECT id FROM transactions WHERE parent_id = ? AND tombstone = 0",
    [drop.id],
  );
  for (const c of remaining) {
    if (dropChildren.some((d) => d.id === c.id) && !keepHasSplits) continue; // re-parented
    set(msgs, c.id, "tombstone", 1);
  }

  return keep.id;
}

/** Recursively merge the transfer counterparts; returns the surviving id. */
async function mergeTransfers(
  aTransferId: string | null,
  bTransferId: string | null,
  msgs: Msg[],
): Promise<string | null> {
  if (aTransferId && bTransferId) {
    const [ca, cb] = await Promise.all([getRow(aTransferId), getRow(bTransferId)]);
    validate(ca, cb);
    const [keep, drop] = determineKeepDrop(ca, cb!);
    return mergeNoTransfer(keep, drop, msgs);
  }
  return aTransferId ?? bTransferId;
}

export const mergeTransactions = undoable(async function mergeTransactions(
  ids: string[],
): Promise<string> {
  const txIds = ids.filter(Boolean);
  if (txIds.length !== 2) throw new Error("mergeTransactions requires exactly 2 ids");

  const [a, b] = await Promise.all([getRow(txIds[0]), getRow(txIds[1])]);
  validate(a, b);

  const msgs: Msg[] = [];
  const aTransferId = a.transferred_id;
  const bTransferId = b!.transferred_id;

  let keptId: string;
  if (!aTransferId && !bTransferId) {
    const [keep, drop] = determineKeepDrop(a, b!);
    keptId = await mergeNoTransfer(keep, drop, msgs);
  } else {
    // The payee that points at the *other* account (used to relink the kept
    // transfer and to decide the on/off-budget category rule).
    const transferAccount = aTransferId ? a.description : b!.description;

    // Break all four links first so the merge doesn't cascade through transfers.
    for (const id of [a.id, b!.id, aTransferId, bTransferId]) {
      if (id) set(msgs, id, "transferred_id", null);
    }

    const transferId = await mergeTransfers(aTransferId, bTransferId, msgs);
    const [keep, drop] = determineKeepDrop(a, b!);
    keptId = await mergeNoTransfer(keep, drop, msgs);

    if (transferId) {
      set(msgs, keptId, "transferred_id", transferId);
      set(msgs, keptId, "description", transferAccount);
      set(msgs, transferId, "transferred_id", keptId);
    }

    // On-budget transfers must not carry a category; off-budget ones keep it.
    if (transferAccount && !(aTransferId && bTransferId)) {
      const payee = await first<{ transfer_acct: string | null }>(
        "SELECT transfer_acct FROM payees WHERE id = ?",
        [transferAccount],
      );
      if (payee?.transfer_acct) {
        const acct = await first<{ offbudget: 0 | 1 }>(
          "SELECT offbudget FROM accounts WHERE id = ? AND tombstone = 0",
          [payee.transfer_acct],
        );
        if (acct && acct.offbudget === 0) set(msgs, keptId, "category", null);
      }
    }
  }

  if (msgs.length > 0) await sendMessages(msgs);
  return keptId;
});
