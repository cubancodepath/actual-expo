# Plan 002: Make batchMessages discard its buffer when the batch body throws

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 219c3c4..HEAD -- src/core/sync/batch.ts src/core/sync/__tests__/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 001 (recommended, so the suite is green before/after)
- **Category**: bug
- **Planned at**: commit `219c3c4`, 2026-07-16

## Why this matters

`batchMessages` is the transaction-like wrapper around every multi-write
mutation in the app (saving split transactions, covering overspending,
batch budget assignments). Today its flush lives in a `finally` block, so if
the batch body throws halfway through, the messages buffered _before_ the
throw are still applied to the DB, recorded in undo, and synced to peers —
while the caller sees an exception and believes nothing was saved. Concretely:
`saveTransaction` for a new split buffers the parent then each child; a throw
on child N persists the parent and children 1..N-1, producing an orphaned
split that syncs everywhere. Upstream loot-core only sends messages after the
body completes successfully; this port diverged.

## Current state

- `src/core/sync/batch.ts` — the only file with the bug. Current code
  (verbatim, lines 76–95):

```ts
export async function batchMessages(fn: () => Promise<void>): Promise<void> {
  // Re-entrancy guard: a nested batchMessages() call must append to the
  // OUTER buffer, not flush early and drop the outer call out of batching
  // mode (upstream sync/index.ts:501-505 has the same guard).
  if (_isBatching) {
    await fn();
    return;
  }
  _isBatching = true;
  try {
    await fn();
  } finally {
    _isBatching = false;
    const batched = _batched;
    _batched = [];
    if (batched.length > 0) {
      await _applyAndRecord(batched); // ← runs even when fn() threw
    }
  }
}
```

- Module state (lines 19–20): `let _isBatching = false; let _batched: SyncMessage[] = [];`
  plus `resetBatchState()` at lines 22–25.
- `sendMessages` (lines 50–74) appends to `_batched` when `_isBatching` is true.
- Existing sync tests live in `src/core/sync/__tests__/` (e.g.
  `roundtrip.test.ts`) and DB-backed domain tests use the in-memory test DB at
  `src/core/db/__tests__/testDb.ts` — follow whichever pattern the nearest
  batch/apply test uses. Tests run with Vitest (`npx vitest run <file>`).
- Repo conventions: TypeScript strict-ish, comments explain constraints not
  narration, oxlint + oxfmt.

## Commands you will need

| Purpose    | Command                            | Expected on success                                                          |
| ---------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| Install    | `pnpm install`                     | exit 0                                                                       |
| This test  | `npx vitest run src/core/sync`     | all pass                                                                     |
| Full suite | `npx vitest run`                   | 0 failed (after plan 001; else exactly the 1 known schedule.test.ts failure) |
| Lint       | `npm run lint`                     | exit 0                                                                       |
| Format     | `npx oxfmt src/core/sync/batch.ts` | exit 0                                                                       |

## Scope

**In scope** (the only files you should modify):

- `src/core/sync/batch.ts`
- A new test file, e.g. `src/core/sync/__tests__/batch.test.ts`

**Out of scope** (do NOT touch, even though they look related):

- `src/core/sync/apply.ts`, `undo.ts` — the apply/undo pipeline is correct.
- Callers of `batchMessages` (screens, domain modules) — no caller change is
  needed; the semantics change is internal.
- The module-global `_isBatching`/`_batched` concurrency design — a separate
  concern (see plans/README.md "deferred" notes); do not refactor it here.

## Git workflow

- Conventional commit, e.g. `fix(sync): don't apply batched messages when the batch body throws`.
- **Never add AI attribution lines to commits.**
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Write the failing test first

Create `src/core/sync/__tests__/batch.test.ts` with (at minimum) these cases,
mocking or spying on `_applyAndRecord`'s observable effects. The simplest
observable seam: spy on `applyMessages` from `./apply` (vi.mock) — `batch.ts`
calls it inside `_applyAndRecord`. Cases:

1. **success path**: `batchMessages` body calls `sendMessages([m1]); sendMessages([m2])`
   → `applyMessages` called once with `[m1, m2]`.
2. **throwing body**: body sends `[m1]` then throws → `batchMessages` rejects
   with that error AND `applyMessages` was **never called**; a subsequent
   standalone `sendMessages([m3])` applies normally (buffer was cleared,
   `_isBatching` reset).
3. **nested batch**: outer batch body calls `batchMessages` again (inner sends
   `[m2]`) plus its own `[m1]` → one `applyMessages` call with both messages.

Import `resetBatchState()` in `beforeEach`. Construct minimal `SyncMessage`
objects (`{ timestamp, dataset, row, column, value }` — see the type in
`src/core/sync/encoder.ts`).

**Verify**: `npx vitest run src/core/sync/__tests__/batch.test.ts` → case 2 FAILS
(applyMessages was called despite the throw), cases 1 and 3 pass.

### Step 2: Move the flush to the success path

Rewrite the tail of `batchMessages`:

```ts
_isBatching = true;
try {
  await fn();
} catch (err) {
  // A failed batch must apply nothing: discard the buffer (upstream
  // loot-core only sends after the body completes).
  _batched = [];
  throw err;
} finally {
  _isBatching = false;
}
const batched = _batched;
_batched = [];
if (batched.length > 0) {
  await _applyAndRecord(batched);
}
```

Keep the re-entrancy guard at the top untouched.

**Verify**: `npx vitest run src/core/sync/__tests__/batch.test.ts` → all 3 pass.

### Step 3: Full regression pass

**Verify**: `npx vitest run` → 0 failed (or only the pre-existing
schedule.test.ts failure if plan 001 has not landed). `npm run lint` → exit 0.
`npx oxfmt src/core/sync/batch.ts src/core/sync/__tests__/batch.test.ts` → exit 0.

## Test plan

Covered by Step 1: success flush, error discard + state recovery, nested
batching. Model the file structure on `src/core/sync/__tests__/roundtrip.test.ts`
(imports, describe blocks, vi.mock usage).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "finally" src/core/sync/batch.ts` shows the `finally` block no
      longer contains `_applyAndRecord`
- [ ] `npx vitest run src/core/sync/__tests__/batch.test.ts` → 3+ tests, all pass
- [ ] `npx vitest run` → no NEW failures vs. baseline
- [ ] `git status` shows only the two in-scope files modified/created
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `batch.ts` no longer matches the excerpt (someone already fixed or moved it).
- You find a caller that RELIES on partial application after a throw (grep
  callers of `batchMessages` for catch blocks that resume assuming partial
  state) — report it instead of changing the caller.
- Mocking `applyMessages` proves impossible without touching out-of-scope
  files.

## Maintenance notes

- Anyone adding a "batch with progress" or streaming variant must preserve the
  all-or-nothing contract this plan establishes; the new test file is the
  guard.
- Reviewer should scrutinize: the buffer must also be discarded when the
  _inner_ (re-entrant) call throws — with this change the error propagates to
  the outer `catch`, which clears the shared buffer; the nested test covers it.
- Deferred: serializing concurrent top-level mutations (module-global buffer
  interleaving across `await` points) — recorded in plans/README.md as an
  investigate item, not addressed here.
