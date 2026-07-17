# Plan 010: Consolidate category/payee picking on the HeroUI PickerScreen (retire CategoryPickerList)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 219c3c4..HEAD -- "app/(auth)/transaction/category-picker.tsx" "app/(auth)/transaction/payee-picker.tsx" src/design-system/molecules/CategoryPickerList.tsx src/screens/transactions/`
> On mismatch with "Current state", STOP.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (touches transaction-edit flows on accounts/spending screens)
- **Depends on**: 001 (green CI to catch regressions)
- **Category**: tech-debt
- **Planned at**: commit `219c3c4`, 2026-07-16

## Why this matters

Two parallel picker stacks coexist: the migrated HeroUI stack
(`src/ui/PickerScreen.tsx` + `src/screens/transactions/CategoryPickerScreen`
and `PayeePickerScreen`, routed via `transaction/category-select` and
`transaction/payee-select`) and the legacy stack
(`src/design-system/molecules/CategoryPickerList.tsx` behind
`app/(auth)/transaction/category-picker.tsx`, plus a 415-line inline
`payee-picker.tsx` with NO inbound navigation). ~11 call sites still navigate
to the legacy category picker, so every UX fix is done twice and the legacy
molecule can't be deleted. Consolidating is a self-contained slice of the
documented strangler migration where the replacement already exists.

## Current state

- New stack (keep):
  - `src/ui/PickerScreen.tsx` — searchable picker scaffold (ScreenHeader blur).
  - `src/screens/transactions/CategoryPickerScreen/index.tsx` — grouped
    category picker with split mode; selection flows through
    `useTransactionForm().actions.selectCategory` (a form context provided by
    `TransactionFormProvider` — **this is the crux**: it only works inside the
    transaction-form provider tree).
  - Routes: `app/(auth)/transaction/category-select.tsx`, `payee-select.tsx`
    (thin re-exports), registered in `app/(auth)/transaction/_layout.tsx`.
- Legacy stack (retire):
  - `src/design-system/molecules/CategoryPickerList.tsx` (211 lines,
    design-system FlatList + SearchBar; props: `title, groups, onSelect,
renderRight, emptyMessage, listHeaderExtra, autoFocusSearch`).
  - `app/(auth)/transaction/category-picker.tsx` — legacy route using it;
    **selection contract**: check how it returns the pick (params/store) by
    reading it first.
  - `app/(auth)/transaction/payee-picker.tsx` — 415-line screen with zero
    inbound `router.push` (verify: `grep -rn "transaction/payee-picker" src app`).
- Legacy callers to repoint (verified count: 11 `router.push` to
  `transaction/category-picker`, excluding the route itself/\_layout):
  - `src/features/spending/screens/SearchScreen.tsx:185,462`
  - `app/(auth)/(tabs)/(spending)/index.tsx` (~194,204)
  - `app/(auth)/account/[id].tsx` (~224,234)
  - `app/(auth)/account/search.tsx` (~180,434)
  - `src/features/transactions/hooks/transactionList/useTransactionList.ts:394,587`
  - (run the grep in Step 1 for the authoritative list)
- **Key risk**: legacy callers are NOT inside `TransactionFormProvider` — they
  pick a category for an _existing_ transaction (bulk-edit/assign flows),
  returning the result differently (likely `pickerStore` — check
  `src/stores/pickerStore.ts`). The new CategoryPickerScreen cannot be used
  as-is for them.

## Commands you will need

| Purpose   | Command                                      | Expected            |
| --------- | -------------------------------------------- | ------------------- | -------------- |
| Typecheck | `npx tsc --noEmit 2>&1                       | grep -c "error TS"` | `5` (baseline) |
| Tests     | `npx vitest run`                             | no new failures     |
| Lint+arch | `npm run lint && bash scripts/check-arch.sh` | exit 0              |

## Scope

**In scope**:

- New: `src/screens/transactions/CategoryAssignPickerScreen/` (a
  provider-independent grouped category picker composed from
  `@/ui/PickerScreen` — Step 2)
- `app/(auth)/transaction/category-picker.tsx` (becomes a thin re-export of
  the new screen)
- The legacy caller files listed above (navigation target/params only)
- Delete: `src/design-system/molecules/CategoryPickerList.tsx`,
  `app/(auth)/transaction/payee-picker.tsx` (+ its `_layout` registration),
  design-system barrel entry for CategoryPickerList
- `app/(auth)/budget/delete-category-picker.tsx` IF it uses
  CategoryPickerList (check in Step 1 — if yes, convert it the same way)

