# Plan 015: Round-trip + golden-vector tests for the sync wire encoder (protobuf + AES)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cab6621..HEAD -- src/core/sync/encoder.ts`
> If it changed since this plan was written, compare the "Current state"
> excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (additive tests)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `cab6621`, 2026-07-19

## Why this matters

`encode()`/`decode()` in `src/core/sync/encoder.ts` are the wire boundary with
the Actual server (protobuf SyncRequest/SyncResponse + optional AES-encrypted
message envelopes). **No test calls either function** — the only encoder
reference in tests is a type import (`apply.test.ts:6` imports `SyncMessage` as
a type). Value serialization and message application are tested, but an
encode/decode asymmetry (field added on one side only, wrong envelope handling)
would break server interop invisibly to the current suite. A round-trip suite
plus a golden byte vector catches schema drift cheaply.

## Current state

- `src/core/sync/encoder.ts`:
  - `export type SyncMessage` (line 14), `export type OutgoingSyncMessage` (line 32)
  - `export async function encode(...)` (line 40)
  - `export async function decode(...)` (line 97)
  - Read the whole file first — note the exact parameters (group/file IDs,
    since-timestamp, whether encryption is keyed per budget) and what `decode`
    returns.
- Protobuf definitions: `src/core/proto/`.
- Encryption service used by the encoder (if wired): `src/core/encryption/`
  (AES-256-GCM via @noble/ciphers) — encryption round-trip itself is already
  tested in `src/core/encryption/` tests; this plan tests the ENCODER's use of it.
- CRDT value serialization convention (from CLAUDE.md): values as `'0:'` (null),
  `'N:123'` (number), `'S:text'` (string); timestamps are HLC strings
  (`src/core/crdt/timestamp.ts`).
- Exemplar test structure: `src/core/sync/__tests__/roundtrip.test.ts` (value
  round-trips) and `apply.test.ts`.

## Commands you will need

| Purpose   | Command                                                  | Expected on success |
| --------- | -------------------------------------------------------- | ------------------- |
| Typecheck | `npx tsc --noEmit`                                       | exit 0              |
| Focused   | `npx vitest run src/core/sync/__tests__/encoder.test.ts` | all pass            |
| All tests | `npx vitest run`                                         | 0 failures          |

## Scope

**In scope**:

- `src/core/sync/__tests__/encoder.test.ts` (create)
- `src/core/sync/__tests__/fixtures/` (create if a golden vector file is stored)

**Out of scope** (do NOT touch):

- `encoder.ts` itself and `src/core/proto/` — if a round-trip FAILS, that's a
  bug report, not a fix-in-place (STOP condition).
- Encryption internals.

## Git workflow

- Conventional commit, e.g. `test(sync): encoder round-trip and golden-vector coverage`.
- **Never add AI-attribution or Co-Authored-By lines.** Do NOT push unless instructed.

## Steps

### Step 1: Read encoder.ts and mirror its real API

Write the test file skeleton importing the real `encode`/`decode` signatures.
If they need budget/file context (keys, group id), set it up the way
`fullSync.ts` does (grep how fullSync calls encode/decode and replicate the
minimal context; the test DB helper `src/core/db/__tests__/testDb.ts` plus the
encryption test setup show how keys are provisioned in tests).

**Verify**: `npx vitest run src/core/sync/__tests__/encoder.test.ts` → skeleton runs.

### Step 2: Unencrypted round-trips

`decode(encode(messages))` deep-equals the input for representative messages:

- values: null (`'0:'`), integer, negative, large float, empty string, unicode
  string, and the serialized-string forms
- datasets: `transactions`, `zero_budgets`, `preferences`, plus an arbitrary
  unknown dataset name (encoder must pass it through — it's the apply layer that
  filters)
- multiple messages preserving order and timestamps byte-for-byte.

### Step 3: Encrypted round-trips (if the encoder supports an encrypted mode)

Same matrix with an encryption key installed; assert a tampered ciphertext
fails decode with the expected error type.

### Step 4: Golden vector

Encode one fixed message set (fixed timestamps, no randomness) and snapshot the
bytes as hex in a fixture file with a comment explaining: "if this changes, the
wire format changed — confirm server compatibility before accepting." Assert
current `encode()` output equals the fixture, and `decode(fixture)` equals the
messages.

**Verify**: `npx vitest run src/core/sync/__tests__/encoder.test.ts` → all pass.

### Step 5: Full-suite regression

**Verify**: `npx vitest run` → 0 failures; `npx tsc --noEmit` → exit 0.

## Test plan

Steps 2–4 (~8–12 tests). If `encode` is nondeterministic (random IVs in
encrypted mode), the golden vector covers the UNencrypted envelope only, and
the encrypted path is round-trip-only — note this in the test file.

## Done criteria

- [ ] `grep -n "from \"../encoder\"" src/core/sync/__tests__/encoder.test.ts` → imports the real functions (not just types)
- [ ] Round-trip + golden tests pass; `npx vitest run` exits 0
- [ ] `git status` shows only new test/fixture files
- [ ] `plans/README.md` status row updated

## STOP conditions

- A round-trip fails on current code — that's a live wire-format bug; report
  the exact message shape that breaks, do not patch encoder.ts.
- `encode`/`decode` require network or server state that can't be faked locally
  — report what's needed.

## Maintenance notes

- On every upstream sync-protocol bump (see docs/upstream-sync.md), re-generate
  the golden vector deliberately and record why in the commit.
