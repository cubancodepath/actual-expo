# Plan 012: Remove Maestro completely (phantom e2e scripts + stale docs)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `ls maestro/ 2>/dev/null` — if the directory
> now EXISTS, the premise changed; STOP and report.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests / docs
- **Planned at**: commit `219c3c4`, 2026-07-16

## Why this matters

`package.json` ships `"e2e": "maestro test maestro/"` and CLAUDE.md documents
"E2E tests use Maestro (YAML flows in `maestro/flows/`)" — but no `maestro/`
directory exists anywhere in the repo, and Maestro is not a dependency.
`npm run e2e` fails out of the box and the docs describe infrastructure that
isn't there. **The maintainer decided to remove Maestro entirely** — scripts,
docs, and any residual references — rather than rebuild a suite. After this
plan, the repo makes a single truthful claim: tests are Vitest unit tests.

## Current state

- `package.json` scripts (verbatim):
  - `"e2e": "maestro test maestro/"`
  - `"e2e:flow": "maestro test"`
- `find . -type d -name maestro -not -path "*/node_modules/*"` → nothing.
- CLAUDE.md mentions Maestro in at least two places: the Commands block
  (`npm run e2e`, `npm run e2e:flow` rows with descriptions) and the testing
  sentence ("E2E tests use Maestro (YAML flows in `maestro/flows/`)").
- Other possible references: run `grep -rin "maestro" --include="*.md" --include="*.json" --include="*.yml" . --exclude-dir=node_modules --exclude-dir=ios --exclude-dir=plans` to find every mention (docs/, ARCHITECTURE.md, workflows). Plan files under `plans/` mention Maestro descriptively — do NOT edit plans/ other than the README status row.

## Commands you will need

| Purpose     | Command                                                                                                                                        | Expected        |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Find refs   | `grep -rin "maestro" --include="*.md" --include="*.json" --include="*.yml" . --exclude-dir=node_modules --exclude-dir=ios --exclude-dir=plans` | list to clean   |
| JSON sanity | `node -e "require('./package.json')"`                                                                                                          | exit 0          |
| Tests       | `npx vitest run`                                                                                                                               | no new failures |

## Scope

**In scope**:

- `package.json` — delete the `"e2e"` and `"e2e:flow"` script entries.
- `CLAUDE.md` — remove every Maestro mention; state that tests are Vitest
  unit tests only.
- Any other repo file the grep surfaces (docs/\*.md, CI yml) — remove the
  Maestro reference there too, keeping the surrounding content intact.

**Out of scope**:

- Creating any E2E suite or adding alternative E2E tooling.
- Files under `plans/` (except updating this plan's status row in
  `plans/README.md`).
- Any source code.

## Git workflow

- Conventional commit: `chore(dx): remove Maestro e2e scripts and stale references`.
- **Never add AI attribution lines to commits.**
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Remove the scripts

Delete the `"e2e"` and `"e2e:flow"` entries from `package.json`.

**Verify**: `node -e "const s=require('./package.json').scripts; if (s.e2e||s['e2e:flow']) process.exit(1); console.log('ok')"` → `ok`.

### Step 2: Purge every reference

Run the grep from "Commands you will need". For each hit outside `plans/`:
remove the Maestro sentence/row, adjusting surrounding prose so it still
reads correctly (e.g. CLAUDE.md's testing line becomes "Unit tests use
Vitest (`npm test`).").

**Verify**: `grep -rin "maestro" --include="*.md" --include="*.json" --include="*.yml" . --exclude-dir=node_modules --exclude-dir=ios --exclude-dir=plans` → 0 matches.

### Step 3: Sanity

**Verify**: `npx vitest run` → no new failures; `git status` → only the
files identified in Steps 1–2 modified.

## Test plan

None (scripts/docs removal only).

## Done criteria

- [ ] `grep -rin "maestro" --include="*.md" --include="*.json" --include="*.yml" . --exclude-dir=node_modules --exclude-dir=ios --exclude-dir=plans` → 0 matches
- [ ] `node -e "require('./package.json')"` exit 0
- [ ] `npx vitest run` no new failures
- [ ] `plans/README.md` status row updated

## STOP conditions

- `maestro/` exists after all (drift check) — the suite may have been
  restored since this plan was written; the removal decision needs
  re-confirmation.
- A CI workflow actually INVOKES maestro (grep hit in `.github/`) — removing
  it changes CI semantics; report before touching the workflow.

## Maintenance notes

- The app now has zero UI-layer automated coverage by explicit decision; the
  unit suite (Vitest) and manual simulator smoke are the safety net. If UI
  regressions become frequent, revisit — but as a fresh decision, not by
  resurrecting these scripts.
- Reviewer: check CLAUDE.md still reads coherently where sentences were
  removed.
