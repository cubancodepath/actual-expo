# Plan 020: Consolidate the duplicated data hooks (useAccounts / useCategories / usePayees / useTags / useRules)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cab6621..HEAD -- src/ui/hooks/ src/hooks/useCategories.ts src/features/accounts/hooks/ src/features/transactions/hooks/ src/screens/transactions/hooks/`
> If any changed since this plan was written, re-derive the importer lists
> (Step 1) before proceeding; on structural mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED — the copies have drifted; consolidation must preserve the superset
- **Depends on**: plans/019-check-arch-legacy-freeze.md (the guard that prevents recurrence; also this plan shrinks its grandfather list)
- **Category**: tech-debt
- **Planned at**: commit `cab6621`, 2026-07-19

## Why this matters

Five reactive data hooks exist in **two live copies each**, both imported by
current code, several with drifted bodies: `useAccounts` (legacy 53 LOC with
balance helpers vs new 13 LOC subset), `useCategories` (legacy 46 LOC with 18
importers vs new 24 LOC with 6), `usePayees`, `useTags`, and `useRules` (87-LOC
verbatim duplicate). A behavior fix to accounts/categories/payees must currently
be made twice or silently applies to only some screens. This consolidates each
hook to one canonical file at its ARCHITECTURE.md destination and deletes the
loser.

## Current state

Verified at `cab6621`:

| Hook          | Copy A (legacy)                                                                                | Copy B (new)                                          | Drift                               |
| ------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------- |
| useAccounts   | `src/features/accounts/hooks/useAccounts.ts` (53 LOC; also exports `useAccountBalance` + more) | `src/ui/hooks/useAccounts.ts` (13 LOC; list only)     | B ⊂ A                               |
| useCategories | `src/hooks/useCategories.ts` (46 LOC; 18 importers)                                            | `src/ui/hooks/useCategories.ts` (24 LOC; 6 importers) | diverged — diff before deciding     |
| usePayees     | `src/features/transactions/hooks/usePayees.ts`                                                 | `src/ui/hooks/usePayees.ts`                           | diff needed                         |
| useTags       | `src/features/transactions/hooks/useTags.ts`                                                   | `src/screens/transactions/hooks/useTags.ts`           | diff needed                         |
| useRules      | `src/features/transactions/hooks/useRules.ts` (87 LOC)                                         | `src/screens/transactions/hooks/useRules.ts` (87 LOC) | verbatim twins (verify with `diff`) |

- Destination convention (ARCHITECTURE.md / CLAUDE.md): multi-domain hooks →
  `src/lib/hooks/`; single-domain hooks → `src/screens/<domain>/hooks/`;
  `src/ui/` must NOT import `@/screens` or `@/stores` (check-arch rule 2), and
  `src/ui/hooks/` exists but ARCHITECTURE.md's rule for `src/ui` is
  "cross-domain custom pieces" — data hooks used by many domains belong in
  `src/lib/hooks/` (exemplar already there: `src/lib/hooks/useTransactions.ts`).
- Both copies of each hook are built on `useLiveQuery` from `@/hooks/useQuery`
  (itself migrating to `src/lib/hooks/` per CLAUDE.md — do not do that move here).
- Canonical-location decision for this plan: **`src/lib/hooks/`** for
  useAccounts/useCategories/usePayees (used across ≥2 domains);
  `src/screens/transactions/hooks/` for useTags/useRules if their importers are
  transactions-only (verify in Step 1; if a second domain imports them, they go
  to `src/lib/hooks/` too).

## Commands you will need

| Purpose   | Command                      | Expected on success |
| --------- | ---------------------------- | ------------------- |
| Typecheck | `npx tsc --noEmit`           | exit 0              |
| All tests | `npx vitest run`             | 0 failures          |
| Arch      | `bash scripts/check-arch.sh` | exit 0              |
| Lint      | `npm run lint`               | exit 0              |

## Scope

**In scope**:

- The 10 hook files listed above (5 survive at new paths, 5+ deleted)
- Every importer of those files (import-path updates ONLY — no call-site logic changes)
- `scripts/check-arch.sh` grandfather list — remove lines for any grandfathered
  file this plan migrates (see plan 019)

**Out of scope** (do NOT touch):

- `src/hooks/useQuery.ts` / `useLiveQuery` internals or their planned move.
- Any OTHER file in `src/features/` — only the listed hooks leave legacy here.
- Behavior changes: the merged hook must be the exact superset of both copies.

## Git workflow

- One commit per hook (5 commits) keeps this reviewable, e.g.
  `refactor(hooks): consolidate useAccounts into lib/hooks`.
- **Never add AI-attribution or Co-Authored-By lines.** Do NOT push unless instructed.

## Steps

### Step 1: Build the ground truth

For each of the 5 hooks: `diff <copyA> <copyB>` and
`grep -rln "<hook file's import path>" src app --include="*.ts*"` for BOTH
copies. Record: superset body, full importer list, chosen destination
(per the decision rule in Current state).

**Verify**: a table of hook → destination → importer count in your notes/PR.

### Step 2: Consolidate one hook at a time

For each hook (order: useRules first — verbatim twins, cheapest; then useTags,
usePayees, useAccounts, useCategories last — most importers):

1. Create the canonical file at the destination with the SUPERSET body
   (for useAccounts: the legacy 53-LOC version including `useAccountBalance`).
2. Repoint every importer of both copies to the new path.
3. Delete both old files.
4. If a deleted/migrated file was on plan 019's grandfather list, remove its line.

**Verify after EACH hook**: `npx tsc --noEmit` → exit 0;
`npx vitest run` → 0 failures; `bash scripts/check-arch.sh` → exit 0.

### Step 3: Sweep for stragglers

**Verify**:
`grep -rn "features/accounts/hooks/useAccounts\|features/transactions/hooks/\(usePayees\|useTags\|useRules\)\|ui/hooks/\(useAccounts\|useCategories\|usePayees\)\|hooks/useCategories" src app --include="*.ts*"`
→ only matches (if any) are the new canonical paths.

### Step 4: Full gates

**Verify**: `npx vitest run` → 0 failures; `npm run lint` → exit 0;
`npm run fmt:check` → exit 0.

## Test plan

No new tests required (pure consolidation), BUT: if `diff` in Step 1 reveals
the two copies return different shapes for the same name (not a subset), STOP —
that's a semantic fork needing a decision, not a mechanical merge.

## Done criteria

- [ ] One file per hook remains; Step 3's grep shows no legacy/duplicate paths
- [ ] `npx tsc --noEmit` exits 0; `npx vitest run` exits 0; `bash scripts/check-arch.sh` exits 0
- [ ] Grandfather list shrunk for any migrated grandfathered file
- [ ] `plans/README.md` status row updated

## STOP conditions

- Step 1 reveals a semantic fork (same export name, incompatible behavior/shape
  between copies) — report the diff; the merge decision is the maintainer's.
- An importer is a legacy `src/features/` screen whose import would now point
  OUT of legacy into `src/lib/hooks/` — that's fine (legacy may import new);
  but if repointing creates a check-arch failure, report it.
- More than ~40 total importers need repointing (blast radius beyond estimate).

## Maintenance notes

- After this plan, plan 019's freeze prevents new duplicates. The remaining
  legacy hooks in `src/features/transactions/hooks/` (useAmountInput,
  useTransactionForm, transactionList) were NOT duplicated and stay for their
  own migration moment.