**Out of scope**:

- `CategoryPickerScreen`/`PayeePickerScreen` (form-context pickers) — no changes.
- The pickers' selection SEMANTICS (what happens after picking) — only the
  UI layer and navigation change.
- `src/screens/budget/CoverCategoryPickerScreen` — already migrated.

## Git workflow

- One commit per step group, conventional style, e.g.
  `refactor(transactions): provider-independent category picker on PickerScreen`,
  `refactor(transactions): retire CategoryPickerList and orphaned payee-picker`.
- **Never add AI attribution lines to commits.**
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Map the legacy contract

Read `app/(auth)/transaction/category-picker.tsx` end-to-end: its params
(`hideSplit`?), how it builds groups, and how it RETURNS the selection
(param round-trip, `pickerStore`, or callback). Read `src/stores/pickerStore.ts`.
Also: `grep -rn "CategoryPickerList" src app` for all consumers (expect the
category-picker route, possibly `budget/delete-category-picker.tsx`, and
`account/close.tsx`? — record the authoritative list) and
`grep -rn "transaction/payee-picker\b" src app` (expect only its own
route/\_layout).

**Verify**: you can state, in one sentence each, the selection contract of the
legacy picker and the full consumer list. Record both in the final report.

### Step 2: Build the provider-independent replacement

Create `src/screens/transactions/CategoryAssignPickerScreen/index.tsx`
composing `@/ui/PickerScreen` exactly like
`src/screens/budget/CoverCategoryPickerScreen/index.tsx` does (grouped
`ListGroup`s + `Money` + search) but preserving the legacy selection contract
from Step 1 (same store write / same params back). Copy visual structure from
`CoverCategoryPickerScreen` (it's the exemplar for provider-less pickers).

**Verify**: tsc baseline 5.

### Step 3: Swap the route body

Make `app/(auth)/transaction/category-picker.tsx` a thin re-export:
`export { CategoryAssignPickerScreen as default } from "@/screens/transactions/CategoryAssignPickerScreen";`
Keep the route NAME unchanged so the 11 callers keep working without edits
(they already push `transaction/category-picker`). Confirm the route's
presentation options in the relevant `_layout.tsx` still fit (formSheet etc.).

**Verify**: tsc baseline 5; manual (if simulator): from an account row,
change a transaction's category via the picker → selection applies.

### Step 4: Delete the orphans

- `git rm "app/(auth)/transaction/payee-picker.tsx"` + remove its `_layout`
  registration (only if Step 1 confirmed zero inbound navigations).
- If `budget/delete-category-picker.tsx` used CategoryPickerList, convert it
  the same way as Step 2/3 (same provider-less pattern) — otherwise leave it.
- `git rm src/design-system/molecules/CategoryPickerList.tsx` once
  `grep -rn "CategoryPickerList" src app` → only its own definition remains;
  remove its export from `src/design-system/index.ts` (or wherever the barrel
  lists it).

**Verify**: `grep -rn "CategoryPickerList" src app` → 0 matches; tsc baseline
5; `npx vitest run` no new failures; check-arch exit 0.

## Test plan

- No component-test infra exists; the gates are tsc/lint/arch + manual smoke
  of: account transaction-list bulk category change, spending search category
  filter, and the delete-category flow (if converted). List what you smoked
  (or couldn't) in the report.

## Done criteria

- [ ] `grep -rn "CategoryPickerList" src app` → 0
- [ ] `test ! -f "app/(auth)/transaction/payee-picker.tsx"`
- [ ] All former callers still navigate to `transaction/category-picker` and it renders the new screen (route file is a 1-line re-export)
- [ ] tsc baseline 5; vitest no new failures; lint + check-arch exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- The legacy selection contract is a callback prop (not serializable via
  store/params) — the swap needs design; report the contract you found.
- `payee-picker.tsx` HAS an inbound navigation you find in Step 1.
- Any caller passes params the new screen can't honor (e.g. multi-select) —
  report rather than silently dropping the capability.

## Maintenance notes

- After this lands, `src/design-system/molecules/` shrinks by its biggest
  consumer-facing piece; the next strangler targets are the fat routes listed
  by `bash scripts/check-arch.sh` (account/[id], account/search,
  settings/budget, transaction/split).
- Reviewer: check the store-based selection has no stale-value hazard when the
  picker is opened twice in a row (legacy picker's contract may clear-on-read
  — preserve exactly that).
