# Plan 004: Await (and error-handle) the budget-amount write in BudgetScreen's commit

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 219c3c4..HEAD -- src/screens/budget/BudgetScreen/index.tsx`
> If the file changed since this plan was written, compare the "Current state"
> excerpt against the live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `219c3c4`, 2026-07-16

## Why this matters

Editing an assigned amount on the budget screen does two writes: an optimistic
spreadsheet update (instant UI) and the durable CRDT write
(`setBudgetAmount`). The CRDT write is fire-and-forgotten — if it rejects
(DB closed mid-edit, clock error), the rejection is unhandled and the UI keeps
showing a number that was never persisted and will never sync. The three
sibling screens (`AssignMoneyScreen`, `CoverSourceScreen`,
`EditCategoryScreen`) all `await` the same call; this one is an oversight.

## Current state

- `src/screens/budget/BudgetScreen/index.tsx` lines 30–38 (verbatim):

```ts
// Persist an edited assigned amount: update the spreadsheet for instant UI,
// then setBudgetAmount for the CRDT/undoable write.
const commit = useCallback(
  (catId: string, cents: number) => {
    getSpreadsheet().setByName(sheet, envelopeBudget.catBudgeted(catId), cents);
    setBudgetAmount(month, catId, cents);
  },
  [sheet, month],
);
```

- `commit` is called from `onPressRow` (switching rows mid-edit) and
  `closeEditing` — both are synchronous UI callbacks; they must NOT start
  awaiting in a way that delays the UI state updates that follow them.
- Error-surface convention in this repo: errors are emitted to the error bus
  via `emitErrorEvent` from `@/core/errors` (see usages across
  `src/services/`); there are no global toasts — console + Sentry via
  `ErrorChannelConsumer`. Match that.
- `setBudgetAmount(month, categoryId, amount)` is
  `src/core/domain/budgets/index.ts:722`, an `undoable(async ...)`.

## Commands you will need

| Purpose   | Command                                               | Expected            |
| --------- | ----------------------------------------------------- | ------------------- | -------------- |
| Typecheck | `npx tsc --noEmit 2>&1                                | grep -c "error TS"` | `5` (baseline) |
| Lint      | `npm run lint`                                        | exit 0              |
| Format    | `npx oxfmt src/screens/budget/BudgetScreen/index.tsx` | exit 0              |

## Scope

**In scope**: `src/screens/budget/BudgetScreen/index.tsx` only.

**Out of scope**: `setBudgetAmount` itself; the sibling screens; the
spreadsheet optimistic-write mechanism; adding UI (dialogs/toasts).

## Git workflow

- Conventional commit, e.g. `fix(budget): handle setBudgetAmount rejection in inline edit commit`.
- **Never add AI attribution lines to commits.**
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Attach rejection handling without changing callback timing

Keep `commit` synchronous (the callers set state right after it), but handle
the promise:

```ts
const commit = useCallback(
  (catId: string, cents: number) => {
    getSpreadsheet().setByName(sheet, envelopeBudget.catBudgeted(catId), cents);
    setBudgetAmount(month, catId, cents).catch((err) => {
      // The optimistic cell now lies — surface the failure; the next
      // spreadsheet recompute from DB will restore the real value.
      emitErrorEvent(err instanceof Error ? err : new Error(String(err)));
    });
  },
  [sheet, month],
);
```

Import `emitErrorEvent` from the same module the services use (find it:
`grep -rn "emitErrorEvent" src/services | head -3` and copy that import path).

**Verify**: `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `5`.

### Step 2: Lint/format

**Verify**: `npm run lint` → exit 0; `npx oxfmt src/screens/budget/BudgetScreen/index.tsx` → exit 0.

## Test plan

No new unit test (screen-level, no component test infra). The regression
guard is the typecheck + the pattern being identical to the awaited siblings.
If plan 005 (budget mutation tests) has landed, its tests cover
`setBudgetAmount` behavior itself.

## Done criteria

- [ ] `grep -A2 "setBudgetAmount(month, catId, cents)" src/screens/budget/BudgetScreen/index.tsx` shows a `.catch(` handler
- [ ] tsc error count still 5; lint exit 0
- [ ] Only the one in-scope file modified
- [ ] `plans/README.md` status row updated

## STOP conditions

- The `commit` callback no longer matches the excerpt (drift — e.g. someone
  already made it async).
- `emitErrorEvent` doesn't exist under `src/core/errors`/services imports
  (error bus was renamed) — report the current error-surface API instead of
  inventing one.

## Maintenance notes

- If inline editing later gets a rollback UX (restore previous cell value on
  failure), do it here: the `.catch` is the hook point; `setByName` with the
  previous cents restores the optimistic cell.
- Reviewer: confirm `onPressRow`/`closeEditing` still run their state updates
  synchronously after `commit` (no added `await`).
