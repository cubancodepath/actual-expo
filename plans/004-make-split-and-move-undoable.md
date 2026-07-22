# Plan 004: Make split saves and moveTransaction undoable

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cab6621..HEAD -- src/core/domain/transactions/save.ts src/core/domain/transactions/index.ts src/core/sync/undo.ts src/core/sync/batch.ts`
> If any changed since this plan was written, compare the "Current state"
> excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/003-undo-tests.md (its Step-5 "KNOWN BUG" test gets flipped here)
- **Category**: bug
- **Planned at**: commit `cab6621`, 2026-07-19

## Why this matters

Creating a split, editing a split, and moving a transaction between accounts
currently produce **no undo entry**, while simple transactions do. The cause: the
undo recorder (`appendMessages`, `src/core/sync/undo.ts:76`) only records while
`_undoListening` is true, i.e. inside an `undoable()` scope. Split saves and
`moveTransaction` wrap their inner `undoable` calls (`addTransaction`,
`updateTransaction`) in `batchMessages`, whose buffered messages are flushed via
`_applyAndRecord` **after** the batch body — and every inner `undoable` scope —
has exited. `_undoListening` is false at flush time, so the whole batch is
silently discarded from undo history. For a money app, a mis-entered split the
user cannot undo is a real data-loss papercut.

## Current state

- `src/core/sync/batch.ts:76-100` — `batchMessages(fn)`: sets `_isBatching`,
  runs `fn` (inner `sendMessages` calls buffer), then AFTER the try/finally
  flushes via `await _applyAndRecord(batched)`.
- `src/core/sync/undo.ts:91-118` — `undoable(fn)`: sets `_undoListening = true`
  only for the duration of `fn`; nested `undoable` calls are pass-through.
- `src/core/domain/transactions/save.ts:110` and `:147` — the split-edit and
  split-new paths call `await batchMessages(async () => { ...updateTransaction/
addTransaction/deleteTransaction... })`; `saveTransaction` itself is a plain
  async export (line 60), NOT wrapped in `undoable`.
- `src/core/domain/transactions/index.ts:219-234` — `moveTransaction` is a plain
  async export using `batchMessages`; compare `toggleCleared` (line 237) and
  `reconcileAccount` (line 338) which ARE `undoable(...)`-wrapped and therefore work.
- Regression pin that must flip: the test added by plan 003 Step 5 (in
  `src/core/sync/__tests__/undo.test.ts`) currently asserts `canUndo() === false`
  after a batched undoable mutation.

## Commands you will need

| Purpose   | Command                                                                            | Expected on success |
| --------- | ---------------------------------------------------------------------------------- | ------------------- |
| Typecheck | `npx tsc --noEmit`                                                                 | exit 0              |
| All tests | `npx vitest run`                                                                   | 0 failures          |
| Focused   | `npx vitest run src/core/sync/__tests__/undo.test.ts src/core/domain/transactions` | all pass            |

## Scope

**In scope**:

- `src/core/domain/transactions/save.ts` — wrap `saveTransaction` in `undoable`
- `src/core/domain/transactions/index.ts` — wrap `moveTransaction` in `undoable`
- `src/core/sync/__tests__/undo.test.ts` — flip the plan-003 known-bug pin
- `src/core/domain/transactions/__tests__/*` — update any plan-002 pins affected

**Out of scope** (do NOT touch):

- `src/core/sync/batch.ts` and `src/core/sync/undo.ts` internals — the fix is at
  the call sites, not by making `batchMessages` capture undo unconditionally
  (that would record NON-undoable flows like schedule advancement into history).
- Other non-undoable mutations you may notice (e.g. in other domains) — note
  them in your report instead.

## Git workflow

- Branch `develop` or short-lived branch. Conventional commit, e.g.
  `fix(transactions): record split saves and moves in undo history`.
- **Never add AI-attribution or Co-Authored-By lines.** Do NOT push unless instructed.

## Steps

### Step 1: Wrap `saveTransaction`

In `save.ts`, change the export to the same pattern used by `addTransaction`
(`index.ts:64`):

```ts
export const saveTransaction = undoable(async function saveTransaction(
  input: SaveTransactionInput,
  rules?: Rule[],
): Promise<string> { ... });
```

Import `undoable` from the same module the other wrappers use (see the import in
`index.ts`). Because `undoable` no-ops when nested, the inner
`addTransaction`/`updateTransaction` wrappers remain harmless, and the whole save
(including the batch flush) now happens inside one listening scope = one undo group.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Wrap `moveTransaction`

Same transformation in `index.ts:219`.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Flip the regression pins

In `src/core/sync/__tests__/undo.test.ts`, the plan-003 Step-5 test now expects
`canUndo() === true` after a batched-undoable flow, and one `undo()` reverses the
ENTIRE batch (all rows back to prior state). Rename it to drop the "KNOWN BUG"
prefix. Add one new test at the domain level: save a split (parent + 2 children)
→ `undo()` → parent and children are tombstoned/restored in one step.

**Verify**: `npx vitest run src/core/sync/__tests__/undo.test.ts src/core/domain/transactions` → all pass.

### Step 4: Full-suite regression

**Verify**: `npx vitest run` → 0 failures.

## Test plan

- Flipped pin + new split-undo test (Step 3). Model on the existing
  `undo.test.ts` structure from plan 003.
- Edge to cover: `saveTransaction` split-EDIT path → single `undo()` restores
  the old children (they were tombstoned + recreated).

## Done criteria

- [ ] `grep -n "export const saveTransaction = undoable" src/core/domain/transactions/save.ts` → 1 match
- [ ] `grep -n "export const moveTransaction = undoable" src/core/domain/transactions/index.ts` → 1 match
- [ ] `npx vitest run` exits 0; no test named "KNOWN BUG (plan 004)" remains
- [ ] `npx tsc --noEmit` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- Wrapping causes a circular import between `save.ts`/`index.ts` and
  `sync/undo.ts` — report the cycle; do not restructure modules to break it.
- After Step 1, `undo()` of a split reverses only PART of the batch — that
  indicates an ordering issue inside `_applyAndRecord`; report, don't patch batch.ts.
- Plan 003's tests are absent (003 not executed yet) — STOP; this plan depends on them.

## Maintenance notes

- Any future mutation that uses `batchMessages` at the top level must ALSO be
  `undoable`-wrapped if users can trigger it directly — reviewers should check
  this on new domain mutations. Plan 009 (serialization) may later replace this
  convention with an explicit mutator context; these wrappers stay correct under it.
