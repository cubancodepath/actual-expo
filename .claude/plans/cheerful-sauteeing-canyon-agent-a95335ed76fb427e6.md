# Refactoring Plan: actual-expo Architecture Improvements

## Executive Summary

13 issues identified across the codebase, grouped into 6 phases. Each phase is independently mergeable. Phases are ordered by (1) dependency requirements and (2) impact-to-effort ratio. Total estimated effort: ~3-4 focused sessions.

---

## Phase 0: Dead Code Removal + Trivial Fixes

**Goal**: Quick wins that reduce noise and fix inconsistencies with zero risk.

**Rationale**: Removing dead code first shrinks the surface area for all subsequent phases. These changes require no architectural decisions and are trivially verifiable.

### 0A. Delete legacy `prefs/` module

- **Files**: Delete `src/prefs/index.ts`
- **Verification**: `grep -r "from.*prefs/" src/ app/` should return zero hits (already confirmed zero consumers). Run `npx tsc --noEmit`.

### 0B. Deduplicate `serializeValue`/`deserializeValue`

- **Problem**: Identical functions exist in `src/sync/index.ts` (public, exported) and `src/sync/encoder.ts` (private, module-scoped). Both are called at runtime.
- **Change**: Delete the private copies in `encoder.ts`, import from `sync/index.ts` instead.
- **Files modified**: `src/sync/encoder.ts` (remove functions, add import from `./index` or a shared file)
- **Risk**: Circular dependency -- `encoder.ts` is imported by `sync/index.ts` via the `encode`/`decode` functions. The fix is to extract `serializeValue`/`deserializeValue` into a new file `src/sync/values.ts` that both can import.
- **Extracted module**: `src/sync/values.ts`
  ```ts
  export function serializeValue(value: string | number | null): string
  export function deserializeValue(value: string): string | number | null
  ```
- **Files modified**: `src/sync/values.ts` (new), `src/sync/index.ts` (re-export from values), `src/sync/encoder.ts` (import from values)
- **Verification**: `npx tsc --noEmit`. Existing sync smoke test (`bun scripts/smoke-test.ts`).

### 0C. Deduplicate `TAG_REGEX` in tags module

- **Problem**: `TAG_REGEX` defined at module level (line 9) AND re-defined inline in `parseNotes()` (line 99).
- **Change**: `parseNotes()` should use the module-level `TAG_REGEX` constant. Since it's a global regex, clone it or reset `lastIndex` before use.
- **Files modified**: `src/tags/index.ts`
- **Verification**: `npx tsc --noEmit`.

### 0D. Add `undoable()` wrapper to tag mutations

- **Problem**: `createTag`, `updateTag`, `deleteTag` in `src/tags/index.ts` lack the `undoable()` wrapper that every other domain module uses.
- **Change**: Wrap all three functions with `undoable()`, matching the pattern in `accounts/`, `transactions/`, `categories/`, `payees/`.
- **Files modified**: `src/tags/index.ts`
- **Verification**: Manual test: create tag, shake to undo, verify tag is removed.

### 0E. Normalize store naming convention

- **Problem**: `budgetStore` (singular) vs `accountsStore` (plural). Minor inconsistency.
- **Decision**: This is cosmetic and touches many import sites. **Defer** -- not worth the churn. Document the convention instead: "stores are named for their primary dataset, plural when they hold a collection."
- **Action**: No code change. Add a comment in `src/stores/` directory.

---

## Phase 1: Decompose `sync/index.ts` (419 lines, 6+ responsibilities)

**Goal**: Split the god module into focused, single-responsibility modules. This phase has no UI impact and is purely structural.

**Rationale**: `sync/index.ts` is imported by nearly every domain module. Decomposing it makes the sync layer testable, reduces merge conflicts, and makes the budget-switch lifecycle explicit.

### Proposed Module Structure

