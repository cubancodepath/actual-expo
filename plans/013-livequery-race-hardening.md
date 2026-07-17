# Plan 013: Harden liveQuery/pagedQuery against stale in-flight results

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 219c3c4..HEAD -- src/core/queries/liveQuery.ts src/core/queries/pagedQuery.ts`
> On excerpt mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 001 (green suite)
- **Category**: bug
- **Planned at**: commit `219c3c4`, 2026-07-16

## Why this matters

Two related races in the live-query layer produce visible UI glitches:

1. `optimisticUpdate` mutates `data` without bumping `inflightId`, so a
   `run()` that started BEFORE the optimistic change (reading pre-change DB
   state) still passes the staleness guard and overwrites the optimistic data
   — the UI briefly reverts (flicker / stuck-stale row) until the next sync
   event.
2. `fetchNext` (infinite scroll) computes its offset from `data.length` and
   never checks `inflightId`, so if a sync-triggered `run()` resets `data`
   while a page fetch is in flight, the resolved page is appended at a stale
   offset — duplicated or skipped rows in transaction lists mid-scroll.

## Current state

- `src/core/queries/liveQuery.ts` — `run()` staleness guard (verbatim, ~58-70):

```ts
  async function run() {
    if (isUnsubscribed) return;
    const currentId = ++inflightId;
    try {
      const result = await executeQuery<T>(query);
      // Ignore stale responses
      if (inflightId !== currentId || isUnsubscribed) return;
      prevData = data;
      data = result.data;
      ...
```

and `optimisticUpdate` (~81-85):

```ts
function optimisticUpdate(fn: (data: T[]) => T[]) {
  prevData = data;
  data = fn(data);
  options.onData(data, prevData);
}
```

- `src/core/queries/pagedQuery.ts` — `fetchNext` (~107-138): dedupes
  concurrent calls via `fetchNextPromise`, checks only `isUnsubscribed` after
  awaiting, then `data = [...data, ...result.data]`. Its own
  `optimisticUpdate` (~140-146) also skips `inflightId`. `pagedQuery` has its
  own `run()` with the same `inflightId` scheme as liveQuery (read it around
  lines 77-105).
- Consumers: `src/hooks/useQuery.ts` and the transaction-list hooks
  (`src/features/transactions/hooks/transactionList/`) — no changes there.

## Commands you will need

| Purpose       | Command                           | Expected            |
| ------------- | --------------------------------- | ------------------- | --- |
| Queries tests | `npx vitest run src/core/queries` | all pass            |
| Full          | `npx vitest run`                  | no new failures     |
| Typecheck     | `npx tsc --noEmit 2>&1            | grep -c "error TS"` | `5` |

## Scope

**In scope**:

- `src/core/queries/liveQuery.ts`
- `src/core/queries/pagedQuery.ts`
- Test file(s) under `src/core/queries/__tests__/` (create or extend)

**Out of scope**:

- `executeQuery` / the AQL compiler.
- Consumers (`useQuery`, transaction list hooks).
- Table-granularity invalidation design (deferred — see plans/README.md).

## Git workflow

- Conventional commit: `fix(queries): invalidate in-flight runs on optimistic updates and stale fetchNext pages`.
- **Never add AI attribution lines to commits.**
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: optimisticUpdate invalidates in-flight runs (both files)

In BOTH `liveQuery.ts` and `pagedQuery.ts`, bump the id inside
`optimisticUpdate` so any in-flight `run()`/`fetchNext` started earlier is
discarded when it resolves:

```ts
function optimisticUpdate(fn: (data: T[]) => T[]) {
  ++inflightId; // in-flight runs must not clobber the optimistic data
  prevData = data;
  data = fn(data);
  options.onData(data, prevData);
}
```

(pagedQuery: keep its totalCount adjustment.)

**Verify**: `npx vitest run src/core/queries` → existing tests pass.

### Step 2: fetchNext participates in the staleness scheme

In `pagedQuery.ts`'s `fetchNext`, capture `const startId = inflightId;` before
`executeQuery`, and after the await add `if (inflightId !== startId) return;`
next to the existing `isUnsubscribed` check — a `run()` or `optimisticUpdate`
that happened meanwhile invalidates the page.

**Verify**: `npx vitest run src/core/queries` → pass; tsc baseline 5.

### Step 3: Tests

Create/extend `src/core/queries/__tests__/liveQueryRaces.test.ts`. Mock
`executeQuery` with controllable promises (resolve on demand). Cases:

1. liveQuery: start `run()` (unresolved) → `optimisticUpdate` appends a row →
   resolve the old run → `onData` was NOT called with the pre-optimistic
   result (data still contains the optimistic row).
2. pagedQuery: start `fetchNext` (unresolved) → trigger a table-change event
   so `run()` resets data to page 1 → resolve the old fetchNext → data does
   NOT contain the stale page (no duplicates; length equals page 1's length).
3. Regression: plain sequential `run()` → `fetchNext` still appends normally.

Model mocking style on existing tests in `src/core/queries/__tests__/`
(check what exists: `ls src/core/queries/__tests__/`).

**Verify**: `npx vitest run src/core/queries` → all pass incl. 3 new.

### Step 4: Full pass

**Verify**: `npx vitest run` → no new failures.

## Test plan

Step 3. If no `__tests__` dir exists under queries, create it; the emitter
for table-change events is `src/core/sync/syncEvents.ts` (`emit`) — import
and emit `{ type: "applied", tables: [...] }` as `batch.ts:117` does.

## Done criteria

- [ ] Both `optimisticUpdate` implementations bump the id (`grep -n "inflightId" src/core/queries/liveQuery.ts src/core/queries/pagedQuery.ts` shows it inside optimisticUpdate)
- [ ] `fetchNext` contains a post-await staleness check
- [ ] 3 new tests pass; full suite no new failures; tsc baseline 5
- [ ] `plans/README.md` status row updated

## STOP conditions

- Some consumer RELIES on `run()` overwriting optimistic data as its
  "rollback" mechanism (grep consumers of `optimisticUpdate`:
  if a caller optimistically deletes and then expects an error-path re-run to
  restore, this change would strand the optimistic state until the next
  event). If you find such a caller, report it — the fix likely needs an
  explicit `refresh()` on their error path first.
- `pagedQuery.run()` doesn't actually use `inflightId` (structure differs
  from liveQuery) — report the real structure before adapting.

## Maintenance notes

- After an `optimisticUpdate`, the next real reconciliation happens on the
  next table-change event — same as before; this change only prevents OLD
  reads from clobbering. If eventual "always reconcile after optimistic"
  behavior is wanted, schedule a fresh `run()` inside `optimisticUpdate`
  (deliberate follow-up, not done here to keep the diff minimal).
- Reviewer: check the id-bump doesn't break `pagedQuery`'s `fetchNextPromise`
  dedupe (concurrent fetchNext calls should still coalesce).
