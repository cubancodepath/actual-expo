# Plan 008: Move useCategories, BudgetListSkeleton and BudgetSetupWizard out of legacy features/

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 219c3c4..HEAD -- src/features/budget/hooks/useCategories.ts src/features/budget/components/BudgetListSkeleton.tsx src/features/budget/components/BudgetSetupWizard.tsx src/screens/`
> On mismatch with "Current state", STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (pure file moves + import rewrites)
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `219c3c4`, 2026-07-16

## Why this matters

The repo is mid-migration to a screens-first layout (`ARCHITECTURE.md` is the
source of truth; its strangler rule says: a touched legacy file moves to its
final home). Six already-migrated screens under `src/screens/` still import
from legacy `src/features/budget/`, which (a) blocks ever deleting that
directory and (b) is invisible drift — `scripts/check-arch.sh` does not flag
screens→features imports. Moving the three shared pieces to their
ARCHITECTURE.md destinations closes the gap.

## Current state

Verified importers of `@/features` under `src/screens/` (exactly 6 files):

| Importing file                                             | Imports                                                                     |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/screens/budget/hooks/useBudgetSections.ts:3`          | `useCategories` from `@/features/budget/hooks/useCategories`                |
| `src/screens/budget/hooks/useOverspentCategories.ts:2`     | same                                                                        |
| `src/screens/budget/CoverCategoryPickerScreen/index.tsx:7` | same                                                                        |
| `src/screens/budget/BudgetScreen/index.tsx`                | `BudgetListSkeleton` from `@/features/budget/components/BudgetListSkeleton` |
| `src/screens/budget/AssignMoneyScreen/index.tsx`           | same                                                                        |
| `src/screens/auth/LocalSetupScreen/index.tsx`              | `BudgetSetupWizard` from `@/features/budget/components/BudgetSetupWizard`   |

ARCHITECTURE.md placement rules (decision tree, "Regla de colocación"):
domain-shared hooks live in `src/screens/<domain>/hooks/`; domain-shared
components in `src/screens/<domain>/components/`. Targets:

- `src/features/budget/hooks/useCategories.ts` → `src/screens/budget/hooks/useCategories.ts`
- `src/features/budget/components/BudgetListSkeleton.tsx` → `src/screens/budget/components/BudgetListSkeleton.tsx`
- `src/features/budget/components/BudgetSetupWizard.tsx` → **decide by consumers**:
  its only consumer is the auth LocalSetupScreen (verify in Step 1). If auth
  is the sole consumer → `src/screens/auth/components/BudgetSetupWizard.tsx`;
  if budget screens also use it → `src/screens/budget/components/`.

Both moved files may themselves import other `@/features/budget` internals —
Step 2 handles transitive imports.

Path alias: `@/* → src/*` (single alias). Move with `git mv` to preserve
history.

## Commands you will need

| Purpose   | Command                      | Expected            |
| --------- | ---------------------------- | ------------------- | -------------- |
| Typecheck | `npx tsc --noEmit 2>&1       | grep -c "error TS"` | `5` (baseline) |
| Tests     | `npx vitest run`             | no new failures     |
| Arch      | `bash scripts/check-arch.sh` | exit 0              |
| Lint      | `npm run lint`               | exit 0              |

## Scope

**In scope**:

- The three files above (git mv) + every file whose import path references
  them (rewrite path only).
- `src/screens/budget/components/` and `src/screens/auth/components/`
  (create dirs if missing).

**Out of scope**:

- Any BEHAVIOR change in the moved files (byte-identical except import paths).
- Other `src/features/budget/` files (ExpenseCategoryListItem etc.) — they
  belong to still-unmigrated screens.
- Updating `scripts/check-arch.sh` to FAIL on screens→features (nice
  follow-up; note it, don't do it — it would break other legit imports from
  unmigrated routes).

## Git workflow

- Conventional commit, e.g. `refactor(budget): promote useCategories and skeleton/wizard to screens-first homes`.
- **Never add AI attribution lines to commits.**
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Map ALL importers (not just the six)

For each of the three files:
`grep -rln "features/budget/hooks/useCategories\|features/budget/components/BudgetListSkeleton\|features/budget/components/BudgetSetupWizard" src app`
Legacy consumers (under `src/features/` or `app/`) also get their import
paths rewritten — the file moves for everyone. Record the full list. Also
confirm BudgetSetupWizard's consumers to pick its target dir.

### Step 2: Move files and fix their internal imports

`git mv` each file to its target. Open each moved file; rewrite any relative
imports that broke (e.g. `../hooks/...` inside features) to `@/` absolute
paths pointing at the ORIGINAL locations of things that did not move.

**Verify**: `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `5`.

### Step 3: Rewrite all importers

Update every import found in Step 1 to the new paths.

**Verify**: `grep -rn "features/budget/hooks/useCategories\|features/budget/components/BudgetListSkeleton\|features/budget/components/BudgetSetupWizard" src app` → 0 matches; tsc baseline 5.

### Step 4: Full pass

**Verify**: `npx vitest run` → no new failures; `bash scripts/check-arch.sh`
→ exit 0; `npm run lint` → exit 0;
`grep -rn "@/features" src/screens | wc -l` → `0`.

## Test plan

No new tests — moves only. Existing tests that import the moved modules (if
any: `grep -rln "useCategories" src --include="*.test.*"`) get their paths
updated in Step 3 and must pass.

## Done criteria

- [ ] `grep -rn "@/features" src/screens` → 0 matches
- [ ] The three legacy paths no longer exist (`test ! -f src/features/budget/hooks/useCategories.ts` etc.)
- [ ] tsc baseline 5; vitest no new failures; check-arch exit 0
- [ ] `git log --stat -1` shows renames (R) not delete+add, for history
- [ ] `plans/README.md` status row updated

## STOP conditions

- A moved file imports a features-internal module with >2 more transitive
  legacy dependencies (a dependency chain, not a leaf) — report the chain
  instead of moving half of features/.
- `useCategories` turns out to have a duplicate/newer implementation already
  under `src/screens/budget/hooks/` (name collision) — report, don't merge.

## Maintenance notes

- Follow-up (deliberately deferred): make `scripts/check-arch.sh` FAIL on
  `src/screens → @/features` once app/-route fat screens are migrated, so
  this drift can't recur.
- Reviewer: diff of moved files should show ONLY import-path changes.
