# Plan 008: Scrub sensitive context from Sentry events (beforeSend + stop attaching plaintext previews)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cab6621..HEAD -- app/_layout.tsx src/services/budgetfiles.ts src/core/post.ts src/ui/feedback/ErrorChannelConsumer.tsx`
> If any changed since this plan was written, compare the "Current state"
> excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `cab6621`, 2026-07-19

## Why this matters

Sentry is enabled in production (`enabled: !__DEV__`) with **no `beforeSend`
scrubber**, and error context currently carries data that should not leave the
device: up to **200 bytes of a downloaded budget archive** (already-decrypted
plaintext when E2E encryption is on) on a corrupt-archive error, up to **500
chars of raw server response body** on HTTP rejections, and the user's
self-hosted server hostname wherever it rides along in error context. This is a
data-minimization fix: strip known-sensitive keys centrally and stop attaching
plaintext previews at the source.

## Current state

- `app/_layout.tsx:57-65`:

```ts
Sentry.init({
  dsn: "https://…@….ingest.us.sentry.io/…", // public DSN, fine to keep
  tracesSampleRate: __DEV__ ? 1.0 : 0.2,
  profilesSampleRate: __DEV__ ? 1.0 : 0.2,
  environment: __DEV__ ? "development" : "production",
  enabled: !__DEV__,
  integrations: [navigationIntegration],
  enableNativeFramesTracking: !isRunningInExpoGo(),
});
```

- `src/services/budgetfiles.ts:430-435` — on failed magic-byte check:

```ts
if (zipBytes[0] !== 0x50 || zipBytes[1] !== 0x4b) {
  const contentType = res.headers.get("content-type") ?? "unknown";
  const preview = new TextDecoder().decode(zipBytes.slice(0, 200));
  throw new ActualError("file/corrupt-archive", {
    context: { contentType, preview },
  });
}
```

- `src/core/post.ts:37-40` — `serverReason: reason ?? fallbackText.slice(0, 500)`
  attached to `http/rejected` errors (and other branches attach `serverReason` too).
- `src/ui/feedback/ErrorChannelConsumer.tsx:16-28` — ships every bus error to
  Sentry with `extra: event.context`.
- Repo conventions: errors are `ActualError` with a `context` record
  (`src/core/errors/`); tests use vitest.

## Commands you will need

| Purpose   | Command            | Expected on success |
| --------- | ------------------ | ------------------- |
| Typecheck | `npx tsc --noEmit` | exit 0              |
| All tests | `npx vitest run`   | 0 failures          |
| Lint      | `npm run lint`     | exit 0              |

## Scope

**In scope**:

- `app/_layout.tsx` — add `beforeSend` (and `beforeBreadcrumb` if breadcrumbs carry context)
- `src/lib/errors/sentryScrub.ts` (create — pure function so it's testable)
- `src/lib/errors/__tests__/sentryScrub.test.ts` (create)
- `src/services/budgetfiles.ts` — replace `preview` with non-content diagnostics
- `src/core/post.ts` — cap/classify `serverReason` (see Step 3)

**Out of scope** (do NOT touch):

- `ErrorChannelConsumer.tsx` — keep it shipping `event.context`; the scrubber is
  the single choke point.
- Sentry DSN / sample rates / integrations.
- Error _codes_ or user-facing error UI.

## Git workflow

- Conventional commit, e.g. `fix(telemetry): scrub sensitive keys from Sentry events`.
- **Never add AI-attribution or Co-Authored-By lines.** Do NOT push unless instructed.

## Steps

### Step 1: Pure scrubber

Create `src/lib/errors/sentryScrub.ts` exporting
`scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent`:

- Deep-walk `event.extra`, `event.contexts`, and breadcrumb `data`.
- Drop keys (case-insensitive): `preview`, `serverReason`, `serverUrl`, `token`,
  `password`, `authorization`, `cookie`.
- Truncate any remaining string value > 300 chars to 300 + `"…"`.

Keep it dependency-free (types via `@sentry/react-native` type imports only).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Wire it into `Sentry.init`

In `app/_layout.tsx` add `beforeSend: scrubEvent` (import from
`@/lib/errors/sentryScrub`). If `Sentry.init`'s type wants
`(event, hint) => event`, wrap accordingly.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Remove plaintext at the source

- `budgetfiles.ts`: replace `preview` with content-free diagnostics:
  `{ contentType, byteLength: zipBytes.length, firstBytesHex: <first 4 bytes as hex> }`.
  4 bytes of magic-number hex is enough to debug "server sent HTML instead of a
  zip" without shipping body content.
- `post.ts`: keep `serverReason` for the **known enum-like reasons** (the
  `AUTH_REASONS` / `mapServerReason` matches — those are protocol constants, not
  body content), but for the fallback branch replace
  `fallbackText.slice(0, 500)` with `fallbackText.slice(0, 120)`. The scrubber
  from Step 1 drops `serverReason` from telemetry anyway; the shorter slice
  limits what sits in memory/logs.

**Verify**: `grep -n "preview" src/services/budgetfiles.ts` → no content-preview
match; `npx vitest run` → 0 failures (fix any test asserting the old context shape).

### Step 4: Tests

`src/lib/errors/__tests__/sentryScrub.test.ts`:

- event with `extra: { preview: "...", serverReason: "...", serverUrl: "..." }` →
  all three gone, other keys intact.
- nested context objects scrubbed; 1000-char string truncated to 301 chars.
- event without extras passes through unchanged.

**Verify**: `npx vitest run src/lib/errors` → all pass.

## Test plan

Step 4, plus full-suite regression: `npx vitest run` → 0 failures.

## Done criteria

- [ ] `grep -n "beforeSend" app/_layout.tsx` → 1 match
- [ ] `grep -rn "zipBytes.slice(0, 200)" src/services/budgetfiles.ts` → no match
- [ ] Scrubber tests exist and pass; `npx vitest run` exits 0; `npx tsc --noEmit` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- `@sentry/react-native@7.x`'s `beforeSend` signature doesn't match the plan's
  assumption — adapt to the actual type; if the hook doesn't exist in this SDK
  version at all, STOP and report.
- Some flow parses `context.preview` programmatically (grep first:
  `grep -rn "context.preview\|\.preview" src/`) — report it before removing.

## Maintenance notes

- Anyone adding new `ActualError` context keys with request/response content
  must add them to the scrubber's drop list — reviewers should watch for this.
- Deferred (not this plan): auditing breadcrumb volume/PII beyond the drop-list.
