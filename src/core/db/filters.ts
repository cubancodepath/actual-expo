/**
 * Shared SQL filter fragments used across domain modules.
 */

/**
 * Alive-transaction filter for budget/goal calculations.
 * Excludes tombstoned rows, parent split headers, null dates/accounts,
 * and orphaned children whose parent is tombstoned.
 *
 * Expects the transactions table aliased as `t`.
 */
export const ALIVE_TX_FILTER = `
  t.tombstone = 0
  AND t.isParent = 0
  AND t.date IS NOT NULL
  AND t.acct IS NOT NULL
  AND (t.isChild = 0 OR NOT EXISTS (
    SELECT 1 FROM transactions t2 WHERE t2.id = t.parent_id AND t2.tombstone = 1
  ))`;
