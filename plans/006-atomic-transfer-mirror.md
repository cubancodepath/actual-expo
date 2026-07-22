# Plan 006: Make transfer mirror creation + back-link atomic (single batch)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cab6621..HEAD -- src/core/domain/transactions/transfer.ts src/core/sync/batch.ts`
> If either changed since this plan was written, compare the "Current state"
> excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/002-transactions-characterization-tests.md (recommended — its transfer tests guard this)
- **Category**: bug
- **Planned at**: commit `cab6621`, 2026-07-19

## Why this matters

`onInsert` in `src/core/domain/transactions/transfer.ts` creates a transfer in
**three separate applies**: one `sendMessages` for the mirror row (which already
contains `transferred_id = original`), a second `sendMessages` to back-link the
original (`transferred_id = mirror`), and a third inside `clearCategoryIfNeeded`.
Each `sendMessages` outside a batch is its own DB transaction. A crash, app kill,
or budget switch between them (budget-switch mid-flight is an anticipated
condition elsewhere in the sync code) leaves a half-linked transfer: the mirror
points back, but the original has no `transferred_id` — so deleting/editing the
original never cleans up the mirror, leaving dangling money in the other account.

## Current state

- `src/core/domain/transactions/transfer.ts:94-157` (`onInsert`):

```ts
  // Create the mirror transaction in the destination account
  await sendMessages([ /* 7 messages for pairedId, incl. transferred_id: txn.id */ ]);

  // Link the original transaction to the paired one
  await sendMessages([
    { ..., row: txn.id, column: "transferred_id", value: pairedId },
  ]);

  await clearCategoryIfNeeded(txn.acct, toAccountId, txn.id, pairedId);
```

- `clearCategoryIfNeeded` (`transfer.ts:37-67`) does two reads then possibly one
  more `sendMessages`.
- `src/core/sync/batch.ts:76-100` — `batchMessages(fn)` is re-entrant-safe: when
  called inside an outer batch it just runs `fn` (messages buffer into the outer
  batch). So wrapping here is safe even when `onInsert` runs inside
  `saveTransaction`'s batched split paths.
- `onUpdate`'s "was and still is a transfer" branch (`transfer.ts:245-288`) has
  the same shape (mirror-update `sendMessages` + `clearCategoryIfNeeded`) —
  include it. `onDelete` (`transfer.ts:163-180`) is a single `sendMessages` —
  already atomic, leave it.

## Commands you will need

| Purpose   | Command                                       | Expected on success |
| --------- | --------------------------------------------- | ------------------- |
| Typecheck | `npx tsc --noEmit`                            | exit 0              |
| Focused   | `npx vitest run src/core/domain/transactions` | all pass            |
| All tests | `npx vitest run`                              | 0 failures          |

## Scope

**In scope**:

- `src/core/domain/transactions/transfer.ts`
- `src/core/domain/transactions/__tests__/transfer.test.ts` (extend)

**Out of scope** (do NOT touch):

- `src/core/sync/batch.ts` — its re-entrancy contract is what makes this fix safe.
- `onDelete` — already a single apply.
- The message contents themselves (columns/values stay identical).

## Git workflow

- Conventional commit, e.g. `fix(transactions): create transfer mirror and back-link atomically`.
- **Never add AI-attribution or Co-Authored-By lines.** Do NOT push unless instructed.

## Steps

### Step 1: Wrap `onInsert`'s writes in one batch

Import `batchMessages` from `@/core/sync` (same import style as `save.ts:10`)
and wrap from the mirror `sendMessages` through `clearCategoryIfNeeded`:

```ts
await batchMessages(async () => {
  await sendMessages([
    /* mirror messages, unchanged */
  ]);
  await sendMessages([
    /* back-link message, unchanged */
  ]);
  await clearCategoryIfNeeded(txn.acct, toAccountId, txn.id, pairedId);
});
```

The two `getTransfer*` reads before this stay outside the batch.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Same for `onUpdate`'s update branch

Wrap the mirror-update `sendMessages` + `clearCategoryIfNeeded` pair
(`transfer.ts:249-287`) in one `batchMessages`. Also wrap the
"no longer a transfer" branch's `onDelete` + back-link-clear pair
(`transfer.ts:227-242`) — it has the same two-apply shape.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Test atomicity via message grouping

In plan 002's `transfer.test.ts`, add a test that spies on / counts applies:
simplest observable — after `addTransaction` with a transfer payee (outside any
outer batch), the CRDT messages for mirror + back-link + category-clear share a
single apply (e.g. assert via a `listen()` subscriber from
`src/core/sync/syncEvents` that exactly ONE "applied" event containing dataset
`transactions` fires for the whole hook, where before there were 2–3).

**Verify**: `npx vitest run src/core/domain/transactions` → all pass.

### Step 4: Full-suite regression

**Verify**: `npx vitest run` → 0 failures. Pay attention to
`src/core/sync/__tests__/batch.test.ts` and plan-003/004 undo tests — undo
grouping of transfers may now consolidate (one undo entry instead of several);
if an undo test counts entries, update it to the new (correct) grouping and note
it in the commit message.

## Test plan

Step 3, plus keep all existing transfer lifecycle tests green. Exemplar for the
event-listening pattern: `src/core/sync/__tests__/batch.test.ts`.

## Done criteria

- [ ] `grep -c "batchMessages" src/core/domain/transactions/transfer.ts` → ≥ 3 (import + 2–3 wraps)
- [ ] New atomicity test passes; all transfer lifecycle tests pass
- [ ] `npx vitest run` exits 0; `npx tsc --noEmit` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- Wrapping causes a circular import between `transfer.ts` and `@/core/sync` —
  check how `save.ts` imports `batchMessages` first; if the cycle is real, STOP.
- The single-event assertion in Step 3 is impossible because `syncEvents.listen`
  isn't reachable from tests — pick the alternative: assert all messages share
  one undo history entry. If neither works, STOP and describe what's observable.

## Maintenance notes

- After plan 004, transfers triggered from `saveTransaction` are one undoable
  group; this plan makes the standalone `addTransaction`-transfer path atomic
  too. Reviewers: confirm no message content changed — only grouping.
