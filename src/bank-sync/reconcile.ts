// ---------------------------------------------------------------------------
// Bank Sync — Transaction reconciliation orchestrator
//
// Ties together: normalize → resolve payees → apply rules → match → commit.
// Ported from loot-core's reconcileTransactions().
// ---------------------------------------------------------------------------

import { randomUUID } from "expo-crypto";
import { sendMessages, batchMessages } from "../sync";
import { Timestamp } from "../crdt";
import { normalizeBankTransactions } from "./normalize";
import { resolvePayee, resetCreatedPayees } from "./payees";
import { applyRulesToBankTransaction } from "./rules";
import { matchTransactions, type MatchResult } from "./match";
import type { BankTransaction } from "./types";
import type { BankSyncResult } from "./types";

/** Sort order increment for imported transactions (1 second apart) */
const SORT_INCREMENT = 1000;

/**
 * Reconcile bank transactions with existing local transactions.
 *
 * 1. Normalize raw bank data
 * 2. Resolve payees (create if needed)
 * 3. Apply transaction rules
 * 4. Match against existing transactions (3-pass)
 * 5. Update matched / create new via CRDT messages
 *
 * Returns IDs of added and updated transactions.
 */
export async function reconcileTransactions(
  acctId: string,
  bankTransactions: BankTransaction[],
): Promise<BankSyncResult> {
  const added: string[] = [];
  const updated: string[] = [];

  // Reset payee cache for this sync batch
  resetCreatedPayees();

  // Step 1: Normalize
  const normalized = normalizeBankTransactions(bankTransactions, acctId);
  if (normalized.length === 0) return { added, updated };

  // Step 2 & 3: Resolve payees + apply rules
  const withPayees: MatchResult["trans"][] = [];
  const payeeNames: string[] = [];

  for (const norm of normalized) {
    const payeeId = await resolvePayee(norm.payee_name);
    const ruleResult = applyRulesToBankTransaction(norm, acctId, payeeId);

    withPayees.push({
      ...norm.trans,
      description: ruleResult.description,
      category: ruleResult.category ?? norm.trans.category,
    });
    payeeNames.push(norm.payee_name);
  }

  // Step 4: Match
  const matchInput = withPayees.map((trans, i) => ({
    trans,
    payee_name: payeeNames[i],
  }));
  const matchResults = await matchTransactions(acctId, matchInput);

  // Step 5: Commit changes via CRDT
  await batchMessages(async () => {
    const now = Date.now();

    for (let i = 0; i < matchResults.length; i++) {
      const { trans, match } = matchResults[i];

      if (match) {
        // Skip reconciled (locked) transactions
        if (match.reconciled === 1) continue;

        // Merge: existing values take precedence
        const updates: Record<string, string | number | null> = {};
        let hasChanges = false;

        // Always set imported_id if we have one and existing doesn't
        if (trans.imported_id && match.financial_id !== trans.imported_id) {
          updates.financial_id = trans.imported_id;
          hasChanges = true;
        }

        // Payee: keep existing if set
        if (!match.description && trans.description) {
          updates.description = trans.description;
          hasChanges = true;
        }

        // Category: keep existing if set
        if (!match.category && trans.category) {
          updates.category = trans.category;
          hasChanges = true;
        }

        // Imported description: always update
        if (trans.imported_description !== match.imported_description) {
          updates.imported_description = trans.imported_description;
          hasChanges = true;
        }

        // Notes: keep existing if set
        if (!match.notes && trans.notes) {
          updates.notes = trans.notes;
          hasChanges = true;
        }

        // Cleared: OR — once cleared, stays cleared
        const matchCleared = match.cleared === 1;
        if (!matchCleared && trans.cleared) {
          updates.cleared = 1;
          hasChanges = true;
        }

        // Raw synced data: always update
        updates.raw_synced_data = trans.raw_synced_data;
        hasChanges = true;

        if (hasChanges) {
          await sendMessages(
            Object.entries(updates).map(([column, value]) => ({
              timestamp: Timestamp.send()!,
              dataset: "transactions",
              row: match.id,
              column,
              value,
            })),
          );
          updated.push(match.id);
        }
      } else {
        // Create new transaction
        const id = randomUUID();
        const fields: Record<string, string | number | null> = {
          acct: acctId,
          amount: trans.amount,
          date: trans.date,
          description: trans.description,
          category: trans.category,
          notes: trans.notes,
          financial_id: trans.imported_id,
          imported_description: trans.imported_description,
          cleared: trans.cleared ? 1 : 0,
          raw_synced_data: trans.raw_synced_data,
          sort_order: now - i * SORT_INCREMENT,
        };

        await sendMessages(
          Object.entries(fields).map(([column, value]) => ({
            timestamp: Timestamp.send()!,
            dataset: "transactions",
            row: id,
            column,
            value,
          })),
        );
        added.push(id);
      }
    }
  });

  return { added, updated };
}