```
src/sync/
  values.ts          -- serializeValue / deserializeValue (from Phase 0B)
  clock.ts           -- loadClock / saveClock
  batch.ts           -- batchMessages / sendMessages + debounced scheduleFullSync
  apply.ts           -- applyMessages (core CRDT logic)
  fullSync.ts        -- fullSync() network protocol
  lifecycle.ts       -- resetSyncState / clearSwitchingFlag / isSwitchingBudget / clearSyncTimeout
  encoder.ts         -- (unchanged) protobuf encode/decode
  undo.ts            -- (unchanged) undo system
  index.ts           -- thin re-export barrel
```

### Module Signatures

**`src/sync/clock.ts`**
```ts
export async function loadClock(): Promise<void>
export async function saveClock(): Promise<void>
```

**`src/sync/lifecycle.ts`**
```ts
export function resetSyncState(): void
export function clearSwitchingFlag(): void
export function isSwitchingBudget(): boolean
export function clearSyncTimeout(): void
// Module state: _syncGeneration, _switchingBudget, _syncTimeout
// Also exports getSyncGeneration() for fullSync guard checks
export function getSyncGeneration(): number
```

**`src/sync/apply.ts`**
```ts
import type { SyncMessage } from './encoder'
import type { OldData } from './undo'

export async function applyMessages(messages: SyncMessage[]): Promise<OldData>
// Contains: ALLOWED_TABLES, sorted apply loop, prefs handling, merkle updates
```

**`src/sync/batch.ts`**
```ts
import type { SyncMessage } from './encoder'

export async function sendMessages(messages: SyncMessage[]): Promise<void>
export async function batchMessages(fn: () => Promise<void>): Promise<void>
// Contains: _isBatching, _batched, _applyAndRecord (private), scheduleFullSync (private)
```

**`src/sync/fullSync.ts`**
```ts
export async function fullSync(attempt?: number): Promise<void>
export async function getMessagesSince(since: string): Promise<SyncMessage[]>
```

**`src/sync/index.ts`** (barrel)
```ts
// Re-exports from all sub-modules for backward compatibility
export { serializeValue, deserializeValue } from './values'
export { loadClock, saveClock } from './clock'
export { sendMessages, batchMessages } from './batch'
export { applyMessages } from './apply'
export { fullSync, getMessagesSince } from './fullSync'
export { resetSyncState, clearSwitchingFlag, isSwitchingBudget, clearSyncTimeout } from './lifecycle'
export { refreshAllStores } from '../stores/storeRegistry'
```

### Dependency Graph (must respect)

```
lifecycle.ts  <-- batch.ts (checks _switchingBudget via lifecycle)
                   |
values.ts     <-- apply.ts (serializeValue/deserializeValue)
                   |
clock.ts      <-- apply.ts (getClock, saveClock)
                   |
apply.ts      <-- batch.ts (_applyAndRecord calls applyMessages)
                   |
batch.ts      <-- fullSync.ts (not directly, but scheduleFullSync is internal to batch)
```

### Migration Strategy

1. Create `values.ts`, `clock.ts`, `lifecycle.ts` first (leaf modules with no internal deps).
2. Create `apply.ts` (depends on values, clock).
3. Create `batch.ts` (depends on apply, lifecycle).
4. Create `fullSync.ts` (depends on batch, apply, lifecycle, clock).
5. Update `index.ts` to be a pure re-export barrel.
6. **All existing imports from `../sync` continue to work** -- the barrel re-exports everything.

### Verification

- `npx tsc --noEmit`
- `bun scripts/smoke-test.ts` (full sync integration test)
- Manual test: create transaction, verify it syncs to server

---

## Phase 2: Extract Transaction Save Logic from `transaction/new.tsx`

**Goal**: Move the 4-branch save logic out of the screen component into a domain-level function. The screen should call one function and not know about CRDT batching, split normalization, or payee resolution.

**Rationale**: The screen currently calls `batchMessages()`, `findOrCreatePayee()`, `addTransaction()`, `deleteTransactionById()`, and `getChildTransactions()` directly. This is business logic that belongs in the transactions domain module, not the UI layer.

