# Plan 011: Coalesce liveQuery/pagedQuery re-runs (microtask debounce per instance)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cab6621..HEAD -- src/core/queries/liveQuery.ts src/core/queries/pagedQuery.ts`
> If either changed since this plan was written, compare the "Current state"
> excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — must not break optimistic updates or the stale-response guards
- **Depends on**: plans/010-livequery-initial-dependencies.md (same code region; land 010 first)
- **Category**: perf
- **Planned at**: commit `cab6621`, 2026-07-19

## Why this matters

Every "applied" sync event whose tables intersect a live query's dependencies
triggers an immediate full re-run — with no coalescing. A burst of mutations
(split save = several applies; sync batch; undo) re-executes each affected query
multiple times in quick succession. `pagedQuery.run()` is worse: it reloads
`Math.max(data.length, pageCount)` rows **plus** a separate `executeCount` per
invalidation, so a user scrolled deep in a big ledger pays a large re-read per
event in the burst. Coalescing to one run per burst (short debounce) keeps
results identical while cutting redundant SQL work on the device.

## Current state

- `src/core/queries/liveQuery.ts:50-56`:

```ts
const unlisten = listen((event) => {
  if (isUnsubscribed) return;
  const tables = new Set(event.tables);
  if (dependencies.some((d) => tables.has(d))) {
    run();
  }
});
```

- `run()` already has a stale-response guard: `const currentId = ++inflightId;`
  … `if (inflightId !== currentId || isUnsubscribed) return;` — later calls win.
- `optimisticUpdate(fn)` (liveQuery.ts:~81) bumps `inflightId` so in-flight runs
  don't clobber optimistic data — the coalescer must not delay or drop the
  authoritative re-run that follows an optimistic update.
- `src/core/queries/pagedQuery.ts:69-96` — identical listener; `run()` does
  `Promise.all([executeQuery(query.limit(limit)), executeCount(query)])`.
- Event source: `src/core/sync/batch.ts:122` emits one "applied" event per
  apply; bursts come from several applies in one user action (e.g. transfer =
  mirror + back-link before plan 006; undo of a group; fullSync apply).

## Commands you will need

| Purpose   | Command                           | Expected on success |
| --------- | --------------------------------- | ------------------- |
| Typecheck | `npx tsc --noEmit`                | exit 0              |
| Focused   | `npx vitest run src/core/queries` | all pass            |
| All tests | `npx vitest run`                  | 0 failures          |

## Scope

**In scope**:

- `src/core/queries/liveQuery.ts`
- `src/core/queries/pagedQuery.ts`
- Tests under `src/core/queries/__tests__/`

**Out of scope** (do NOT touch):

- `src/core/sync/batch.ts` / event emission — coalescing lives on the consumer side.
- Row-level/filter-aware invalidation — explicitly rejected for now (cost
  unknown; see plans/README.md "considered and rejected").
- The TanStack `useTransactions` refetch path — that's plan 012.

## Git workflow

- Conventional commit, e.g. `perf(queries): coalesce live-query re-runs per event burst`.
- **Never add AI-attribution or Co-Authored-By lines.** Do NOT push unless instructed.

## Steps

### Step 1: Add a per-instance scheduler

In `liveQuery.ts`, replace the direct `run()` in the listener with
`scheduleRun()`:

```ts
let runScheduled = false;
function scheduleRun() {
  if (runScheduled || isUnsubscribed) return;
  runScheduled = true;
  setTimeout(() => {
    runScheduled = false;
    run();
  }, 0);
}
```

`setTimeout(0)` (not `queueMicrotask`) so all applies flushed in the same JS
task collapse into one run. The initial auto-start `run()` stays direct
(first paint must not wait a tick).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Same in `pagedQuery.ts`

Identical scheduler; `fetchNext` (user pagination) stays direct.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Tests

In `src/core/queries/__tests__/` (extend or create `coalescing.test.ts`):

1. Emit 3 "applied" events for a dependency table synchronously → exactly ONE
   additional `executeQuery` (count invocations; use fake timers
   `vi.useFakeTimers()` + `vi.runAllTimers()`).
2. Event → scheduled run → `unsubscribe()` before the timer fires → no run.
3. `optimisticUpdate` followed by an "applied" event → the authoritative run
   still happens and overwrites the optimistic data.
4. pagedQuery: 3 events → one `executeQuery` + one `executeCount`.

**Verify**: `npx vitest run src/core/queries` → all pass.

### Step 4: Full-suite regression

**Verify**: `npx vitest run` → 0 failures. Watch specifically any existing test
that emits an event and asserts data synchronously after — such tests must gain
a timer flush, and each one you touch must be listed in the commit message.

## Test plan

Step 3 (4 tests) with fake timers; exemplar for query-layer test structure:
existing files under `src/core/queries/__tests__/` (verify presence first; if
none exist, model on `src/core/sync/__tests__/batch.test.ts`).

## Done criteria

- [ ] Listener in both files calls a scheduler, not `run()` directly
- [ ] Coalescing tests pass; `npx vitest run` exits 0; `npx tsc --noEmit` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- More than ~5 existing tests break on synchronous-data assumptions — the blast
  radius is larger than planned; report the list instead of mass-editing.
- UI-level flows (React hooks) observably lag behind mutations by a frame in a
  way an existing test catches — report; do not switch to microtask timing
  without noting the burst-collapse tradeoff.

## Maintenance notes

- If a future change batches "applied" events at the emitter (one event per
  batch instead of per apply), this per-instance debounce stays correct and
  simply becomes less load-bearing.
- Deferred: filter-aware (row-level) invalidation — measure on-device cost
  first; recorded in plans/README.md rejected/deferred list.
