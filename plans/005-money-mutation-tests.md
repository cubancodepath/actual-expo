# Plan 005: Characterization tests for the budget money-mutation functions

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 219c3c4..HEAD -- src/core/domain/budgets/`
> If `src/core/domain/budgets/index.ts` changed since this plan was written,
> re-locate the functions by name (they are exported) before proceeding; if a
> function was removed or renamed, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (tests only — no production code changes)
- **Depends on**: 001 (green suite makes new-test signal trustworthy)
- **Category**: tests
- **Planned at**: commit `219c3c4`, 2026-07-16

## Why this matters

The functions that move money between categories and to/from the "To Budget"
pool are the reason this app exists, are all wrapped in undo, and drive the
assign-money and cover-overspending screens — and none of them has a single
direct test. Any regression (sign flip, wrong month sheet, broken undo
grouping) ships silently. These characterization tests pin current behavior
BEFORE anyone refactors `budgets/index.ts`, and they are a declared
prerequisite for future work on that file.

## Current state

- System under test: `src/core/domain/budgets/index.ts`, exported functions
  (all `undoable(async ...)` wrappers) at these lines (at commit 219c3c4):
  - `setCategoryCarryover` — line 331
  - `holdForNextMonth(month, amountCents)` — line 402
  - `resetHold(month)` — line 431
  - `transferBetweenCategories` — line 486
  - `transferMultipleCategories(month, targetCategoryId, sources[], direction, targetName?)` — line 572
  - `setBudgetAmount(month, categoryId, amount)` — line 722
  - `transferAvailable(month, categoryId, amountCents)` — line 759 (positive
    cents = give from To Budget to the category; negative = pull back)
- These write CRDT messages to `zero_budgets` (rows keyed by month+category)
  via `sendMessages`, and are grouped for undo via the `undoable` wrapper from
  `src/core/sync/undo`.
- Existing test exemplars to copy structure from:
  - `src/core/domain/budgets/__tests__/getBudgetMonth.test.ts` — already sets
    up the in-memory DB and calls `setBudgetAmount` as a helper; copy its
    imports/bootstrapping verbatim.
  - In-memory DB harness: `src/core/db/__tests__/testDb.ts`.
- Read-back helpers available for assertions: `getBudgetMonth`,
  `getCategoryBalancesForMonth` (line ~707), or direct SQL via the test DB
  query helpers (`SELECT amount FROM zero_budgets WHERE ...`) — use whichever
  `getBudgetMonth.test.ts` uses.
- Undo entry points: look at `src/core/sync/undo.ts` exports (`undo`, `redo`
  or similarly named) and any existing undo test for the calling pattern; if
  no test exists and the API is unclear, assert on message grouping instead
  (see Step 4 fallback).

## Commands you will need

| Purpose    | Command                                  | Expected        |
| ---------- | ---------------------------------------- | --------------- |
| Run new    | `npx vitest run src/core/domain/budgets` | all pass        |
| Full suite | `npx vitest run`                         | no new failures |
| Lint       | `npm run lint`                           | exit 0          |

## Scope

**In scope** (create/modify tests only):

- `src/core/domain/budgets/__tests__/transfers.test.ts` (create)
- `src/core/domain/budgets/__tests__/holds.test.ts` (create — or fold into one file if <300 lines total)

**Out of scope** (do NOT touch):

- `src/core/domain/budgets/index.ts` — if a test reveals a real bug, WRITE THE
  TEST TO DOCUMENT CURRENT BEHAVIOR with a `// BUG?:` comment and report it;
  do not fix production code in this plan.
- `src/core/sync/*` production code.

## Git workflow

- Conventional commit, e.g. `test(budgets): characterization tests for money transfers and holds`.
- **Never add AI attribution lines to commits.**
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Bootstrap a test file from the exemplar

Copy the setup (DB init, category/group creation, month constants) from
`src/core/domain/budgets/__tests__/getBudgetMonth.test.ts` into
`transfers.test.ts`. Create two expense categories A and B and one month
(e.g. "2026-07"). Seed A with a budgeted amount via `setBudgetAmount`.

