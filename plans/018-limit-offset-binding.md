# Plan 018: Bind LIMIT/OFFSET as parameters (uniform parameterization of the query layer)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cab6621..HEAD -- src/core/queries/compiler.ts src/core/domain/transactions/index.ts`
> If either changed since this plan was written, compare the "Current state"
> excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security (defense-in-depth — no live vulnerability today)
- **Planned at**: commit `cab6621`, 2026-07-19

## Why this matters

The query layer parameterizes every value via `?` bindings — except LIMIT and
OFFSET, which are template-interpolated in two places. Both are internally
supplied typed numbers today, so there is **no known injection path**; this is
hardening: they are the only interpolated values in an otherwise uniformly
parameterized layer, and a future caller passing an unvalidated value would
inject SQL. Binding them (or integer-coercing) closes the pattern.

## Current state

- `src/core/queries/compiler.ts:517-519`:

```ts
// LIMIT / OFFSET
const limitSql = queryState.limit != null ? `LIMIT ${queryState.limit}` : "";
const offsetSql = queryState.offset != null ? `OFFSET ${queryState.offset}` : "";
```

- `src/core/domain/transactions/index.ts:54-55`:

```ts
const limit = opts.limit ? `LIMIT ${opts.limit}` : "";
const offset = opts.offset ? `OFFSET ${opts.offset}` : "";
```

- The compiler collects bound params somewhere (find: `grep -n "params" src/core/queries/compiler.ts | head`)
  — LIMIT/OFFSET params must append in the correct position (they come last in
  SQLite SQL, so appending to the params array last matches `?` order).
- Callers: `pagedQuery.ts` computes limit/offset; `getTransactions`
  (`index.ts:36`) passes `opts` through. Both are typed `number`.
- expo-sqlite and better-sqlite3 both support bound `LIMIT ?` / `OFFSET ?`.

## Commands you will need

| Purpose   | Command                           | Expected on success |
| --------- | --------------------------------- | ------------------- |
| Typecheck | `npx tsc --noEmit`                | exit 0              |
| Focused   | `npx vitest run src/core/queries` | all pass            |
| All tests | `npx vitest run`                  | 0 failures          |

## Scope

**In scope**:

- `src/core/queries/compiler.ts`
- `src/core/domain/transactions/index.ts` (the two lines above only)
- Compiler tests (extend the existing compiler/queries test file — find it via
  `ls src/core/queries/__tests__/` or `grep -rln "compile" src/core --include="*.test.ts"`)

**Out of scope** (do NOT touch):

- Any other SQL assembly in the repo (the sync-layer identifier allowlists are
  a different, already-correct mechanism).
- Query API/`QueryState` types.

## Git workflow

- Conventional commit, e.g. `refactor(queries): bind LIMIT/OFFSET as parameters`.
- **Never add AI-attribution or Co-Authored-By lines.** Do NOT push unless instructed.

## Steps

### Step 1: Compiler

In `compiler.ts`, emit `LIMIT ?`/`OFFSET ?` and push
`Math.trunc(queryState.limit)` / `Math.trunc(queryState.offset)` onto the params
array in SQL order (LIMIT before OFFSET, after all other params). Guard: if the
value is not a finite number, throw an `ActualError`-style error (match how the
compiler reports invalid queries today — read its existing error pattern first).

**Verify**: `npx vitest run src/core/queries` → existing tests pass.

### Step 2: transactions/index.ts

Same change for `getTransactions`: `LIMIT ?` with the value appended to the
existing params array of that query (read lines ~36-60 to see how params flow
into `runQuery`).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Tests

Extend the compiler test file:

- limit+offset query compiles to SQL containing `LIMIT ? OFFSET ?` and the
  params array ends with the two integers.
- `limit: 5.9` → truncated to 5 (or throws, whichever you implemented — assert it).
- non-numeric limit (cast through `any`) → throws.
- query without limit/offset unchanged.

**Verify**: `npx vitest run src/core/queries` → all pass, new tests included.

### Step 4: Full-suite regression

**Verify**: `npx vitest run` → 0 failures (pagedQuery tests exercise the real path).

## Test plan

Step 3 (4 tests) + full suite.

## Done criteria

- [ ] `grep -n "LIMIT \${" src/core/queries/compiler.ts src/core/domain/transactions/index.ts` → no matches (line 467's hardcoded `LIMIT 5` literal in index.ts is fine — it has no interpolation)
- [ ] New tests pass; `npx vitest run` exits 0; `npx tsc --noEmit` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- expo-sqlite (the production driver, mocked in tests by better-sqlite3) rejects
  bound LIMIT at runtime — cannot be detected in Node tests; if any doubt
  emerges from docs, fall back to the coercion-only variant
  (`LIMIT ${Math.trunc(Number(x))}` after an `Number.isFinite` throw-guard) and
  say so in the PR.
- The compiler's param ordering makes appending last incorrect (subqueries after
  LIMIT?) — report the structure found.

## Maintenance notes

- Rule for reviewers going forward: no template interpolation of VALUES in SQL
  anywhere in `src/core` — identifiers only via the existing allowlists.
