# Plan 002: Characterization tests for the transaction mutation core (save / split / transfer)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cab6621..HEAD -- src/core/domain/transactions/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: LOW (additive tests; the risk is _discovering_ existing bugs — see STOP conditions)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `cab6621`, 2026-07-19

## Why this matters

`src/core/domain/transactions/` (~1,533 lines across `save.ts`, `split.ts`, `transfer.ts`, `index.ts`) is the single most money-critical write path in this budgeting app — creating/editing transactions, split management, and paired transfer mirroring — and it has **zero test files**. Plans 005 (transfer-hook suppression for splits), 006 (atomic transfer creation) and 009 (mutation-pipeline serialization) will refactor this code; without characterization tests first, a silent regression corrupts account balances. This plan pins current behavior; it does NOT fix the known bugs (that's plans 004–006).

## Current state

- `src/core/domain/transactions/save.ts` — `saveTransaction()`: 4 paths (split-edit, split-new, simple-edit, simple-new); split paths wrap mutations in `batchMessages`; `resolvedPayeeId = payeeId ?? await findOrCreatePayee(payeeName)`; expense amounts negated (`finalAmount = type === "expense" ? -amount : amount`).
- `src/core/domain/transactions/index.ts:64` — `addTransaction = undoable(...)`: sends one CRDT message per column, then unconditionally calls the transfer `onInsert` hook.
- `src/core/domain/transactions/index.ts:134` — `updateTransaction = undoable(...)`: fetches prev row, sends changed columns, then calls transfer `onUpdate`.
- `src/core/domain/transactions/index.ts:219` — `moveTransaction`: plain async (not undoable), `batchMessages` over parent + children.
- `src/core/domain/transactions/transfer.ts:77` — `onInsert`: if payee has `transfer_acct`, creates a mirror transaction with `amount: -txn.amount` in the destination account and links both via `transferred_id` (two separate `sendMessages` calls — known non-atomicity, do NOT "fix" it here, just characterize).
- `src/core/domain/transactions/split.ts` — split helpers (read it before writing split tests).
- **Known bugs to characterize as-is, not fix** (each has its own fix plan):
  - A split whose payee is a transfer payee creates one mirror per parent AND per child (no `is_parent`/`is_child` suppression in `addTransaction`) — plan 005.
  - Split saves and `moveTransaction` record nothing in undo history (their `batchMessages` flush happens after the inner `undoable` scopes exit) — plan 004.

### Test infrastructure that already exists (reuse it)

- `src/core/db/__tests__/testDb.ts` — helper that opens a `better-sqlite3`-backed in-memory DB, runs `initSchema` + `loadClock()`. Used by all `src/core/sync/__tests__/*` tests.
- Structural exemplars: `src/core/sync/__tests__/apply.test.ts`, `src/core/domain/budgets/__tests__/transfers.test.ts` (domain-level test driving real mutations through the batch path).
- Vitest config: `vitest.config.ts`; run with `npx vitest run`.

## Commands you will need

| Purpose   | Command                                       | Expected on success                 |
| --------- | --------------------------------------------- | ----------------------------------- |
| Install   | `pnpm install`                                | exit 0                              |
| Typecheck | `npx tsc --noEmit`                            | exit 0                              |
| All tests | `npx vitest run`                              | 0 failures (baseline: 1152 passing) |
| New tests | `npx vitest run src/core/domain/transactions` | all new tests pass                  |
| Lint      | `npm run lint`                                | exit 0                              |

## Scope

**In scope** (create only; do not modify production code):

- `src/core/domain/transactions/__tests__/save.test.ts` (create)
- `src/core/domain/transactions/__tests__/split.test.ts` (create)
- `src/core/domain/transactions/__tests__/transfer.test.ts` (create)
- `src/core/domain/transactions/__tests__/helpers.ts` (create, optional shared fixtures)

**Out of scope** (do NOT touch):

- Any file under `src/core/domain/transactions/` other than the new `__tests__/` dir — this plan characterizes, it does not fix.
- `src/core/sync/*` production code.

## Git workflow

- Branch: `develop` or short-lived branch off it.
- Conventional commit, e.g. `test(transactions): characterization tests for save/split/transfer`.
- **Never add AI-attribution or Co-Authored-By lines.** Do NOT push unless instructed.

## Steps

### Step 1: Fixtures

Create `__tests__/helpers.ts` with: open test DB via `testDb.ts` pattern; insert
two accounts (one on-budget, one off-budget), two categories, one normal payee,
and one transfer payee per account (`payees.transfer_acct = <account id>`),
using the same raw-SQL/CRDT patterns the sync tests use.

**Verify**: `npx vitest run src/core/domain/transactions` → the (so far empty) suite compiles and runs.

### Step 2: `save.test.ts` — simple paths

Cover: simple-new expense (amount stored negative, payee resolved by name via
`findOrCreatePayee` when `payeeId` null); simple-new income (positive); simple-edit
updates only changed columns; `cleared` flag round-trip; rules argument absent → no
category auto-fill.

**Verify**: `npx vitest run src/core/domain/transactions/__tests__/save.test.ts` → all pass.

### Step 3: `split.test.ts` — split-new and split-edit

Cover: split-new creates 1 parent (`isParent=1`, `category` NULL) + N children
(`isChild=1`, `parent_id` = parent, sign applied per line); split-edit deletes old
children and recreates; child amounts sum behavior (characterize as-is — do not
assert a "must equal parent" invariant unless the code enforces one); deleting the
parent (via `deleteTransaction`) — characterize what happens to children.

**Verify**: `npx vitest run src/core/domain/transactions/__tests__/split.test.ts` → all pass.

### Step 4: `transfer.test.ts` — transfer lifecycle

Cover: addTransaction with transfer payee → mirror row in destination account
with negated amount, both rows linked via `transferred_id`, category cleared when
both accounts share on/off-budget status; onUpdate transitions (became transfer /
no longer transfer / amount change propagates to mirror); onDelete tombstones the
mirror. **Also pin the current split+transfer behavior** (one mirror per parent
and per child) in a test named so plan 005 can flip its expectation, e.g.
`"KNOWN BUG (plan 005): split with transfer payee creates a mirror per child"`.

**Verify**: `npx vitest run src/core/domain/transactions/__tests__/transfer.test.ts` → all pass.

### Step 5: Full-suite regression

**Verify**: `npx vitest run` → 0 failures; `npx tsc --noEmit` → exit 0; `npm run lint` → exit 0.

## Test plan

This plan IS the test plan — expect roughly 20–30 new tests across the three
files, modeled structurally on `src/core/domain/budgets/__tests__/transfers.test.ts`.

## Done criteria

- [ ] `npx vitest run` exits 0; total test count > 1152
- [ ] Three new test files exist under `src/core/domain/transactions/__tests__/`
- [ ] `git status` shows no modified production files (only the new `__tests__/` dir)
- [ ] `npx tsc --noEmit` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- The test DB helper (`src/core/db/__tests__/testDb.ts`) doesn't expose what you
  need to drive `sendMessages`/`batchMessages` — report what's missing instead of
  restructuring the helper.
- You find behavior that looks like a bug NOT listed in "Current state" — write
  the characterization test pinning the current behavior, add a `// KNOWN-ODD:` comment,
  and list it in your final report. Do not fix it.
- Any pre-existing test starts failing.

## Maintenance notes

- Plans 004, 005, 006 and 009 will change behaviors pinned here — each is
  expected to flip the specific "KNOWN BUG" test(s) it fixes and must say so in
  its diff.
- Reviewers: check the split-edit tests actually assert child recreation (old
  children tombstoned), not just parent update.