**Verify**: `npx vitest run src/core/domain/budgets/__tests__/transfers.test.ts` → setup test passes.

### Step 2: setBudgetAmount + transferAvailable characterization

Cases:

1. `setBudgetAmount(month, A, 5000)` → read back budgeted(A) === 5000;
   calling again with 3000 overwrites (absolute, not additive).
2. `transferAvailable(month, A, 2000)` → budgeted(A) increases by exactly 2000
   (additive).
3. `transferAvailable(month, A, -2000)` → decreases by 2000.
4. Amounts are integer cents: pass 2599 and read back 2599 (no rounding).

**Verify**: file passes.

### Step 3: transferMultipleCategories + transferBetweenCategories

Cases:

1. `transferMultipleCategories(month, B, [{categoryId: A, amountCents: 1500, name: "A"}], "to", "B")`
   → budgeted(A) -1500, budgeted(B) +1500 (verify the actual direction
   semantics by reading the function first — if "to" means the opposite,
   assert what the code DOES and note it in a comment).
2. Two sources in one call → both applied, sum conserved
   (Σ budgeted before === Σ budgeted after).
3. `transferBetweenCategories` — one happy-path case mirroring its signature
   (read the function at line 486 for the exact parameter order).

**Verify**: file passes.

### Step 4: Undo grouping

Preferred: call the undo API (from `src/core/sync/undo`) after a
`transferMultipleCategories` with two sources and assert both categories
revert in ONE undo step. If the undo API cannot be driven from a unit test
(e.g. it needs UI stores), fallback: spy on `sendMessages` /
`appendMessages` and assert a single grouped batch was recorded for the
multi-source call. Document which route you took in a comment.

**Verify**: file passes.

### Step 5: holdForNextMonth / resetHold / setCategoryCarryover

One happy-path case each: hold N cents → read back the hold/buffered value
for the month (find the read binding in the same file, e.g. a `buffered`
sheet/DB field); `resetHold` clears it; `setCategoryCarryover(month, A, true)`
→ carryover flag readable (see `catCarryover` usage in
`src/screens/budget/hooks/useOverspentCategories.ts` for how it's read).

**Verify**: `npx vitest run src/core/domain/budgets` → all pass.

### Step 6: Full pass

**Verify**: `npx vitest run` → no new failures. `npm run lint` → exit 0.

## Test plan

This plan IS the test plan: ≥12 new assertions across
setBudgetAmount, transferAvailable (±), transferMultipleCategories (single,
multi, conservation), transferBetweenCategories, undo grouping, holds,
carryover. Structure modeled on `getBudgetMonth.test.ts`.

## Done criteria

- [ ] `npx vitest run src/core/domain/budgets` → ≥12 new tests, all pass
- [ ] `grep -c "transferAvailable\|transferMultipleCategories\|holdForNextMonth" src/core/domain/budgets/__tests__/*.test.ts` → > 0
- [ ] No production files modified (`git status` shows only new/changed files under `__tests__/`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The test-DB harness cannot execute `undoable` functions (e.g. they require
  a clock/bootstrap the harness doesn't provide and `getBudgetMonth.test.ts`
  doesn't show how) — report what's missing.
- A characterization test reveals behavior that looks like a genuine bug
  (e.g. money not conserved in a transfer): write the test pinning ACTUAL
  behavior with a `// BUG?:` comment, and list it in your final report — do
  not "fix" the production code.

## Maintenance notes

- These tests pin CURRENT behavior. If a future change intentionally alters
  semantics (e.g. tracking-budget write-path work — see plans/README.md
  direction notes), update the assertions deliberately, in the same PR.
- Reviewer: check the direction semantics ("to"/"from") comments match what
  the screens assume (`CoverSourceScreen` passes "to";
  `app/(auth)/budget/move-money.tsx:294-322` shows both).