### Extracted Function

**`src/transactions/save.ts`**
```ts
export type SaveTransactionInput = {
  /** If provided, this is an edit. Otherwise, a new transaction. */
  transactionId?: string
  acct: string
  date: number
  /** Always positive cents. Sign is determined by `type`. */
  amount: number
  type: 'expense' | 'income'
  payeeId: string | null
  payeeName: string
  categoryId: string | null
  notes: string | null
  cleared: boolean
  /** Non-null = split transaction with these lines */
  splitCategories: SplitLine[] | null
}

export type SplitLine = {
  id?: string           // existing child ID (for edits)
  categoryId: string | null
  categoryName: string
  amount: number        // positive cents
}

/**
 * Saves a transaction (new or edit, simple or split).
 *
 * Handles:
 * - Payee resolution (findOrCreatePayee if payeeId is null)
 * - Amount sign convention (expense = negative)
 * - Split normalization (1-line split = regular category)
 * - 4-branch save: split-edit, split-new, simple-edit, simple-new
 * - CRDT batching for split transactions
 *
 * Returns the saved transaction ID.
 */
export async function saveTransaction(input: SaveTransactionInput): Promise<string>
```

### What Changes in the Screen

`app/(auth)/transaction/new.tsx` `performSave()` becomes:

```ts
async function performSave() {
  await saveTransaction({
    transactionId: isEdit ? transactionId : undefined,
    acct: acctId!,
    date: strToInt(dateStr) ?? dateInt,
    amount: cents,
    type,
    payeeId,
    payeeName,
    categoryId,
    notes: notes.trim() || null,
    cleared,
    splitCategories: splitCategories,
  })
  await loadAccounts()
  router.dismiss()
}
```

This removes ~60 lines from the screen and all direct imports of `batchMessages`, `findOrCreatePayee`, `addTransaction` (as direct call), `getChildTransactions`, and `deleteTransactionById`.

### Tag-to-Notes Encoding

The screen currently encodes tags into notes inline (lines 153-157). This should stay in the screen since it's a UI concern (the notes field contains the encoded tags). The `saveTransaction` function receives the final notes string.

### Files Modified

- `src/transactions/save.ts` (new)
- `src/transactions/index.ts` (re-export saveTransaction)
- `app/(auth)/transaction/new.tsx` (simplified performSave)

### Verification

- `npx tsc --noEmit`
- Manual test: create simple transaction, edit simple transaction, create split, edit split, verify all 4 paths work
- Test edge case: 1-line split collapses to regular category

---

## Phase 3: Resolve `useTransactionList` Duplication

**Goal**: Eliminate the diverging implementations. The monolith `useTransactionList.ts` should compose the sub-hooks, not reimplement them.

**Rationale**: Currently there are two complete, diverging implementations:
- **Sub-hooks** (used by 4 screens: spending/index, account/[id], account/search, spending/search): `useTransactionPagination` + `useTransactionActions` + `useTransactionBulkActions` + etc.
- **Monolith** (used by 2 screens: spending/index, account/[id]): `useTransactionList.ts` which reimplements ALL of the above using useReducer.

Wait -- checking the grep results more carefully: the monolith IS used by spending/index and account/[id], while the sub-hooks are ALSO used by those same files plus the search screens. This means some screens use both simultaneously or there's a migration in progress.

### Decision: Keep the Monolith, Delete the Sub-Hooks

After analyzing both implementations:

1. The **monolith** is more complete -- it has the useReducer pattern (batched state updates, no torn renders), unified picker handling, and all bulk actions.
2. The **sub-hooks** use `useState` + `setTransactions` prop-drilling, which causes more re-renders and has stale-closure risks.
3. The monolith was clearly written as a replacement for the sub-hooks but the migration was never completed.

### Strategy

**Step 1**: Identify which sub-hook features the monolith is missing (if any). From my analysis, the monolith covers everything the sub-hooks do.

