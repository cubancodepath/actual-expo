# Plan 013: Collapse the Net Worth report's 13 full-table scans into one grouped query

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cab6621..HEAD -- src/features/reports/hooks/useNetWorth.ts`
> If it changed since this plan was written, compare the "Current state"
> excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — net-worth numbers are user-visible; characterize before refactor
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `cab6621`, 2026-07-19

## Why this matters

Opening the Net Worth card fires **13 concurrent aggregate scans** over the full
transactions table: 12 per-month cumulative `SUM` live queries (one per trailing
month, via 12 stable hook calls) plus a 13th all-time total. Every one of them
depends on the `transactions` table, so a single transaction edit while the
report is visible re-executes all 13 full-table SUMs. One query grouped by month
bucket, reduced to cumulative values in JS, produces identical numbers with one
scan.

## Current state

- `src/features/reports/hooks/useNetWorth.ts:44-55` — `useCumulativeBalance`:

```ts
function useCumulativeBalance(accountIds: string[], idsKey: string, endDate: number): number {
  const { data } = useLiveQuery<{ result: number }>(
    () =>
      accountIds.length > 0
        ? q("transactions")
            .filter({ acct: { $oneof: accountIds }, date: { $lte: endDate } })
            .calculate({ $sum: "$amount" })
        : null,
    [idsKey, endDate],
  );
  return data?.[0]?.result ?? 0;
}
```

- `useNetWorth.ts:118-129` — 12 calls `v11…v0 = useCumulativeBalance(allIds, allIdsKey, monthEndInt(mN))`
  (stable count for Rules of Hooks), plus the all-time total live query
  (`:69-78`) and an assets/debt `groupBy("acct")` query (`:81-91`, keep as-is).
- `monthEndInt(m)` builds `YYYYMMDD` ints (`:38-41`); months come from
  `addMonths(month, -N)`.
- The AQL layer supports `groupBy` + `select` with `$sum` (see the assets/debt
  query in the same file for the exact pattern).
- Trend consumption: `allMonths`/`allValues` parallel arrays sliced by `range`
  (`:131+`) — the hook's return shape must not change (consumers:
  `grep -rn "useNetWorth" src/` before starting).
- NOTE: this file lives in legacy `src/features/` (strangler migration,
  ARCHITECTURE.md). Repo rule: touching a legacy file ideally moves it to its
  destination (`src/screens/reports/…`). For THIS plan, do NOT move it — a move
  plus a logic rewrite in one diff hides regressions; note the pending move in
  the commit message instead.

## Commands you will need

| Purpose   | Command                               | Expected on success |
| --------- | ------------------------------------- | ------------------- |
| Typecheck | `npx tsc --noEmit`                    | exit 0              |
| Focused   | `npx vitest run src/features/reports` | all pass            |
| All tests | `npx vitest run`                      | 0 failures          |

## Scope

**In scope**:

- `src/features/reports/hooks/useNetWorth.ts`
- `src/features/reports/hooks/__tests__/netWorthMath.test.ts` (create — pure
  reduction logic extracted for testability)

**Out of scope** (do NOT touch):

- The assets/debt `groupBy("acct")` query and the all-time total query in the
  same hook — only the 12 cumulative month queries collapse.
- Moving the file out of `src/features/` (see note above).
- Chart components consuming the hook.

## Git workflow

- Conventional commit, e.g. `perf(reports): one grouped query for net-worth trend instead of 12 scans`.
- **Never add AI-attribution or Co-Authored-By lines.** Do NOT push unless instructed.

## Steps

### Step 1: Extract and test the reduction

Create a pure function in the hook file (exported for tests):

```ts
/** rows: per-month sums keyed by YYYYMM bucket; returns cumulative value per requested month end. */
export function cumulativeByMonth(
  rows: Array<{ bucket: number; sum: number }>,
  monthEnds: number[], // 12 YYYYMMDD ints, ascending
  priorTotal: number, // sum of everything before the first bucket
): number[];
```

Semantics to preserve exactly: each output N = SUM(amount) over all transactions
with `date <= monthEnds[N]` for the account set. Write
`netWorthMath.test.ts` FIRST with hand-computed fixtures (months with no
transactions carry the previous cumulative value; leading months before any
transaction = priorTotal).

**Verify**: `npx vitest run src/features/reports` → new tests pass.

### Step 2: One grouped query

Replace the 12 `useCumulativeBalance` calls with ONE live query:

- Query A (bucketed): `q("transactions").filter({ acct: { $oneof: allIds }, date: { $gte: firstMonthStart, $lte: lastMonthEnd } }).groupBy(<month bucket>).select([...])`
  — check what month-bucket expression AQL supports (`grep -n "\$month\|substr" src/core/queries/compiler.ts`);
  if AQL has a `$month`-style transform use it, otherwise group client-side:
  fetch `{date, amount}` for the 12-month window and bucket in JS (still one scan).
- Query B (prior total): `.filter({ acct: {$oneof: allIds}, date: {$lt: firstMonthStart} }).calculate({$sum: "$amount"})`.
- Feed both into `cumulativeByMonth`; keep `allValues` as the same 12-element
  array so the rest of the hook is untouched.

This is 2 live queries total (down from 13), both invalidating on the same
events but scanning bounded ranges.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Delete `useCumulativeBalance` and the 12 call sites

**Verify**: `grep -c "useCumulativeBalance" src/features/reports/hooks/useNetWorth.ts` → 0.

### Step 4: Regression

**Verify**: `npx vitest run` → 0 failures; `npm run lint` → exit 0.

## Test plan

- `netWorthMath.test.ts`: ≥5 cases — steady activity each month; empty months
  in the middle; all activity before the window (priorTotal only); negative
  totals; empty account set → zeros.
- Manual note for the PR: open Reports → Net Worth on the dev build; numbers
  match the previous build for the same data.

## Done criteria

- [ ] Exactly 2 live queries remain for the trend (grep the file for `useLiveQuery` → 3 total: trend, prior-total…, assets/debt + all-time as before; state the final count in the PR)
- [ ] `cumulativeByMonth` tests pass; `npx vitest run` exits 0; `npx tsc --noEmit` exits 0
- [ ] Hook return shape unchanged (consumers untouched — `git status` confirms)
- [ ] `plans/README.md` status row updated

## STOP conditions

- AQL cannot express the bucketed query AND the raw-rows fallback would fetch an
  unbounded row count that worries you (>50k rows plausible) — report with the
  observed AQL capabilities instead of shipping a slow fallback.
- Any consumer destructures fields beyond what you preserved.

## Maintenance notes

- When this file eventually migrates to `src/screens/reports/`, take the tests
  along. If a "last 24 months" range is ever added, extend `monthEnds` — the
  grouped query already covers it with one scan.
