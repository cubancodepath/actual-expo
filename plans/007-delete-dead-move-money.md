# Plan 007: Delete the unreachable move-money flow and the legacy input stack it keeps alive

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 219c3c4..HEAD -- "app/(auth)/budget/move-money.tsx" "app/(auth)/_layout.tsx" src/features/budget/components/ExpenseCategoryListItem.tsx`
> On mismatch with "Current state", STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (the flow is unreachable)
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `219c3c4`, 2026-07-16

## Why this matters

`app/(auth)/budget/move-money.tsx` (453 lines, legacy design-system UI) is
registered as a route but **no code navigates to it** — the only intended
entry point is an `onMoveMoney` prop on `ExpenseCategoryListItem` that no
parent ever passes, so its context-menu "move" item is a silent no-op. The
screen's job (moving money between categories / from To Budget) is covered by
the shipped HeroUI flows: `budget/assign-money` (To Budget → categories) and
`budget/cover-overspent` → `cover-source` (category → category). Keeping it
maintains dead UX and blocks deleting legacy input components. **The decision
to CUT (not wire) was made by the maintainer by selecting this plan.**

## Current state

Verified facts at commit 219c3c4:

- `app/(auth)/budget/move-money.tsx` — 453-line legacy screen (design-system
  `Text`/`Amount`/`Button`/`GlassButton`, `useSharedAmountInput`,
  `EditableAmountRow`, `SharedAmountInput`).
- Route registration: `app/(auth)/_layout.tsx` ~lines 180–188:

```tsx
<Stack.Screen
  name="budget/move-money"
  options={{
    headerShown: false,
    presentation: "formSheet",
    sheetAllowedDetents: [1.0],
    contentStyle: { backgroundColor: theme.colors.pageBackground },
  }}
/>
```

- `grep -rn "move-money" src app` → matches ONLY the route file itself, the
  `_layout.tsx` registration, and `app/(auth)/budget/move-category-picker.tsx`
  (which exists to serve move-money: params `{excludeIds, moveCatId, direction}`,
  writes `budgetUIStore.setCoverTarget`). Nothing pushes `/budget/move-money`.
- `src/features/budget/components/ExpenseCategoryListItem.tsx` — declares
  `onMoveMoney?: (catId, catName, balance) => void` (~line 36) and invokes it
  from a context-menu item (~line 348); `grep -rn "onMoveMoney=" src app` → 0
  call sites pass it.
- `app/(auth)/budget/move-category-picker.tsx` — check its inbound
  navigations: `grep -rn "move-category-picker" src app` — if move-money is
  its ONLY caller, it goes too (verify in Step 1; it is also registered in
  `_layout.tsx` ~lines 196–205).
- Legacy components whose deletability depends on remaining consumers (Step 4
  verifies before deleting):
  - `src/features/transactions/components/currency-input/EditableAmountRow.tsx`
  - `src/features/transactions/components/SharedAmountInput.tsx`
  - `src/hooks/useSharedAmountInput.ts`
    These are ALSO used by `app/(auth)/budget/cover-source.tsx`?? — NO: that
    route is now a thin re-export of the migrated HeroUI screen. But
    `app/(auth)/transaction/split.tsx` and `app/(auth)/account/close.tsx` may
    still use them. DELETE ONLY what has zero remaining importers.

## Commands you will need

| Purpose   | Command                                      | Expected            |
| --------- | -------------------------------------------- | ------------------- | -------------- |
| Typecheck | `npx tsc --noEmit 2>&1                       | grep -c "error TS"` | `5` (baseline) |
| Tests     | `npx vitest run`                             | no new failures     |
| Lint+arch | `npm run lint && bash scripts/check-arch.sh` | exit 0              |

## Scope

**In scope**:

- Delete `app/(auth)/budget/move-money.tsx`
- `app/(auth)/_layout.tsx` — remove the `budget/move-money` Stack.Screen (and
  `budget/move-category-picker` IF Step 1 proves it orphaned)
- Delete `app/(auth)/budget/move-category-picker.tsx` (conditional, Step 1)
- `src/features/budget/components/ExpenseCategoryListItem.tsx` — remove the
  `onMoveMoney` prop and its menu item
- Conditionally delete: `EditableAmountRow.tsx`, `SharedAmountInput.tsx`,
  `useSharedAmountInput.ts` (Step 4 — only at zero importers)
- i18n: do NOT remove keys (other screens share `move`, `from`, `to` etc.)

**Out of scope**:

- The assign-money / cover-overspent flows.
- `budgetUIStore.coverTarget` (used by the cover flow).
- Building a replacement category↔category move UX (future feature; note in
  README if desired).

## Git workflow

- Conventional commit, e.g. `refactor(budget): remove unreachable move-money flow and orphaned legacy input components`.
- **Never add AI attribution lines to commits.**
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Confirm reachability facts

Run and record:

- `grep -rn "move-money" src app --include="*.ts" --include="*.tsx"` →
  expect only the route file + `_layout.tsx` + possibly move-category-picker.
- `grep -rn "onMoveMoney=" src app` → expect 0 results.
- `grep -rn "move-category-picker" src app --include="*.ts*"` → if callers
  besides `move-money.tsx` and `_layout.tsx` exist, KEEP the picker and skip
  its deletion in later steps.

**Verify**: results match; otherwise STOP (something was wired since 219c3c4).

### Step 2: Delete route + registration

`git rm "app/(auth)/budget/move-money.tsx"`; remove its Stack.Screen block
from `_layout.tsx`. If Step 1 confirmed the picker orphaned, do the same for
`move-category-picker`.

**Verify**: `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `5`.