**Step 2**: Migrate the 4 screens currently using sub-hooks to use the monolith instead.

**Step 3**: Delete the unused sub-hooks: `useTransactionPagination.ts`, `useTransactionActions.ts`, `useTransactionBulkActions.ts`, `useBulkCategoryPicker.ts`, `useBulkAccountPicker.ts`, `useTransactionSelection.ts`, `useSelectModeHeader.tsx`.

**Step 4**: Update `index.ts` barrel to only export what's still used.

### Screens to Migrate

1. `app/(auth)/account/search.tsx` -- uses sub-hooks
2. `app/(auth)/(tabs)/(spending)/search.tsx` -- uses sub-hooks

These search screens likely use a subset of the monolith's features. The monolith's `fetchTransactions` callback pattern makes it adaptable -- the screen just provides a different fetch function.

### Files Modified

- `app/(auth)/account/search.tsx`
- `app/(auth)/(tabs)/(spending)/search.tsx`
- `src/presentation/hooks/transactionList/useTransactionPagination.ts` (delete)
- `src/presentation/hooks/transactionList/useTransactionActions.ts` (delete)
- `src/presentation/hooks/transactionList/useTransactionBulkActions.ts` (delete)
- `src/presentation/hooks/transactionList/useBulkCategoryPicker.ts` (delete)
- `src/presentation/hooks/transactionList/useBulkAccountPicker.ts` (delete)
- `src/presentation/hooks/transactionList/useTransactionSelection.ts` (delete)
- `src/presentation/hooks/transactionList/useSelectModeHeader.tsx` (delete)
- `src/presentation/hooks/transactionList/index.ts` (simplify)

### Verification

- `npx tsc --noEmit`
- Manual test: all 4 screens (spending, account detail, spending search, account search) -- pagination, selection, bulk delete, bulk move, bulk categorize, toggle cleared, duplicate, delete with undo

---

## Phase 4: Deduplicate Budget Computation (`computeToBudget` overlap)

**Goal**: Eliminate the ~90 lines of duplicated SQL/logic between `computeToBudget()` and `getBudgetMonth()`.

**Rationale**: Both functions compute cumulative income, cumulative budgeted, buffered, and overspending penalty identically. If the calculation ever needs a fix (it has been fixed multiple times already based on the FIX comments), it must be changed in both places.

### Approach: Extract shared helper

```ts
// src/budgets/toBudget.ts

export type ToBudgetInputs = {
  monthInt: number
  groups: CategoryGroupRow[]
  categories: CategoryRow[]
  /** Pre-loaded budget rows for current month (optional optimization) */
  currentBudgetRows?: ZeroBudgetRow[]
  /** Pre-loaded current month spending map (optional optimization) */
  currentSpendingMap?: Map<string, number>
}

export type ToBudgetResult = {
  toBudget: number
  buffered: number
  cumulativeIncome: number
  cumulativeBudgeted: number
  overspendingPenalty: number
  carryIns: Map<string, number>
  prevCoFlags: Map<string, boolean>
  currentCoFlags: Map<string, boolean>
}

export async function computeToBudgetFull(inputs: ToBudgetInputs): Promise<ToBudgetResult>
```

### How It's Used

**`getBudgetMonth()`** calls `computeToBudgetFull()` with the data it already loaded (groups, categories, budgetRows, currentMap), then uses the result to build per-category display data.

**`computeToBudget()`** becomes a thin wrapper:
```ts
export async function computeToBudget(month: string, opts?: { ... }): Promise<number> {
  const result = await computeToBudgetFull({ monthInt, groups, categories })
  return result.toBudget
}
```

### Files Modified

- `src/budgets/toBudget.ts` (new -- extracted shared logic)
- `src/budgets/index.ts` (both functions now delegate to toBudget.ts)

### Verification

- `npx tsc --noEmit`
- Manual test: budget screen shows correct toBudget, carryover, and category balances for current and past months

