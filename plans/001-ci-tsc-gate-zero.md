# Plan 001: Make the CI type-check gate fail on ANY tsc error (baseline is 0, not 5)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cab6621..HEAD -- .github/workflows/pr-check.yml`
> If the file changed since this plan was written, compare the "Current state"
> excerpt against the live file; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `cab6621`, 2026-07-19

## Why this matters

The repo's type-check is actually clean — `npx tsc --noEmit` returns **0 errors** on `cab6621`, and `CLAUDE.md` line 11 documents "Type check (clean — 0 errors)". But the CI workflow still tolerates up to **5** errors, a stale baseline from when 5 module-resolution errors existed. A PR can introduce up to 5 fresh type errors and CI stays green, silently eroding the zero-error invariant.

## Current state

- `.github/workflows/pr-check.yml` — the `type-check` job, lines 24-28:

```yaml
- name: Type check (5 pre-existing module-resolution errors are baseline)
  run: |
    count=$(npx tsc --noEmit 2>&1 | grep -c "error TS" || true)
    echo "tsc errors: $count (baseline 5)"
    test "$count" -le 5
```

- Local verification on `cab6621`: `npx tsc --noEmit` exits 0 with no output.

## Commands you will need

| Purpose   | Command            | Expected on success |
| --------- | ------------------ | ------------------- |
| Install   | `pnpm install`     | exit 0              |
| Typecheck | `npx tsc --noEmit` | exit 0, no output   |

## Scope

**In scope** (the only file you should modify):

- `.github/workflows/pr-check.yml`

**Out of scope**:

- The `test` and `lint` jobs in the same file — they are correct.
- `tsconfig.json` — no compiler-option changes.

## Git workflow

- Work on `develop` (repo's active branch) or a short-lived branch off it.
- Conventional commit, e.g. `ci: fail type-check on any tsc error`.
- **Never add AI-attribution or Co-Authored-By lines to the commit message.**
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Replace the counting step with a plain tsc invocation

In `.github/workflows/pr-check.yml`, replace the step shown in "Current state" with:

```yaml
- name: Type check
  run: npx tsc --noEmit
```

**Verify**: `grep -n "baseline" .github/workflows/pr-check.yml` → no matches.

### Step 2: Confirm the gate passes locally

**Verify**: `npx tsc --noEmit` → exit 0, no output.

## Test plan

No unit tests — this is CI config. The verification is Step 2 plus, if the
operator pushes, a green `type-check` job on the next CI run.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `grep -c "error TS" .github/workflows/pr-check.yml` returns 0 matching lines (the counting hack is gone)
- [ ] `git status` shows only `.github/workflows/pr-check.yml` modified
- [ ] `plans/README.md` status row updated

## STOP conditions

- `npx tsc --noEmit` reports any error locally on a clean checkout — the
  baseline claim in this plan is then wrong; report the errors instead of
  loosening the gate.

## Maintenance notes

- If a future dependency bump introduces unavoidable ambient-type errors, add
  targeted `skipLibCheck`-style fixes or ambient declarations — do not
  reintroduce a numeric error budget in CI.
