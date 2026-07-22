# Plan 022: Commit .env.example and document the Sentry build env vars

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cab6621..HEAD -- README.md .gitignore eas.json`
> If any changed since this plan was written, re-check the "Current state"
> facts before proceeding.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs / dx
- **Planned at**: commit `cab6621`, 2026-07-19

## Why this matters

A fresh clone cannot reproduce a production/preview build: the Sentry
source-map upload needs env vars that exist only in the maintainer's untracked
`.env.local`, with no committed template and no README mention. The contract is
undiscoverable. A keys-only `.env.example` plus three README lines fixes
onboarding for zero risk.

## Current state

- `.env.local` exists at the repo root, is untracked, and is correctly
  gitignored (`.gitignore:35` — `.env*.local`). It defines (NAMES only —
  **never copy values**): `SENTRY_AUTH_TOKEN`, `SENTRY_ALLOW_FAILURE`.
- `eas.json` build profiles reference `SENTRY_DISABLE_AUTO_UPLOAD`
  (grep it to confirm which profiles).
- `README.md` has a Prerequisites/setup section (~line 40) with no mention of
  any of these.
- No `.env.example` exists.
- **Hard rule: do not open/echo `.env.local`'s values.** You only need the key
  names listed above.

## Commands you will need

| Purpose | Command                       | Expected on success                 |
| ------- | ----------------------------- | ----------------------------------- |
| Git     | `git check-ignore .env.local` | prints `.env.local` (still ignored) |
| Format  | `npm run fmt:check`           | exit 0                              |

## Scope

**In scope**:

- `.env.example` (create)
- `README.md` (add a short "Environment variables" subsection)

**Out of scope** (do NOT touch):

- `.env.local` itself, `.gitignore` (already correct), `eas.json`,
  `app.config.ts`, any Sentry runtime config (plan 008 owns that).

## Git workflow

- Conventional commit, e.g. `docs: add .env.example for build-time env vars`.
- **Never add AI-attribution or Co-Authored-By lines.** Do NOT push unless instructed.

## Steps

### Step 1: Create `.env.example`

```bash
# Build-time env vars (copy to .env.local — never commit real values).
# Only needed for release builds with Sentry source-map upload; day-to-day
# dev (npm start / npm run ios) works without any of these.

# Sentry auth token for source-map upload during eas build (scope: project releases)
SENTRY_AUTH_TOKEN=

# Set to "true" to let a build succeed even if the Sentry upload fails
SENTRY_ALLOW_FAILURE=

# Referenced by eas.json profiles — set to "true" to skip auto upload entirely
SENTRY_DISABLE_AUTO_UPLOAD=
```

Adjust the third entry's comment to match what `grep -n SENTRY eas.json`
actually shows (which profiles set it and to what).

**Verify**: `git check-ignore .env.example` → prints NOTHING (the example IS
tracked; only `.env*.local` is ignored).

### Step 2: README section

Under the setup/prerequisites area (~line 40), add an "Environment variables"
subsection: one sentence pointing to `.env.example`, one stating dev needs
none of them, one stating release builds (`npm run build:prod` /
`build:preview`) need `SENTRY_AUTH_TOKEN` (or `SENTRY_DISABLE_AUTO_UPLOAD=true`
to opt out). Match the README's existing tone/formatting.

**Verify**: `grep -n "env.example" README.md` → ≥1 match; `npm run fmt:check` → exit 0.

## Test plan

None (docs only). Reviewer sanity check: `.env.example` contains keys and
comments only — zero values.

## Done criteria

- [ ] `.env.example` exists, tracked, keys-only (no values after any `=`)
- [ ] README mentions it and the release-build requirement
- [ ] `git status` shows only the two files
- [ ] `plans/README.md` status row updated

## STOP conditions

- You find additional env var NAMES referenced by `eas.json`/`app.config.ts`
  that this plan doesn't list — add them to `.env.example` as keys-only IF
  their purpose is clear from the referencing code; otherwise report them.
- Anything requires reading `.env.local` values — it never does; STOP if tempted.

## Maintenance notes

- New build-time env vars must land in `.env.example` in the same PR that
  introduces them — reviewers should enforce this.