---

## Phase 5: Address Cross-Domain Coupling

**Goal**: Reduce coupling between `budgets/`, `goals/`, and `transactions/` without over-engineering.

### 5A. Extract `ALIVE_TX_FILTER` to shared location

**Problem**: `budgets/index.ts` and `goals/engine.ts` both import `ALIVE_TX_FILTER` from `transactions/query.ts`. This couples budget/goal computation to the transaction module's query builder file.

**Solution**: Move `ALIVE_TX_FILTER` to `src/db/filters.ts` (or `src/lib/sql.ts`). This is a shared SQL fragment, not transaction-specific logic.

```ts
// src/db/filters.ts
/** Alive-transaction filter: excludes parents, tombstoned children, null dates/accounts */
export const ALIVE_TX_FILTER = `...`
```

**Files modified**: `src/db/filters.ts` (new), `src/transactions/query.ts` (re-export for backward compat), `src/budgets/index.ts`, `src/goals/engine.ts`

### 5B. Document budgets-goals bidirectional dependency (no code change)

**Current state**:
- `budgets/index.ts` imports `inferGoalFromDef` from `goals/`
- `goals/apply.ts` imports `setBudgetAmount`, `computeToBudget`, `computeCarryoverChain` from `budgets/`
- `goals/progress.ts` imports `BudgetCategory` type from `budgets/types`

This is a natural bidirectional dependency between closely-related domains. `inferGoalFromDef` is a pure function that parses goal definitions -- it has no DB calls and no dependency on budget state. The `goals/apply.ts` module legitimately needs to write budget amounts (it's the "apply goals" use case).

**Decision**: This coupling is acceptable. The alternative (extracting a shared "goal-definition" module) adds a layer of indirection for no practical benefit. **No code change.** Document the relationship in a comment at the top of both modules.

### Verification

- `npx tsc --noEmit`
- `grep -r "ALIVE_TX_FILTER" src/` confirms all imports resolve

---

## Phase Summary

| Phase | Files Changed | Risk | Impact |
|-------|--------------|------|--------|
| 0: Dead code + trivial fixes | 4 modified, 1 deleted | Minimal | Low noise reduction |
| 1: Decompose sync/index.ts | 6 new, 1 rewritten | Low (barrel preserves API) | High -- testable sync layer |
| 2: Extract saveTransaction | 2 new, 1 simplified | Low (pure extraction) | Medium -- screen becomes declarative |
| 3: Resolve hook duplication | 2 migrated, 7 deleted | Medium (screen behavior) | High -- single source of truth |
| 4: Deduplicate budget computation | 1 new, 1 simplified | Low (pure extraction) | Medium -- single calculation path |
| 5: Cross-domain coupling | 1 new, 3 modified | Minimal | Low -- cleaner imports |

### Recommended Execution Order

1. **Phase 0** first (5 min) -- removes noise
2. **Phase 1** next (largest structural change, no UI impact, unblocks future sync testing)
3. **Phase 2** (can be done in parallel with Phase 1 since they touch different files)
4. **Phase 4** (straightforward extraction, can be done anytime after Phase 0)
5. **Phase 5A** (quick, can be done anytime)
6. **Phase 3** last (highest risk -- touches 4 screens, needs thorough manual testing)

### What This Plan Does NOT Address (Intentionally Deferred)

- **Import path aliases** (#12): Useful but purely cosmetic. Adding tsconfig paths affects every import in the codebase and generates massive diffs that obscure real changes. Do this as a standalone PR after all structural changes land.
- **Component barrel file usage** (#7): Same rationale -- touching 40+ screens to change import paths is churn. Do after path aliases are set up.
- **`app/_layout.tsx` decomposition** (#11): The file is 170 lines and reasonably organized. The bootstrap, badge, quick actions, and shortcuts are all root-level concerns. Extracting custom hooks for each would add files without reducing complexity. Defer unless the file grows past 250 lines.
