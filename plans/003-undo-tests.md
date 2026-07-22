# Plan 003: Tests for the undo system (history, markers, reversal, disable-flag)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cab6621..HEAD -- src/core/sync/undo.ts src/core/sync/batch.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (additive)
- **Depends on**: none (002 recommended first for shared familiarity, not required)
- **Category**: tests
- **Planned at**: commit `cab6621`, 2026-07-19

## Why this matters

`src/core/sync/undo.ts` (226 lines) reverses committed CRDT mutations by
generating inverse messages from pre-mutation snapshots — a bug here silently
mutates the wrong row or amount, and it is entirely untested (`grep -rl undo
src/core/sync/__tests__/` → nothing). Plans 004 (make split/move undoable) and
009 (serialize the mutation pipeline) change undo-adjacent behavior; this plan
must land first so those changes are verifiable.

## Current state

- `src/core/sync/undo.ts` — module-level state:
  - `HISTORY: HistoryEntry[]` (markers + message entries), `CURSOR`, `HISTORY_SIZE = 20` (lines 40-42)
  - `_undoListening` / `_undoDisabled` flags (lines 45-48)
  - `appendMessages(messages, oldData)` (line 76): records only `if (_undoListening && !_undoDisabled && messages.length > 0)`
  - `undoable(fn)` (line 91): places a marker, sets `_undoListening = true` around `fn`, no-ops when already listening (nested)
  - `undo()` (line 124): walks back to nearest marker, builds reversed messages via `undoMessage()`, applies with `_undoDisabled = true`
  - `undoMessage()` (line 194): row existed → restore old value; row created → tombstone (with special cases: `category_mapping`/`payee_mapping` → null, `zero_budget*` → 0 for `buffered|amount|carryover`, `notes` → null)
- `src/core/sync/batch.ts:112-124` — `_applyAndRecord`: `applyMessages` returns `oldData`; `undoAppendMessages(messages, oldData)` is called right after. `sendMessages` during a batch only buffers (`batch.ts:69-72`); the flush happens after the batch body completes.
- **Known bug — characterize, don't fix** (plan 004 fixes it): a `batchMessages`
  wrapper whose inner calls are `undoable` records nothing, because by flush time
  every `undoable` scope has exited and `_undoListening` is false.
- No redo exists (documented in the file header) — do not test redo.
- Test infra: `src/core/db/__tests__/testDb.ts` (better-sqlite3 in-memory DB + schema + clock); exemplar test driving real mutations: `src/core/sync/__tests__/batch.test.ts` and `src/core/domain/budgets/__tests__/transfers.test.ts`.

## Commands you will need

| Purpose   | Command                                               | Expected on success |
| --------- | ----------------------------------------------------- | ------------------- |
| Install   | `pnpm install`                                        | exit 0              |
| Typecheck | `npx tsc --noEmit`                                    | exit 0              |
| All tests | `npx vitest run`                                      | 0 failures          |
| New tests | `npx vitest run src/core/sync/__tests__/undo.test.ts` | all pass            |

## Scope

**In scope**:

- `src/core/sync/__tests__/undo.test.ts` (create)

**Out of scope** (do NOT touch):

- `src/core/sync/undo.ts`, `batch.ts` production code — if a test needs a reset
  hook that doesn't exist (e.g. clearing HISTORY between tests), use the exported
  `clearUndo()`; if that's insufficient, STOP and report rather than adding exports.
- `src/stores/undoStore.ts` — UI wiring, out of scope.

## Git workflow

- Branch: `develop` or short-lived branch. Conventional commit, e.g.
  `test(sync): undo history and reversal tests`.
- **Never add AI-attribution or Co-Authored-By lines.** Do NOT push unless instructed.

## Steps

### Step 1: Basic round-trip

With a real test DB: `undoable`-wrapped mutation updates a row via
`sendMessages` → `undo()` → the row's DB value equals the pre-mutation value, and
the undo generated NEW CRDT messages (fresh timestamps in `messages_crdt`), not a
log rollback.

**Verify**: `npx vitest run src/core/sync/__tests__/undo.test.ts` → pass.

### Step 2: Creation reversal

`undoable` mutation that creates a row (no oldData) → `undo()` tombstones it.
Also cover the special datasets: `notes` reverts to null; `zero_budgets.amount`
reverts to 0; `category_mapping` creation is NOT reversed.

### Step 3: Markers and grouping

Two sequential `undoable` operations → first `undo()` reverses only the second;
second `undo()` reverses the first. `canUndo()` transitions true→false at the
bottom. Nested `undoable` inside `undoable` forms ONE group.

### Step 4: Disable-flag and no-recording paths

`undo()` itself must not be recorded (call `undo()` then `canUndo()` reflects
one fewer group, and HISTORY did not grow). A mutation with `messages.length === 0`
records nothing. History trimming: >20 marker groups → oldest dropped, undo
still works at the boundary.

### Step 5: Pin the known batch bug

Test named `"KNOWN BUG (plan 004): batchMessages flush after undoable scopes exits records no undo entry"`:
run a `batchMessages` whose body calls an `undoable` mutation → assert
`canUndo()` is **false** (current behavior). Plan 004 will flip this expectation.

### Step 6: Full-suite regression

**Verify**: `npx vitest run` → 0 failures; `npx tsc --noEmit` → exit 0.

## Test plan

Steps 1–5 above are the test list (~10–14 tests), modeled on
`src/core/sync/__tests__/batch.test.ts`. Use `clearUndo()` in `beforeEach`.

## Done criteria

- [ ] `src/core/sync/__tests__/undo.test.ts` exists; `npx vitest run` exits 0 with new tests included
- [ ] The known-bug pin from Step 5 exists and passes (asserting current broken behavior)
- [ ] `git status` shows only the new test file
- [ ] `plans/README.md` status row updated

## STOP conditions

- `clearUndo()` is insufficient to isolate tests (state leaks between tests) —
  report the missing seam instead of editing `undo.ts`.
- Step 1 fails because `undo()` does not restore the value — that would be a live
  correctness bug beyond the known one; report it, do not fix.

## Maintenance notes

- Plan 004 flips the Step 5 expectation. Plan 009 (mutation serialization) must
  keep this whole suite green.
- If redo is ever added, extend Steps 3–4 with cursor-forward cases.
