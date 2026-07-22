# Plan 005: Stop split rows from spawning transfer mirrors (one mirror per child bug)

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
- **Effort**: M
- **Risk**: MED — touches the transfer path; legitimate simple transfers must keep working
- **Depends on**: plans/002-transactions-characterization-tests.md (flips its "KNOWN BUG (plan 005)" pin)
- **Category**: bug
- **Planned at**: commit `cab6621`, 2026-07-19

## Why this matters

`addTransaction` (`src/core/domain/transactions/index.ts:64-113`) unconditionally
runs the transfer `onInsert` hook after inserting. `saveTransaction`'s split paths
(`save.ts:108-174`) create the parent AND every child with the **same resolved
payee**. If that payee is a transfer payee (`payees.transfer_acct` set), a 3-line
split creates **4 mirror transactions** in the destination account (parent + 3
children) instead of at most one — corrupting both account balances and the
transfer-pairing invariant. Upstream Actual treats splits and transfers as
mutually exclusive and suppresses the hook for child rows.

## Current state

- `src/core/domain/transactions/index.ts:102-110` — after sending the insert
  messages, `addTransaction` calls:

```ts
// Transfer hook: if payee is a transfer payee, create the paired transaction
await onInsert({
  id,
  acct: fields.account,
  amount: fields.amount,
  date: fields.date,
  description: fields.payee ?? null,
  notes: fields.notes ?? null,
});
```

Note `fields.is_parent` / `fields.is_child` are available in scope but not consulted.

- `src/core/domain/transactions/transfer.ts:77-158` — `onInsert` creates the
  mirror + back-link when `getTransferAccount(txn.description)` is non-null.
- `src/core/domain/transactions/transfer.ts:189` — `onUpdate` handles the four
  transfer state transitions on edit; `updateTransaction` (`index.ts:134`) calls
  it with the prev row. The prev row includes `isParent`/`isChild` columns in the
  DB (`isParent`, `isChild` INTEGER) — check what `prev` actually selects
  (`SELECT * FROM transactions ...`, `index.ts:139-142`), so the flags ARE available.
- `src/core/domain/transactions/save.ts:144-174` — split-new: parent created with
  `is_parent: true`, children with `is_child: true`, all with `payee: resolvedPayeeId`.
- Regression pin to flip: plan 002's transfer.test.ts test named
  `"KNOWN BUG (plan 005): split with transfer payee creates a mirror per child"`.

## Commands you will need

| Purpose   | Command                                       | Expected on success |
| --------- | --------------------------------------------- | ------------------- |
| Typecheck | `npx tsc --noEmit`                            | exit 0              |
| Focused   | `npx vitest run src/core/domain/transactions` | all pass            |
| All tests | `npx vitest run`                              | 0 failures          |

## Scope

**In scope**:

- `src/core/domain/transactions/index.ts` — guard the hooks
- `src/core/domain/transactions/save.ts` — only if a save-boundary validation is added (Step 3)
- `src/core/domain/transactions/__tests__/transfer.test.ts` — flip/extend pins

**Out of scope** (do NOT touch):

- `src/core/domain/transactions/transfer.ts` — the hook logic itself is correct
  for simple transactions; the guard belongs at the call sites.
- UI screens (payee pickers) — a UI-side restriction is a separate product
  decision; note it in Maintenance instead.

## Git workflow

- Conventional commit, e.g. `fix(transactions): suppress transfer hook on split parent/child rows`.
- **Never add AI-attribution or Co-Authored-By lines.** Do NOT push unless instructed.

## Steps

### Step 1: Guard `onInsert` in `addTransaction`

In `index.ts`, skip the transfer hook for split rows:

```ts
  if (!fields.is_parent && !fields.is_child) {
    await onInsert({ ... });
  }
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Guard `onUpdate` in `updateTransaction`

`updateTransaction` fetches `prev` via `SELECT * ...` (`index.ts:139-142`), so
guard the `onUpdate` call with the DB flags AND the incoming fields:

```ts
  const isSplitRow =
    prev?.isParent === 1 || prev?.isChild === 1 || fields.is_parent || fields.is_child;
  if (prev && !isSplitRow) {
    await onUpdate(...);
  }
```

(Without this, editing a child's payee to a transfer payee would re-open the same bug.)

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Flip and extend tests

In plan 002's `transfer.test.ts`:

- Flip the "KNOWN BUG (plan 005)" pin: a split-new with a transfer payee now
  creates **zero** mirror transactions (count rows in the destination account).
- Add: split-EDIT with transfer payee → zero new mirrors.
- Add: editing a child row's amount → no `onUpdate` mirror side effects.
- Keep green: all existing simple-transfer lifecycle tests (create/edit/delete
  mirror behavior unchanged).

**Verify**: `npx vitest run src/core/domain/transactions` → all pass.

### Step 4: Full-suite regression

**Verify**: `npx vitest run` → 0 failures.

## Test plan

Step 3 is the test plan. Structural exemplar: the plan-002 transfer tests
themselves.

## Done criteria

- [ ] `npx vitest run` exits 0; no test named "KNOWN BUG (plan 005)" remains
- [ ] A test asserts a split with a transfer payee creates 0 mirrors, and it passes
- [ ] Simple (non-split) transfer create/update/delete tests all still pass
- [ ] `npx tsc --noEmit` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- Plan 002's tests don't exist yet — STOP; this plan flips its pins.
- `prev` in `updateTransaction` turns out NOT to include `isParent`/`isChild`
  (the excerpt says `SELECT *`, so it should) — STOP and report instead of adding
  a second query.
- Suppressing the hook breaks an existing test about parent-level transfers —
  that would mean some flow intentionally relies on parent mirroring; report it.

## Maintenance notes

- Product-level question deferred: should the payee picker in the split UI hide
  transfer payees entirely? This plan makes the core safe regardless; a UI
  restriction would improve UX but is a separate decision.
- Reviewers: scrutinize Step 2's guard — it must not skip `onUpdate` for a
  NORMAL row whose edit doesn't touch split flags (`fields.is_parent` undefined
  is falsy — correct).
