# Plan 006: Harden SecureStore accessibility for the auth token and encryption keys

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 219c3c4..HEAD -- src/stores/sessionStore.ts src/services/encryptionKeyStorage.ts`
> On excerpt mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `219c3c4`, 2026-07-16

## Why this matters

The server auth token and the per-budget AES encryption keys are stored via
`expo-secure-store` with no options, which means the platform default
accessibility (`AFTER_FIRST_UNLOCK`): readable any time after the first
unlock since boot, and eligible to migrate to other devices via backups.
For material that decrypts the user's entire financial history,
`WHEN_UNLOCKED_THIS_DEVICE_ONLY` is the appropriate class: bound to this
physical device, unreadable while locked. This is a small, targeted change to
four `setItemAsync` calls.

## Current state

- `src/stores/sessionStore.ts` — `saveToken` (~lines 43–50, verbatim):

```ts
      async saveToken(token: string) {
        if (token) {
          await SecureStore.setItemAsync(SECURE_TOKEN_KEY, token);
        } else {
          await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY);
        }
```

(There is a second `setItemAsync`-adjacent setter near line 40 — grep the
file for all `setItemAsync` calls and treat each the same way.)

- `src/services/encryptionKeyStorage.ts` — two writers (verbatim):

```ts
async function setIndex(ids: string[]): Promise<void> {
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(ids));   // line ~19
}

export async function saveKey(cloudFileId: string, key: SerializedKey): Promise<void> {
  await SecureStore.setItemAsync(KEY_PREFIX + cloudFileId, JSON.stringify(key));  // line ~23
  ...
```

- expo-secure-store API: `setItemAsync(key, value, options?)` where options
  include `keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
  The constant is exported from `expo-secure-store`.
- Reads (`getItemAsync`) do NOT need the option; accessibility is a property
  of the stored item, set at write time. Existing items keep their old class
  until rewritten — both the token (rewritten at every login) and keys
  (rewritten when a budget key is re-derived/downloaded) naturally migrate.

## Commands you will need

| Purpose   | Command                                  | Expected                                             |
| --------- | ---------------------------------------- | ---------------------------------------------------- | -------------- |
| Typecheck | `npx tsc --noEmit 2>&1                   | grep -c "error TS"`                                  | `5` (baseline) |
| Tests     | `npx vitest run src/services src/stores` | all pass (SecureStore is mocked in `src/__mocks__/`) |
| Lint      | `npm run lint`                           | exit 0                                               |

## Scope

**In scope**:

- `src/stores/sessionStore.ts`
- `src/services/encryptionKeyStorage.ts`
- `src/__mocks__/` SecureStore mock ONLY if its signature rejects the third
  argument (extend the mock, don't change its behavior).

**Out of scope**:

- `requireAuthentication` / biometric gating — a UX decision, not made here.
- MMKV-persisted prefs (`prefsStore`) — non-sensitive by design.
- Any migration/rewrite pass over existing stored items beyond what natural
  rewrites do.

## Git workflow

- Conventional commit, e.g. `fix(security): bind token and budget keys to device with WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
- **Never add AI attribution lines to commits.**
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Define one shared options constant per file

At the top of each file:

```ts
// Key material must not leave this device (no backup migration) and must be
// unreadable while locked. Applied at write time; items re-adopt it on rewrite.
const SECURE_OPTS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} as const;
```

### Step 2: Pass it to every setItemAsync

`grep -n "setItemAsync" src/stores/sessionStore.ts src/services/encryptionKeyStorage.ts`
and add `, SECURE_OPTS` as the third argument to every call (there should be
3–4 total).

**Verify**: the same grep now shows `SECURE_OPTS` on every line;
`npx tsc --noEmit 2>&1 | grep -c "error TS"` → `5`.

### Step 3: Tests + lint

**Verify**: `npx vitest run src/services src/stores` → all pass (if the mock
throws on the third arg, extend `src/__mocks__/`'s SecureStore stub to accept
it). `npm run lint` → exit 0.

## Test plan

- Existing service tests (`src/services/__tests__/`) keep passing.
- Add one assertion where a SecureStore mock is already spied on (e.g. in an
  existing authService or checkKey test): the spy receives the options object
  with `keychainAccessible` defined. If no existing test spies on it, add a
  minimal new test in `src/services/__tests__/encryptionKeyStorage.test.ts`
  asserting `saveKey` calls the mock with a third argument.

## Done criteria

- [ ] `grep -c "setItemAsync(" src/stores/sessionStore.ts src/services/encryptionKeyStorage.ts | awk -F: '{s+=$2} END {print s}'` equals the count of calls that include `SECURE_OPTS` (verify by eye with `grep -n`)
- [ ] tsc baseline 5; `npx vitest run` no new failures
- [ ] Only in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

- `expo-secure-store`'s installed version does not export
  `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (API drift) — report the available
  constants instead of picking a different one.
- You find ADDITIONAL sensitive writers elsewhere
  (`grep -rn "setItemAsync" src/` shows files beyond these two) — apply the
  same change ONLY if the stored value is a token/key; otherwise list them in
  your report.

## Maintenance notes

- If biometric gating is ever wanted, add `requireAuthentication: true` to the
  encryption-key writes only (token prompts on every sync would be hostile UX).
- Reviewer: confirm no `getItemAsync` call was changed — reads take no options.
- Known limitation (accepted): items written before this change keep
  `AFTER_FIRST_UNLOCK` until naturally rewritten (next login / key refresh).
