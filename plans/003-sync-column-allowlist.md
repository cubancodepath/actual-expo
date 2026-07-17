# Plan 003: Validate CRDT column identifiers before interpolating them into sync SQL

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 219c3c4..HEAD -- src/core/sync/apply.ts src/core/sync/__tests__/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (001 recommended first for a green suite)
- **Category**: security
- **Planned at**: commit `219c3c4`, 2026-07-16

## Why this matters

Sync messages arrive from the user's self-hosted server as protobuf and are
applied to SQLite. The `dataset` (table) is validated against an allowlist of
real tables, but the `column` is spliced into the SQL string **unvalidated**.
A malicious or compromised sync server — or, for budgets without E2E
encryption, an attacker on the local network (plaintext HTTP to local servers
is permitted by ATS's `NSAllowsLocalNetworking`) — controls that string and
can therefore alter the executed statement beyond the intended
single-column write. Adding a per-table column allowlist closes the hole with
no effect on legitimate messages, and mirrors how unknown datasets are already
handled (recorded for CRDT convergence, skipped for the table write).

## Current state

- `src/core/sync/apply.ts` — the only file to change. Two write paths
  interpolate `column` raw:
  1. `applyMessagesForImport` (~line 122):

  ```ts
  try {
    await run(`INSERT INTO ${dataset} (id, ${column}) VALUES (?, ?)`, [row, value]);
  } catch {
    await run(`UPDATE ${dataset} SET ${column} = ? WHERE id = ?`, [value, row]);
  }
  ```

  2. `applyMessages` (~lines 233–235):

  ```ts
  if (existed) {
    await run(`UPDATE ${dataset} SET ${column} = ? WHERE id = ?`, [value, row]);
  } else {
    await run(`INSERT INTO ${dataset} (id, ${column}) VALUES (?, ?)`, [row, value]);
  }
  ```

- `dataset` is already gated: `getWritableTables()` (~lines 46–51) builds a
  `Set` from `sqlite_master` minus `EXCLUDED_TABLES`, and messages whose
  dataset is not in the set skip the SQL write but are still folded into
  `messages_crdt` + the merkle trie so peers converge (see the block comment
  above `getWritableTables`). **The fix must treat unknown columns the same
  way**: record for convergence, skip the table write. Do NOT throw — that
  would wedge sync permanently on one bad message.
- `column` originates from the server's decoded protobuf in
  `src/core/sync/encoder.ts` (~lines 135–143) with no validation.
- DB helpers: `runQuerySync<T>(sql)` is already used inside `apply.ts` for the
  `sqlite_master` query — use it for `PRAGMA table_info(...)` too.
- The second write path wraps failures in
  `new ActualError("sync/invalid-schema", { context: { dataset, column }, cause })` —
  keep error-context conventions consistent (identifiers only, never values).

## Commands you will need

| Purpose    | Command                        | Expected on success |
| ---------- | ------------------------------ | ------------------- |
| Install    | `pnpm install`                 | exit 0              |
| Sync tests | `npx vitest run src/core/sync` | all pass            |
| Full suite | `npx vitest run`               | no new failures     |
| Lint       | `npm run lint`                 | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `src/core/sync/apply.ts`
- A new or existing test file under `src/core/sync/__tests__/` (e.g.
  `applyColumns.test.ts`)

**Out of scope** (do NOT touch):

- `src/core/sync/encoder.ts` — decoding stays permissive; validation belongs
  at the apply boundary.
- `EXCLUDED_TABLES` / `getWritableTables` semantics for datasets.
- Any schema file — the allowlist is derived at runtime, not hardcoded.

## Git workflow

- Conventional commit, e.g. `fix(sync): allowlist CRDT column identifiers before SQL interpolation`.
- **Never add AI attribution lines to commits.**
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Build a per-table column map alongside getWritableTables

In `apply.ts`, add next to `getWritableTables()`:

```ts
/**
 * Column allowlist per writable table. Like getWritableTables, derived from
 * the live schema so schema migrations stay the single source of truth.
 * Unknown columns are treated like unknown datasets: recorded in the CRDT
 * log + merkle (so peers converge) but never spliced into SQL.
 */
function getWritableColumns(tables: Set<string>): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const table of tables) {
    const rows = runQuerySync<{ name: string }>(`PRAGMA table_info(${table})`);
    map.set(table, new Set(rows.map((r) => r.name)));
  }
  return map;
}
```

Note: `table` here comes from `sqlite_master` itself, so interpolating it into
PRAGMA is safe.

**Verify**: `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `5` (baseline, no new errors).

### Step 2: Guard both write paths

In `applyMessagesForImport` and in `applyMessages`, compute the column map
once per invocation (right after the writable-tables set is built) and, at
each message, after the existing `if (!writableTables.has(dataset)) continue;`
style check, add the column check with the same skip semantics:

```ts
if (!writableColumns.get(dataset)?.has(column)) {
  // Unknown column for this client's schema version — keep CRDT/merkle
  // convergence, skip the table write (same policy as unknown datasets).
  continue; // in the import path
}
```

In `applyMessages`, mirror whatever the unknown-dataset path does there (the
message must still reach the `messages_crdt` insert + merkle fold below the
skip — read the surrounding loop carefully; the skip must only bypass the
`run(INSERT/UPDATE ...)` block, not the CRDT recording).

**Verify**: `npx vitest run src/core/sync` → all existing sync tests still pass.

### Step 3: Tests

Add tests (pattern: existing files in `src/core/sync/__tests__/`, using the
in-memory test DB from `src/core/db/__tests__/testDb.ts` if that's what
neighbors use):

1. A message with a valid dataset+column applies (row updated).
2. A message with a valid dataset but a column name that does not exist in
   that table (e.g. a string containing spaces/punctuation typical of an
   injected identifier — do NOT write a working payload, any non-column string
   suffices) does NOT modify the table, does NOT throw, and IS recorded in
   `messages_crdt` (assert via a count query).
3. A message for a dataset not in writable tables behaves as before
   (regression guard).

**Verify**: `npx vitest run src/core/sync` → all pass, including 3 new tests.

### Step 4: Full pass

**Verify**: `npx vitest run` → no new failures. `npm run lint` → exit 0.
`npx oxfmt src/core/sync/apply.ts` → exit 0.

## Test plan

Covered in Step 3. Key regression: a full sync round-trip
(`src/core/sync/__tests__/roundtrip.test.ts`) must still pass — it exercises
real columns end-to-end.

## Done criteria

- [ ] `grep -n "getWritableColumns" src/core/sync/apply.ts` → present and used
      in both `applyMessagesForImport` and `applyMessages`
- [ ] `npx vitest run src/core/sync` → all pass incl. 3 new tests
- [ ] `npx vitest run` → no new failures vs. baseline
- [ ] `npx tsc --noEmit` error count still 5
- [ ] `git status` — only in-scope files touched
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpted SQL lines are not found in `apply.ts` (drift).
- The CRDT-recording code path is structured such that skipping the SQL write
  without skipping the recording requires restructuring more than ~10 lines —
  report the structure you found instead of refactoring.
- Any existing sync test fails after Step 2 (the guard is rejecting a
  legitimate column — likely the map was built before migrations ran in the
  test harness).

## Maintenance notes

- Schema migrations automatically extend the allowlist (it's derived from
  PRAGMA at apply time) — but if apply ever becomes long-lived/cached across a
  migration, the map must be rebuilt.
- Reviewer: confirm the skip keeps merkle convergence (unknown-column messages
  still counted) — otherwise clients would diverge from peers with newer
  schemas that legitimately use the new column.
- Related accepted-risk notes (do not fix here): LIMIT/OFFSET numeric
  interpolation in `src/core/domain/transactions/index.ts:54-58` and
  `src/core/queries/compiler.ts:508-509` — internal typed numbers today;
  listed in plans/README.md as deferred hardening.
