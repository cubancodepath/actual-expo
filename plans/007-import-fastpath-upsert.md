# Plan 007: Replace the import fast-path's INSERT-catch-UPDATE with a real upsert

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cab6621..HEAD -- src/core/sync/apply.ts src/core/sync/__tests__/importMode.test.ts`
> If either changed since this plan was written, compare the "Current state"
> excerpt against the live code; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `cab6621`, 2026-07-19

## Why this matters

The bulk-import fast path (`applyMessagesForImport`) tries `INSERT` and, on
**any** thrown error, falls back to `UPDATE ... WHERE id = ?`. If the INSERT
failed for a reason other than a primary-key conflict (NOT NULL / CHECK / type
constraint), the row doesn't exist, the UPDATE matches zero rows, and the value
is **silently dropped** — no log, no throw. A fresh budget download/seed can end
up partially imported while the user believes it's complete. An `INSERT ... ON
CONFLICT` upsert keeps the fast path fast while letting real errors surface.

## Current state

- `src/core/sync/apply.ts:142-147` (inside `applyMessagesForImport`, whole
  function ~121-150):

```ts
const value = deserializeValue(serializeValue(msg.value as string | number | null));
try {
  await run(`INSERT INTO ${dataset} (id, ${column}) VALUES (?, ?)`, [row, value]);
} catch {
  await run(`UPDATE ${dataset} SET ${column} = ? WHERE id = ?`, [value, row]);
}
```

- `dataset` and `column` are already allowlisted against the live schema before
  this point (`writableTables` / `writableColumns` checks, `apply.ts:122-139`),
  so identifier interpolation is safe here — do not change that mechanism.
- The whole loop runs inside `transaction(...)` — an unexpected throw rolls back
  the import batch, which is the desired behavior for corrupt input.
- Existing tests: `src/core/sync/__tests__/importMode.test.ts` covers import
  mode; use it as the structural exemplar and extend it.
- SQLite version bundled by expo-sqlite / better-sqlite3 supports
  `ON CONFLICT(id) DO UPDATE` (SQLite ≥ 3.24; both are far newer).

## Commands you will need

| Purpose   | Command                                                     | Expected on success |
| --------- | ----------------------------------------------------------- | ------------------- |
| Typecheck | `npx tsc --noEmit`                                          | exit 0              |
| Focused   | `npx vitest run src/core/sync/__tests__/importMode.test.ts` | all pass            |
| All tests | `npx vitest run`                                            | 0 failures          |

## Scope

**In scope**:

- `src/core/sync/apply.ts` — only the try/catch block shown above
- `src/core/sync/__tests__/importMode.test.ts` — extend

**Out of scope** (do NOT touch):

- The normal (non-import) apply path in the same file.
- The allowlist logic (`getWritableTables` / `getWritableColumns`).
- Schema files.

## Git workflow

- Conventional commit, e.g. `fix(sync): upsert in import fast-path so real errors surface`.
- **Never add AI-attribution or Co-Authored-By lines.** Do NOT push unless instructed.

## Steps

### Step 1: Replace the block with an upsert

```ts
const value = deserializeValue(serializeValue(msg.value as string | number | null));
await run(
  `INSERT INTO ${dataset} (id, ${column}) VALUES (?, ?)
         ON CONFLICT(id) DO UPDATE SET ${column} = excluded.${column}`,
  [row, value],
);
```

No try/catch: a constraint failure now propagates, aborts the surrounding
`transaction(...)`, and surfaces to the caller instead of silently dropping data.

**Verify**: `npx tsc --noEmit` → exit 0; `npx vitest run src/core/sync/__tests__/importMode.test.ts` → all pass.

### Step 2: Extend importMode.test.ts

Add:

1. **Upsert semantics**: import two messages for the same row+column → final
   value is the second one (same as before the change).
2. **Error surfacing (the fix)**: craft a message whose INSERT genuinely
   violates a constraint other than PK — e.g. target a table/column pair with a
   NOT NULL constraint on another column if the schema has one; if no such
   constraint is reachable through the allowlist, instead assert the negative
   space: a message for a **nonexistent row** with an UPDATE-only path can no
   longer silently no-op (the upsert INSERTs it). Name the test after the
   behavior, e.g. `"import upsert inserts missing rows instead of silently dropping them"`.

**Verify**: `npx vitest run src/core/sync/__tests__/importMode.test.ts` → all pass, including 2 new.

### Step 3: Full-suite regression

**Verify**: `npx vitest run` → 0 failures.

## Test plan

Step 2. Exemplar: existing tests in `importMode.test.ts`.

## Done criteria

- [ ] `grep -n "ON CONFLICT(id) DO UPDATE" src/core/sync/apply.ts` → 1 match
- [ ] `grep -A2 "INSERT INTO \${dataset}" src/core/sync/apply.ts | grep -c catch` → 0 in the import path
- [ ] `npx vitest run` exits 0 with ≥2 new tests
- [ ] `plans/README.md` status row updated

## STOP conditions

- Any existing importMode test fails after Step 1 — that means some import flow
  RELIED on the silent-drop behavior; report which one before proceeding.
- The `run()` helper doesn't accept multi-line SQL or the ON CONFLICT syntax
  errors at runtime — report the exact SQLite error.

## Maintenance notes

- If a future schema migration adds NOT NULL columns (without defaults) to
  synced tables, import-mode inserts of sparse rows will now fail loudly — which
  is correct, but the migration author must provide defaults.
