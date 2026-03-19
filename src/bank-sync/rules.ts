// ---------------------------------------------------------------------------
// Bank Sync — Rules integration
//
// Applies the existing rules engine to imported bank transactions.
// Uses internal field names (INTERNAL_FIELD_MAP) so conditions like
// "imported_payee contains X" work correctly.
// ---------------------------------------------------------------------------

import { runRules } from "../rules/engine";
import { getRules } from "../rules";
import type { NormalizedTransaction } from "./normalize";

/**
 * Apply transaction rules to a normalized bank transaction.
 *
 * The rules engine uses internal field names:
 *   - `description` = payee id
 *   - `imported_description` = raw bank payee name
 *   - `acct` = account id
 *
 * Rules can set: category, description (payee), notes, cleared, etc.
 */
export async function applyRulesToBankTransaction(
  normalized: NormalizedTransaction,
  acctId: string,
  payeeId: string,
): Promise<{ category: string | null; description: string | null }> {
  const rules = await getRules();
  if (rules.length === 0) return { category: null, description: payeeId };

  // Build transaction object using internal field names
  const txObj: Record<string, unknown> = {
    acct: acctId,
    amount: normalized.trans.amount,
    date: normalized.trans.date,
    description: payeeId,
    imported_description: normalized.trans.imported_description,
    notes: normalized.trans.notes,
    category: null,
    cleared: normalized.trans.cleared ? 1 : 0,
  };

  const result = runRules(rules, txObj);

  return {
    category: (result.category as string) ?? null,
    description: (result.description as string) ?? payeeId,
  };
}