### Step 3: Remove the dead prop

In `ExpenseCategoryListItem.tsx`: delete the `onMoveMoney` prop declaration,
its destructuring, and the context-menu item that calls it (the menu item
labelled with the move i18n key). Keep the rest of the menu intact.

**Verify**: `grep -n "onMoveMoney" src -r` → 0 matches; tsc baseline 5.

### Step 4: Delete now-orphaned legacy input components

For each of `EditableAmountRow.tsx`, `SharedAmountInput.tsx`,
`useSharedAmountInput.ts`:
`grep -rln "<name>" src app` (excluding the file itself). Delete ONLY those
with zero remaining importers. Record in the final report which were deleted
and which still have consumers (and who).

**Verify**: tsc baseline 5; `npx vitest run` → no new failures;
`bash scripts/check-arch.sh` → exit 0.

### Step 5: Manual smoke (if simulator available)

Budget tab → long-press / context menu on a category row still opens and its
remaining items work; assign-money and cover-overspent flows unaffected.
If no simulator: state that in the report.

## Test plan

No new tests (deletion). Full suite must show no new failures — the deleted
code had none of its own tests (verified: no `*.test.*` imports these files).

## Done criteria

- [ ] `test ! -f "app/(auth)/budget/move-money.tsx"` → true
- [ ] `grep -rn "move-money\|onMoveMoney" src app` → 0 matches
- [ ] tsc error count 5; `npx vitest run` no new failures; check-arch exit 0
- [ ] Final report lists which legacy components were deleted vs. retained (with their remaining consumers)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Step 1 finds a real navigation to `move-money` (wired after this plan was
  written) — the premise is dead; report instead of deleting.
- Deleting a "zero-importer" file breaks tsc — you missed a dynamic import;
  restore and re-check with `grep -rn "from.*<basename>"`.

## Maintenance notes

- If a category↔category "move money" gesture is wanted later, build it on the
  cover-source pattern (`src/screens/budget/CoverSourceScreen/`) — do NOT
  resurrect this file from git history as-is (legacy design-system).
- Reviewer: the `_layout.tsx` diff should ONLY remove Screen entries; watch
  for accidental reordering that changes navigation behavior.
