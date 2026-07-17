# Plan 009: Reduce re-render churn from useSpreadsheetVersion (cell-targeted invalidation)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 219c3c4..HEAD -- src/hooks/useSheetValue.ts src/core/domain/spreadsheet/spreadsheet.ts src/screens/budget/hooks/useOverspentCategories.ts src/screens/budget/CoverCategoryPickerScreen/index.tsx`
> On mismatch with "Current state", STOP.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (invalidation changes can cause stale UI if too narrow)
- **Depends on**: 001 (green suite)
- **Category**: perf
- **Planned at**: commit `219c3c4`, 2026-07-16

## Why this matters

`useSpreadsheetVersion` re-renders its consumers on EVERY spreadsheet
computation that changes ANY cell. Its consumers
(`useOverspentCategories`, `CoverCategoryPickerScreen`) then rescan every
expense category with 3 `getValue` calls each (one duplicated). While a user
edits budget amounts (a cell change per keystroke via the in-app keyboard),
this produces a full-category-list recompute + re-render per keystroke, on
screens that may not even care about the changed cell. Values are in-memory
map lookups, so the cost is render churn, not I/O — this matters most on
low-end devices and grows with category count.

## Current state

- `src/hooks/useSheetValue.ts:49-60` (verbatim):

```ts
export function useSpreadsheetVersion(): number {
  const ss = getSpreadsheet();
  const [version, setVersion] = useState(() => ss.version);

  useEffect(() => {
    return ss.onCellsChanged(() => {
      setVersion(ss.version);
    });
  }, [ss]);

  return version;
}
```

- The per-cell hook in the same file (`useSheetValue`, lines ~20-40)
  subscribes via the same `onCellsChanged` and checks
  `changedNames.includes(resolved)` — so `onCellsChanged` listeners DO receive
  the changed cell names (an array).
- `src/core/domain/spreadsheet/spreadsheet.ts` — `runComputations` collects
  `changedNames` (array) and bumps `this.version` once per batch (~lines
  254, 300-305).
- Consumers to convert:
  - `src/screens/budget/hooks/useOverspentCategories.ts` — `useMemo` keyed on
    `[categories, groups, sheet, ssVersion]`; body loops all expense
    categories reading `catBalance` once and `catCarryover` TWICE (lines
    ~38-41: two `ss.getValue(... catCarryover ...)` calls — dedupe into one).
  - `src/screens/budget/CoverCategoryPickerScreen/index.tsx` — same pattern
    (`ssVersion` in a useMemo dep, loop with `catBalance` reads).
- Cell name shape: `envelopeBudget.catBalance(id)` etc. resolve to names like
  `budget-YYYY-MM!leftover-<catId>` — resolution happens inside
  `useSheetValue` via the sheet + binding; read how `useSheetValue` resolves
  (`resolved`) and reuse that mechanism.

## Commands you will need

| Purpose           | Command                                      | Expected            |
| ----------------- | -------------------------------------------- | ------------------- | -------------- |
| Typecheck         | `npx tsc --noEmit 2>&1                       | grep -c "error TS"` | `5` (baseline) |
| Tests             | `npx vitest run`                             | no new failures     |
| Spreadsheet tests | `npx vitest run src/core/domain/spreadsheet` | all pass            |

## Scope

**In scope**:

