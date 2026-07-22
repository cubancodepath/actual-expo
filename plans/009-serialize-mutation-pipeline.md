# Plan 009: Serialize the mutation pipeline so concurrent flows can't share a batch/undo scope

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cab6621..HEAD -- src/core/sync/batch.ts src/core/sync/undo.ts src/core/sync/apply.ts`
> If any changed since this plan was written, compare the "Current state"
> excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED — touches the central mutation path; every write flows through it
- **Depends on**: plans/002-transactions-characterization-tests.md AND plans/003-undo-tests.md (both must be DONE — they are the safety net), plans/004-make-split-and-move-undoable.md (lands first to avoid rebase churn)
- **Category**: bug (concurrency)
- **Planned at**: commit `cab6621`, 2026-07-19

## Why this matters

The batching and undo layers use **module-global mutable flags**
(`_isBatching`/`_batched` in `batch.ts:19-20`, `_undoListening`/`_undoDisabled`
in `undo.ts:45-48`). This app runs mutations from several concurrent async
sources: the 60-second sync poll (which posts scheduled transactions via
`advanceSchedules`), foreground-triggered `fullSync`, the fire-and-forget
`savePayeeLocationIfEnabled` (`save.ts:207`), and user taps. If flow B calls
`sendMessages` while flow A's `batchMessages` body is suspended at an await,
B's messages are **silently swept into A's batch** — applied together, undone
together, attributed to the wrong logical operation. Concurrent `undoable`
scopes similarly interleave their flags. Upstream Actual serializes all mutators
(`runMutator`); this port lost that. The fix: one FIFO queue for all top-level
mutation entry points, using the `sequential()` helper the codebase already has.

## Current state

- `src/core/sync/batch.ts:19-20`: `let _isBatching = false; let _batched: SyncMessage[] = [];`
- `src/core/sync/batch.ts:69-72` (`sendMessages`): `if (_isBatching) { _batched = _batched.concat(messages); return; }`
- `src/core/sync/batch.ts:76-100` (`batchMessages`): re-entrancy guard
  `if (_isBatching) { await fn(); return; }`, then sets `_isBatching = true`,
  runs `fn`, flushes after. **Re-entrancy within one flow is by-design and must
  keep working** — only cross-flow interleaving is the bug.
- `src/core/sync/undo.ts:91-118` (`undoable`): nested-call pass-through via
  `if (_undoDisabled || _undoListening) return fn(...args);`, otherwise sets
  `_undoListening = true` for the duration.
- `src/core/sync/apply.ts` — `applyMessages` is already wrapped in `sequential()`
  (grep `sequential` in `src/core/sync/` to find the helper's import path). That
  helper is the queue primitive to reuse.
- Concurrent producers (evidence): `src/core/sync/fullSync.ts` (poll +
  foreground), schedule advancement after sync, `save.ts:207`
  `savePayeeLocationIfEnabled` (fire-and-forget `createPayeeLocation`).
- Safety net: plan 002 characterization tests, plan 003 undo tests, existing
  `src/core/sync/__tests__/batch.test.ts`.

## Commands you will need

| Purpose   | Command                        | Expected on success |
| --------- | ------------------------------ | ------------------- |
| Typecheck | `npx tsc --noEmit`             | exit 0              |
| All tests | `npx vitest run`               | 0 failures          |
| Focused   | `npx vitest run src/core/sync` | all pass            |

## Scope

**In scope**:

- `src/core/sync/batch.ts` — add the mutator queue
- `src/core/sync/undo.ts` — only if flag handling must move inside the queue wrapper
- `src/core/sync/__tests__/mutatorQueue.test.ts` (create)
- `src/core/sync/index.ts` — export changes if the public entry point moves

**Out of scope** (do NOT touch):

- Call sites across `src/core/domain/**` — the queue must be transparent to
  them (same exported function names/signatures). If you find yourself editing
  domain files, the design is wrong; STOP.
- `applyMessages`/`apply.ts` — already serialized.
- Any UI file.

## Git workflow

- Conventional commit, e.g. `fix(sync): serialize top-level mutations through a FIFO queue`.
- **Never add AI-attribution or Co-Authored-By lines.** Do NOT push unless instructed.

## Steps

### Step 1: Understand `sequential()`

Read the existing `sequential` helper (find it: `grep -rn "function sequential" src/`).
Confirm it queues invocations FIFO and propagates errors per-invocation without
poisoning the queue. Write down (in the PR description) its error semantics.

**Verify**: you can state what happens to call #2 when call #1 rejects (from the
helper's code, not assumption).

### Step 2: Introduce `runMutator`

In `batch.ts`, create an internal FIFO gate:

```ts
const runMutator = sequential(async function runMutator<T>(fn: () => Promise<T>): Promise<T> {
  return fn();
});
```

Key design rule: **top-level** entry points acquire the queue; **nested** calls
(already inside the queue) must run inline — mirror the existing `_isBatching`
re-entrancy pattern with an `_inMutator` module flag that is only ever
set/cleared inside the queued execution (single-threaded JS makes the flag safe
once entry is serialized).

### Step 3: Route the two top-level entry points through it

- `batchMessages(fn)`: if `_inMutator`, keep today's exact behavior (nested →
  run `fn` inline). Otherwise enqueue the WHOLE current body (guard set, fn,
  flush) as one queued unit.
- `sendMessages(messages)`: if `_inMutator` (i.e. called from inside a queued
  batch/mutation), keep today's buffer-or-apply behavior. Otherwise enqueue
  `_applyAndRecord(messages)` as one unit.
- `undoable(fn)` (in `undo.ts`): wrap the non-nested branch so flag set + fn +
  flag clear execute as one queued unit too — simplest correct form: make
  `undoable`'s outermost invocation call `runMutator(() => <today's body>)`.
  `undo()` itself (undo.ts:124) is also a top-level mutator — queue it.

**Verify**: `npx tsc --noEmit` → exit 0; `npx vitest run src/core/sync` → all pass
(existing batch/undo semantics unchanged for sequential callers).

### Step 4: Interleaving tests

`src/core/sync/__tests__/mutatorQueue.test.ts`:

1. **The bug**: start `batchMessages(A)` whose body awaits a deferred promise;
   while suspended, fire `sendMessages(B)` (not awaited-chained to A). Resolve A.
   Assert B's messages did NOT apply inside A's batch (B applied separately —
   check via "applied" events or undo grouping). Before this plan, this test fails.
2. Two concurrent `batchMessages` calls → both apply, in FIFO order, each its
   own "applied" event.
3. Concurrent `undoable` mutations → two distinct undo groups; two `undo()`
   calls restore both, most-recent first.
4. A rejecting queued mutation does not block the next one.

**Verify**: `npx vitest run src/core/sync/__tests__/mutatorQueue.test.ts` → all pass.

### Step 5: Full regression

**Verify**: `npx vitest run` → 0 failures; `npx tsc --noEmit` → exit 0;
`npm run lint` → exit 0.

## Test plan

Step 4 (4+ tests) plus the entire existing suite — plans 002/003 tests are the
real gate here.

## Done criteria

- [ ] All 4 interleaving tests pass; test 1 demonstrably fails when Steps 2–3 are reverted (state this in the PR)
- [ ] `npx vitest run` exits 0 (including plans 002/003 suites)
- [ ] `git status` shows no files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

- Plans 002 or 003 are not DONE — STOP; do not attempt this without the net.
- `sequential()`'s error semantics poison the queue (Step 1 finding) — report;
  a queue fix is a scope change.
- Queueing `undo()` deadlocks because some UI flow calls a mutator from inside
  another mutator's callback — report the exact cycle; do not add timeouts.
- Any deadlock or test timeout in the suite after Step 3 — revert and report
  which caller re-enters.

## Maintenance notes

- New top-level mutation entry points MUST route through `runMutator` — add a
  comment at the top of `batch.ts` saying so; reviewers should enforce it.
- This intentionally serializes ALL mutations (matching upstream). If a future
  profiler shows queue latency on user taps during sync, the fix is prioritized
  scheduling, not removing the queue.
