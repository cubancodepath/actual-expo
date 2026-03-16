# SQL Query Optimizer — Persistent Memory

## Schema Conventions

- Soft deletes: `tombstone INTEGER DEFAULT 0` — ALWAYS filter `WHERE tombstone = 0`
- `transactions.description` = payee ID (confusing column name — not a text description)
- `transactions.date` = integer YYYYMMDD (e.g. 20260308)
- `zero_budgets.month` = integer YYYYMM (e.g. 202603)
- `zero_budget_months.id` = string "YYYY-MM" (e.g. "2026-03") — inconsistent with month column
- Category mapping via `category_mapping(id, transferId)` and `payee_mapping(id, targetId)`
- `isParent/isChild` (camelCase) on transactions — not `is_parent/is_child`
- `cat_group` column on categories references category_groups.id

## Existing Indexes (as of 2026-03)

See `src/db/schema.ts` INDEXES block. Key gaps:

- NO index on `accounts(tombstone)`
- NO composite `transactions(acct, tombstone, isChild, date)` — main account view filter
- NO composite `transactions(tombstone, isChild, date)` — all-transactions view
- NO expression index on `payees(LOWER(name))` — used in findOrCreatePayee
- YES: `idx_zero_budgets_month_category` — covers all budget row lookups
- YES: `idx_transactions_parent_id` — covers child transaction fetches
- YES: `idx_payees_transfer_acct` — covers transfer payee lookups

## Query Patterns

- Standard display JOIN (copy-pasted 5×): payee_mapping → payees → accounts + category_mapping → categories
- `COALESCE(pm.targetId, t.description)` join pattern — unavoidable, cannot use index on description
- `COALESCE(cm.transferId, t.category)` join pattern — same issue, unavoidable
- `ALIVE_TX_FILTER` string constant defined in TWO files: `budgets/index.ts:21` and `goals/engine.ts:45` — must update both
- Split transactions: correlated subqueries with GROUP_CONCAT in 3 display queries (Q13, Q14, Q15)

## Known Anti-Patterns in Codebase

- `SELECT *` used throughout (transactions, categories, tags) — established pattern, changing would require careful refactoring
- LIMIT/OFFSET string-interpolated in `getTransactions`, `getTransactionsForAccount`, `getAllTransactions`, `searchTransactions` — no SQL injection risk (numeric) but prevents query plan caching
- `transferMultipleCategories()` in `budgets/index.ts`: N+1 loop — fires 1 query per source category
- `runAverage()` in `goals/engine.ts`: N queries per template (one per lookback month)
- `getTransactionById()` uses `runQuery()` instead of `first()` for single-row PK lookup
- `setClearedBulk()` has no 999-variable guard for large `IN (...)` lists

## Key Files

- Schema + indexes: `src/db/schema.ts`
- DB helpers (runQuery/first/run/transaction): `src/db/index.ts`
- Accounts queries: `src/accounts/index.ts`
- Transaction queries (most complex): `src/transactions/index.ts`
- Budget engine (most DB-intensive): `src/budgets/index.ts`
- Goal templates: `src/goals/engine.ts`, `src/goals/apply.ts`, `src/goals/index.ts`
- Dynamic SQL (CRDT apply): `src/sync/index.ts` — dataset/column interpolated but guarded by ALLOWED_TABLES whitelist

## Dynamic SQL Safety (sync/index.ts)

- `applyMessages()` interpolates `dataset` and `column` into UPDATE/INSERT
- `dataset` is guarded by ALLOWED_TABLES Set checked at line 204 (skip) and line 251 (write path)
- `column` comes from CRDT messages — trusted server model, no validation
- `SELECT * FROM ${dataset} WHERE id IN (...)` at line 218 — safe only if ALLOWED_TABLES guard maintained

## Performance-Critical Queries (priority order)

1. `getTransactionsForAccount()` — main account list view, paginated, runs constantly
2. `getAllTransactions()` — spending tab, full scan with complex JOINs
3. `getBudgetMonth()` — calls computeCarryoverChain + 6+ other queries per call
4. `computeCarryoverChain()` — scans full transaction history, called 2× per getBudgetMonth
5. `searchTransactions()` — LIKE scans, cannot be fully indexed
6. `getAccounts()` — runs on every accounts store load, aggregates all transactions
