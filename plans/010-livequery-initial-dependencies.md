# Plan 010: Seed liveQuery/pagedQuery dependencies from the compiled query, not just the base table

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cab6621..HEAD -- src/core/queries/liveQuery.ts src/core/queries/pagedQuery.ts src/core/queries/compiler.ts src/core/queries/execute.ts`
> If any changed since this plan was written, compare the "Current state"
> excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (staleness race)
- **Planned at**: commit `cab6621`, 2026-07-19

## Why this matters

A live query's invalidation dependencies are seeded with **only its base table**
and corrected to the real set (including joined tables) only after the first
async run resolves. In the window before that — first render under active sync —
a write to a _joined_ table (e.g. a payee rename affecting a transactions
display query) does not invalidate the query, leaving stale data until the next
unrelated event. The compiler already knows the full dependency set at
compile time; seed with it synchronously.

## Current state

- `src/core/queries/liveQuery.ts:93-95`:

```ts
// Auto-start: set initial dependencies from query table, then run
dependencies = [query.serialize().table];
run();
```

and inside `run()` (line ~69): `dependencies = result.dependencies;` after the
await.

- `src/core/queries/pagedQuery.ts` has the same listen/`dependencies` pattern
  (lines ~63-96) — check how it seeds and fix identically if it has the same gap.
- `src/core/queries/compiler.ts:441` — `export function compile(queryState: QueryState): CompiledQuery`
  is synchronous; `CompiledQuery` (line 16) — check whether it carries the
  dependency table list (the async path gets `result.dependencies` from
  `executeQuery`, `execute.ts:18`, so the list originates somewhere in
  compile/execute — find it with `grep -n "dependencies" src/core/queries/*.ts`).
- Existing tests for this layer: `grep -rln "liveQuery" src/core/queries` and
  `src/core/queries/__tests__/` if present (verify; create the test file if the
  directory has no liveQuery test).

## Commands you will need

| Purpose   | Command                           | Expected on success |
| --------- | --------------------------------- | ------------------- |
| Typecheck | `npx tsc --noEmit`                | exit 0              |
| Focused   | `npx vitest run src/core/queries` | all pass            |
| All tests | `npx vitest run`                  | 0 failures          |

## Scope

**In scope**:

- `src/core/queries/liveQuery.ts`
- `src/core/queries/pagedQuery.ts` (same fix if same gap)
- A small export from `compiler.ts` or `execute.ts` ONLY if the dependency list
  isn't already reachable synchronously
- New/extended test file under `src/core/queries/__tests__/`

**Out of scope** (do NOT touch):

- Invalidation _granularity_ (table- vs row-level) — that's plan 011's territory
  (coalescing) and a separately rejected row-level idea.
- `useQuery` React hooks.

## Git workflow

- Conventional commit, e.g. `fix(queries): seed live-query dependencies synchronously from the compiled query`.
- **Never add AI-attribution or Co-Authored-By lines.** Do NOT push unless instructed.

## Steps

### Step 1: Locate the synchronous dependency source

`grep -n "dependencies" src/core/queries/compiler.ts src/core/queries/execute.ts`.
Expected: `compile()` (or the compiled artifact) produces the table list that
`executeQuery` returns. If it's computed only during execution, extract the
computation into `compile()`'s result (synchronous, no DB access needed — it's
derived from the query AST/joins).

**Verify**: you can obtain `string[]` of dependency tables from a `Query` with
one synchronous call.

### Step 2: Seed both engines

Replace the auto-start seeding in `liveQuery.ts` (and `pagedQuery.ts` if it has
the same single-table seed) with the full compiled dependency list. Keep the
post-run assignment (`dependencies = result.dependencies`) — it stays the source
of truth after each run.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Regression test

Test (in `src/core/queries/__tests__/liveQueryDeps.test.ts` or the existing
suite): construct a live query joining a second table (e.g. transactions with
payee name); **before** the first run resolves (hold the first `executeQuery`
via a mock or issue the event synchronously after construction), emit an
"applied" event for ONLY the joined table → the query re-runs (observe a second
`onData` or an executeQuery call count of 2). Before the fix this test fails.

**Verify**: `npx vitest run src/core/queries` → all pass.

### Step 4: Full-suite regression

**Verify**: `npx vitest run` → 0 failures.

## Test plan

Step 3 (+ keep existing query-layer tests green). If mocking `executeQuery`
proves awkward with the real DB helper, an acceptable alternative assertion:
immediately after construction (before any await), the instance's dependency
list already contains the joined table — expose it for tests only if a getter
already exists; otherwise use the event-driven test.

## Done criteria

- [ ] `grep -n "\[query.serialize().table\]" src/core/queries/liveQuery.ts` → no match
- [ ] New regression test passes; `npx vitest run` exits 0
- [ ] `npx tsc --noEmit` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- The dependency list genuinely requires DB access to compute (e.g. schema
  lookup at runtime) — report; do not add an async pre-step to construction.
- Fixing pagedQuery's seed changes its double-fetch behavior (`executeQuery` +
  `executeCount`) — that's out of scope here; only the seed changes.

## Maintenance notes

- Plan 011 (invalidation coalescing) touches the same listener block in both
  files — land this first (it's smaller); 011's diff should preserve the full
  seed.
