# Plan 019: Enforce the legacy-import freeze in check-arch.sh (+ fat-route ratchet, stale doc counts)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cab6621..HEAD -- scripts/check-arch.sh ARCHITECTURE.md`
> If either changed since this plan was written, compare the "Current state"
> excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED — a wrong grep blocks every commit (husky pre-commit)
- **Depends on**: none (plan 020 shrinks the allowlist this plan creates)
- **Category**: tech-debt
- **Planned at**: commit `cab6621`, 2026-07-19

## Why this matters

The strangler migration's central invariant — "no NEW imports into
`@/features` or `@/design-system`" (CLAUDE.md rule 6, ARCHITECTURE.md
Guardarraíles: "actualizar cuando avance la migración para prohibir imports
nuevos a rutas legacy") — is documented and believed-enforced, but
`scripts/check-arch.sh` has **no such check**. Live drift already exists: 7
files in non-legacy layers import legacy dirs (including `src/ui/` re-coupling
to `@/design-system`, which rule 2 misses because it only checks
`@/screens|@/features`). Meanwhile the fat-route check is WARN-only and
ARCHITECTURE.md's example line counts are stale. This plan turns the freeze
into a hard fail with an explicit grandfather list, adds a ratchet on route
count, and refreshes the doc.

## Current state

- `scripts/check-arch.sh` — rules 1–5 hard-fail (core purity, ui→screens,
  cross-domain screens, react-in-core, applib-in-core); WARNs for core→stores
  and fat routes (>120 lines, currently 24 files, top: `app/(auth)/settings/budget.tsx`
  526 lines). **No rule** stops `src/screens|src/lib|src/hooks` (or `src/ui`
  for `@/design-system`) importing legacy dirs.
- Current violators (verified at `cab6621` via
  `grep -rln "@/design-system\|@/features" src/ui src/screens src/lib src/hooks --include="*.ts*"`):
  - `src/ui/feedback/ErrorBoundary.tsx`
  - `src/screens/auth/components/BudgetSetupWizard.tsx`
  - `src/screens/budget/components/BudgetListSkeleton.tsx`
  - `src/lib/screenOptions.ts`
  - `src/hooks/useSharedAmountInput.ts`
  - `src/hooks/useCursorBlink.tsx`
  - `src/hooks/useRefreshControl.ts`
- `ARCHITECTURE.md` (line ~113, "Rutas gordas" row) lists stale counts:
  `account/[id].tsx (557)`, `search.tsx (550)`, `settings/budget.tsx (532)`,
  `split.tsx (455)` — actuals have shifted (budget.tsx is 526 now).
- By-design context you must respect: `src/features/` and `src/design-system/`
  THEMSELVES may import each other and themselves — the freeze applies to
  non-legacy layers importing INTO legacy. `src/hooks/` is itself a legacy
  holding pen (CLAUDE.md), but its files still shouldn't gain new legacy imports;
  include it in the check with its current violators grandfathered.
- The script style: plain bash + grep, `fail=1` accumulation, summarized WARNs.
  Match it.

## Commands you will need

| Purpose    | Command                      | Expected on success    |
| ---------- | ---------------------------- | ---------------------- |
| Arch check | `bash scripts/check-arch.sh` | exit 0 (WARNs allowed) |
| Typecheck  | `npx tsc --noEmit`           | exit 0                 |
| All tests  | `npx vitest run`             | 0 failures             |

## Scope

**In scope**:

- `scripts/check-arch.sh`
- `ARCHITECTURE.md` (the stale counts row + a line documenting the new rule)
- `CLAUDE.md` (one line noting rule 6 is now enforced, if CLAUDE.md mentions enforcement)

**Out of scope** (do NOT touch):

- The 7 violating source files — migrating them is plan 020's + future work;
  this plan grandfathers them.
- Husky config (the hook already runs this script).

## Git workflow

- Conventional commit, e.g. `chore(arch): enforce legacy-import freeze with grandfather list`.
- **Never add AI-attribution or Co-Authored-By lines.** Do NOT push unless instructed.

## Steps

### Step 1: Freeze rule with grandfather list

Add to `check-arch.sh` (style-matched to the existing rules):

```bash
# 6. Legacy-import freeze: non-legacy code must not import @/features or @/design-system.
#    Grandfathered files (pre-freeze debt — REMOVE lines as they migrate, never add):
legacy_allowlist="src/ui/feedback/ErrorBoundary.tsx
src/screens/auth/components/BudgetSetupWizard.tsx
src/screens/budget/components/BudgetListSkeleton.tsx
src/lib/screenOptions.ts
src/hooks/useSharedAmountInput.ts
src/hooks/useCursorBlink.tsx
src/hooks/useRefreshControl.ts"
legacy_new=$(grep -rln "from ['\"]@/\(features\|design-system\)" \
  src/ui src/screens src/lib src/hooks src/stores src/services app \
  --include='*.ts*' 2>/dev/null | grep -vxF "$legacy_allowlist" || true)
if [ -n "$legacy_new" ]; then
  echo "ARCH FAIL: new legacy imports (@/features|@/design-system) outside the grandfather list:"
  echo "$legacy_new" | sed 's/^/  - /'
  fail=1
fi
```

Note `grep -vxF` with a multi-line pattern treats each line as a literal full
match — verify this works in the repo's bash (`bash 3.2` on macOS): test with a
deliberate temp violation (add an import to a scratch file under `src/lib/`,
run, see FAIL, delete it).

**Verify**: `bash scripts/check-arch.sh` → exit 0 on the clean tree; exit 1 with
the temp violation present.

### Step 2: Fat-route ratchet

Replace the fat-route WARN's free-growing behavior with a ratchet: keep the WARN
output, but add `max_fat=24` and fail if the count EXCEEDS it, with a comment
"lower this number as routes migrate; never raise it".

**Verify**: `bash scripts/check-arch.sh` → exit 0 (count is exactly 24 today —
if it isn't, use the actual count the script prints).

### Step 3: Refresh ARCHITECTURE.md

- Update the "Rutas gordas" row's example counts to current values (take them
  from the script's output).
- In "Guardarraíles", change the aspirational bullet to state the rule now
  exists: grandfather list in `check-arch.sh` rule 6, ratchet at 24.

**Verify**: `grep -n "557" ARCHITECTURE.md` → no match (stale count gone).

### Step 4: Full gates

**Verify**: `bash scripts/check-arch.sh` → exit 0; `npx vitest run` → 0 failures;
`npm run fmt:check` → exit 0.

## Test plan

The script's own negative test (Step 1's temp violation) is the test; no vitest
coverage for bash. State in the PR that the negative test was performed.

## Done criteria

- [ ] `bash scripts/check-arch.sh` exits 0 on the clean tree
- [ ] A scratch legacy import in `src/lib/` makes it exit 1 (verified and reverted)
- [ ] Fat-route count > 24 would fail (verified by temporarily setting `max_fat=23`)
- [ ] ARCHITECTURE.md counts refreshed; no stale `557` reference
- [ ] `plans/README.md` status row updated

## STOP conditions

- The grandfather list at HEAD differs from the 7 files above (drift since
  `cab6621`) — regenerate the list from the live grep output, and if it GREW,
  report which files regressed before grandfathering them.
- macOS bash 3.2 mishandles `grep -vxF` with multiline patterns — switch to a
  temp-file allowlist (`grep -vxF -f`) and note it.

## Maintenance notes

- Every file migrated out of legacy must delete its allowlist line (plan 020
  removes several). Reviewers: reject PRs that ADD allowlist lines or raise
  `max_fat`.