- `src/hooks/useSheetValue.ts` — add a new hook (do NOT change
  `useSpreadsheetVersion`'s semantics; other consumers may rely on it).
- `src/screens/budget/hooks/useOverspentCategories.ts`
- `src/screens/budget/CoverCategoryPickerScreen/index.tsx`
- Optional micro-fix within scope: pass a `Set` of changed names to listeners
  in `spreadsheet.ts` ONLY if the change is ≤10 lines and all listeners are
  updated consistently (there are few: grep `onCellsChanged`).

**Out of scope**:

- `liveQuery` invalidation granularity (different subsystem; deferred).
- Any UI/visual change.
- Rewriting `useSheetValue` (already targeted per-cell).

## Git workflow

- Conventional commit, e.g. `perf(budget): prefix-scoped spreadsheet invalidation for category scans`.
- **Never add AI attribution lines to commits.**
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Add a scoped version hook

In `src/hooks/useSheetValue.ts`, add:

```ts
/**
 * Like useSpreadsheetVersion, but only bumps when a changed cell name passes
 * `matches`. Use for screens that scan many cells of one kind (e.g. all
 * category balances) so unrelated computations don't re-render them.
 */
export function useSpreadsheetVersionWhere(matches: (name: string) => boolean): number {
  const ss = getSpreadsheet();
  const [version, setVersion] = useState(() => ss.version);
  const matchesRef = useRef(matches);
  matchesRef.current = matches;

  useEffect(() => {
    return ss.onCellsChanged((changedNames: string[]) => {
      if (changedNames.some((n) => matchesRef.current(n))) {
        setVersion(ss.version);
      }
    });
  }, [ss]);

  return version;
}
```

Confirm first (by reading `useSheetValue`'s listener) that `onCellsChanged`
listeners receive `changedNames` as their argument; adapt the signature to
what the spreadsheet actually passes.

**Verify**: tsc baseline 5.

### Step 2: Convert useOverspentCategories

Replace `useSpreadsheetVersion()` with a scoped subscription matching only
the cells the memo reads. The memo reads, per category:
`envelopeBudget.catBalance(id)` and `envelopeBudget.catCarryover(id)` on
`sheet`. Determine the resolved-name prefix/pattern for those bindings on the
given sheet (read `envelopeBudget` in
`src/core/domain/spreadsheet/bindings.ts`: `catBalance = field("leftover")`,
`catCarryover = field("carryover")`), and match on
`name.startsWith(sheet) && (name.includes("leftover-") || name.includes("carryover-"))`
— verify the exact separator by logging one resolved name in a scratch test,
not by guessing. Also dedupe the double `catCarryover` read into a single
`getValue` (lines ~38-41).

**Verify**: `npx vitest run` no new failures; manual: budget screen overspent
pill still appears/disappears correctly when a category goes negative (or, if
no simulator, state so in the report).

### Step 3: Convert CoverCategoryPickerScreen

Same substitution for its `ssVersion` memo dep (it reads `catBalance` only,
plus `toBudget` via `useSheetValueNumber` which is already targeted).

**Verify**: tsc baseline 5; vitest no new failures.

### Step 4: (Conditional) Set-based changedNames

If, while reading `spreadsheet.ts`, converting `changedNames` array→`Set` and
updating ALL `onCellsChanged` consumers is ≤10 lines total, do it (fixes the
O(subscribers × changed) `includes` scans in `useSheetValue`). Otherwise skip
and note it as deferred.

**Verify**: `npx vitest run src/core/domain/spreadsheet` → all pass.

## Test plan

- Add a unit test for `useSpreadsheetVersionWhere` if a hooks test harness
  exists (`grep -rln "renderHook" src` — if none, skip component testing and
  cover the matcher logic as a pure function instead: extract
  `makeCategoryCellMatcher(sheet)` and test it with sample resolved names).
- Existing spreadsheet tests must pass unchanged.

## Done criteria

- [ ] `grep -n "useSpreadsheetVersion()" src/screens/budget/hooks/useOverspentCategories.ts src/screens/budget/CoverCategoryPickerScreen/index.tsx` → 0 matches (both use the scoped hook)
- [ ] `grep -c "catCarryover" src/screens/budget/hooks/useOverspentCategories.ts` shows a single `getValue` read per category
- [ ] tsc baseline 5; `npx vitest run` no new failures
- [ ] `plans/README.md` status row updated

## STOP conditions

- `onCellsChanged` listeners do NOT receive changed names (signature differs
  from what `useSheetValue` suggests) — report the actual signature.
- The resolved cell-name format can't be determined confidently (matcher
  would be a guess) — report the format you observed instead of shipping a
  wrong matcher (a wrong matcher = stale overspent pill, worse than slow).

## Maintenance notes

- Anyone adding a new "scan all categories" screen should use
  `useSpreadsheetVersionWhere`, not the global hook — consider a lint note in
  ARCHITECTURE.md.
- Reviewer: the matcher's cell-name assumptions are the risk point; check them
  against `bindings.ts` and one logged real name.
- Deferred: table-granularity liveQuery invalidation (bigger, separate
  design); Set-based changedNames if Step 4 was skipped.
