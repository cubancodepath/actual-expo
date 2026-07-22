# Plan 012: Debounce the useTransactions infinite-query refetch on sync events

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cab6621..HEAD -- src/lib/hooks/useTransactions.ts src/lib/query/transactionQueries.ts`
> If either changed since this plan was written, compare the "Current state"
> excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED — must not show stale ledgers after a user's own edit
- **Depends on**: none (independent of plan 011, which covers the AQL live-query layer)
- **Category**: perf
- **Planned at**: commit `cab6621`, 2026-07-19

## Why this matters

The transactions ledger uses a TanStack `useInfiniteQuery`; a `listen` effect
calls `queryResult.refetch()` whenever a sync event touches
`transactions`/`category_mapping`/`payee_mapping` — with no debounce. TanStack's
`refetch()` on an infinite query re-runs **every loaded page**. A user scrolled
N pages deep pays N paged SQL queries per event, and bursts (multi-apply
mutations, sync batches) multiply that. A ~100 ms trailing debounce collapses
each burst into one refetch with no user-visible staleness.

## Current state

- `src/lib/hooks/useTransactions.ts:18`: `const SYNC_TABLES = new Set(["transactions", "category_mapping", "payee_mapping"]);`
- `src/lib/hooks/useTransactions.ts:45-54`:

```ts
// Auto-refetch on sync events
useEffect(() => {
  if (!refetchOnSync || !enabled) return;
  return listen((event) => {
    if (event.tables.some((t) => SYNC_TABLES.has(t))) {
      queryResult.refetch();
    }
  });
}, [refetchOnSync, enabled]);
```

- `src/lib/query/transactionQueries.ts:36-44` — per-page fetch via
  `offset(pageParam * pageSize).limit(pageSize)`.
- Note: the effect's dependency array omits `queryResult` on purpose (TanStack's
  `refetch` is stable); preserve that.

## Commands you will need

| Purpose   | Command            | Expected on success |
| --------- | ------------------ | ------------------- |
| Typecheck | `npx tsc --noEmit` | exit 0              |
| All tests | `npx vitest run`   | 0 failures          |
| Lint      | `npm run lint`     | exit 0              |

## Scope

**In scope**:

- `src/lib/hooks/useTransactions.ts`
- A test file next to it if the repo pattern allows hook-level tests
  (check: `ls src/lib/hooks/*.test.*` — if no hook tests exist, verification is
  manual + typecheck; do NOT introduce a new React testing dependency)

**Out of scope** (do NOT touch):

- `transactionQueries.ts` page shape/size.
- Switching to partial-page refetch (`refetchPage`) — TanStack v5 removed it;
  full refetch stays, just debounced.
- The AQL liveQuery layer (plan 011).

## Git workflow

- Conventional commit, e.g. `perf(transactions): debounce ledger refetch on sync bursts`.
- **Never add AI-attribution or Co-Authored-By lines.** Do NOT push unless instructed.

## Steps

### Step 1: Debounce inside the effect

```ts
useEffect(() => {
  if (!refetchOnSync || !enabled) return;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unlisten = listen((event) => {
    if (event.tables.some((t) => SYNC_TABLES.has(t))) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        queryResult.refetch();
      }, 100);
    }
  });
  return () => {
    if (timer) clearTimeout(timer);
    unlisten();
  };
}, [refetchOnSync, enabled]);
```

Trailing debounce (each event resets the 100 ms window) so the refetch runs once
after the burst ends; cleanup cancels pending timers on unmount.

**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → exit 0.

### Step 2: Regression

**Verify**: `npx vitest run` → 0 failures.

### Step 3: Manual verification note

Add to the PR description (do not attempt device automation): "manual check —
edit a transaction in the ledger; the row updates within ~100 ms; scrolling
position preserved."

## Test plan

If `src/lib/hooks/` has no test infrastructure for React hooks (expected), the
gate is typecheck + lint + full suite + the manual note. If hook tests DO exist,
add one with fake timers: 3 events → 1 refetch after 100 ms.

## Done criteria

- [ ] `grep -n "setTimeout" src/lib/hooks/useTransactions.ts` → 1 match inside the listen effect, with matching `clearTimeout` cleanup
- [ ] `npx vitest run` exits 0; `npx tsc --noEmit` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- The effect's structure at the cited lines differs from the excerpt (drifted).
- You are tempted to add `@testing-library/react-native` or similar to test
  this — that's a new dependency; STOP and note it as a suggestion instead.

## Maintenance notes

- 100 ms is a judgment call; if users report edit-lag, drop to 50 ms before
  redesigning. If the emitter ever batches events (see plan 011 maintenance
  note), this debounce can shrink but should stay (guards against multi-batch
  bursts from fullSync).
