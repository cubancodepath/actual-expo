# Plan 011: Round-trip tests for the encryption module

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 219c3c4..HEAD -- src/core/encryption/`
> On mismatch (files renamed/removed), STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (tests only)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `219c3c4`, 2026-07-16

## Why this matters

`src/core/encryption/` implements AES-256-GCM (via `@noble/ciphers`) with
PBKDF2 key derivation for end-to-end-encrypted budgets. A regression here
doesn't crash — it silently produces data that syncs but can never be
decrypted again, the worst failure mode a local-first finance app has. The
module currently has zero direct tests (the only indirect coverage is
`src/services/__tests__/checkKey.test.ts`). A handful of round-trip tests pin
the format.

## Current state

- Module files: `src/core/encryption/index.ts` (public API) and
  `src/core/encryption/internals.ts` (primitives; PBKDF2 at
  `internals.ts:102-105`: `pbkdf2Async(sha512, secret, salt, { c: 10000, dkLen: 32 })`
  — the 10000-iteration count is protocol-mandated by upstream Actual; do NOT
  change it).
- Read `index.ts` first to learn the exported surface (function names for
  encrypt/decrypt/key-derivation/key-import may differ from these
  placeholders — write tests against the REAL exports).
- Existing test conventions: Vitest, `__tests__` folders or `*.test.ts`
  colocated; a service-level exemplar touching keys is
  `src/services/__tests__/checkKey.test.ts` — copy its imports/mocking
  approach (it already runs `@noble` code under vitest/node successfully).
- Node's `crypto.getRandomValues` availability under vitest: the checkKey test
  passing implies the environment supports the primitives; if a polyfill/mock
  is set up in `vitest.config`/`src/__mocks__`, reuse it.

## Commands you will need

| Purpose   | Command                              | Expected        |
| --------- | ------------------------------------ | --------------- |
| New tests | `npx vitest run src/core/encryption` | all pass        |
| Full      | `npx vitest run`                     | no new failures |
| Lint      | `npm run lint`                       | exit 0          |

## Scope

**In scope**: `src/core/encryption/__tests__/roundtrip.test.ts` (create). Nothing else.

**Out of scope**: ANY change to `index.ts`/`internals.ts` — including the
PBKDF2 iteration count (protocol-locked to interoperate with Actual
server/desktop). If a test reveals asymmetry (encrypt output that decrypt
rejects), that's a STOP-and-report, not a fix.

## Git workflow

- Conventional commit: `test(encryption): round-trip and wrong-key coverage`.
- **Never add AI attribution lines to commits.**
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Discover the real API

Read `src/core/encryption/index.ts` and list the exported functions and their
types (key derivation from password+salt, encrypt(buffer) → {value, meta?},
decrypt, key import/export). Note whether inputs/outputs are `Uint8Array`,
base64 strings, or objects.

### Step 2: Write the tests

`src/core/encryption/__tests__/roundtrip.test.ts` covering:

1. **Round-trip**: derive a key from a fixed password+salt, encrypt a small
   payload, decrypt → byte-equal to the original.
2. **Sizes**: repeat for 0-byte, 1-byte, and ~1 MiB payloads.
3. **Wrong key fails**: decrypt with a key derived from a different password
   → throws / rejects (assert it does NOT return garbage bytes).
4. **Tampered ciphertext fails**: flip one byte of the ciphertext → decrypt
   throws (GCM auth).
5. **Key determinism**: same password+salt derives the same key bytes twice
   (pins the PBKDF2 params — if someone changes iterations, this fails).

**Verify**: `npx vitest run src/core/encryption` → 5+ tests pass.

### Step 3: Full pass

**Verify**: `npx vitest run` → no new failures; `npm run lint` → exit 0.

## Test plan

Steps 1–2 ARE the plan. Structural exemplar:
`src/services/__tests__/checkKey.test.ts`.

## Done criteria

- [ ] `npx vitest run src/core/encryption` → ≥5 tests, all pass
- [ ] Only the new test file added (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The primitives fail under vitest's environment (missing WebCrypto/polyfill)
  and checkKey.test.ts doesn't show how it's handled — report the missing
  piece.
- A round-trip case genuinely fails (encrypt/decrypt asymmetry) — that is a
  P1 bug; report immediately, do not modify production code.

## Maintenance notes

- Test 5 (key determinism) intentionally breaks if anyone bumps PBKDF2
  iterations — that is a PROTOCOL change requiring server coordination; the
  failure message should say so (add a comment in the test).
- If the encryption format ever gains a version field, add a fixture test
  with a frozen known-good ciphertext to guarantee backward decryptability.
