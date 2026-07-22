# Plan 014: Index spreadsheet cell subscriptions by cell name (kill the O(subscribers × changed-cells) scan)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cab6621..HEAD -- src/core/domain/spreadsheet/ src/hooks/useSheetValue.ts`
> If any changed since this plan was written, compare the "Current state"
> excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — the budget screen's every cell renders through this
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `cab6621`, 2026-07-19

## Why this matters

Every mounted budget cell subscribes via `useSheetValue`, whose listener runs
`changedNames.includes(resolved)` on **every** spreadsheet notification. The
budget screen mounts all categories simultaneously (non-virtualized accordion),
and each row subscribes to several cells (budgeted/spent/balance/goal). On a
structural recompute (month switch, `recomputeAll`) the changed-cell list is
large, so total work is O(subscribers × changed-cells) — a linear scan per
subscriber per notification, concentrated exactly on the interactions users do
most (month navigation, first paint). A `Map<cellName, Set<listener>>` dispatch
makes notification cost proportional to affected subscribers only.

## Current state

- `src/hooks/useSheetValue.ts:20-33`:

```ts
const [value, setValue] = useState<CellValue>(() => ss.getResolved(resolved));

useEffect(() => {
  setValue(ss.getResolved(resolved));
  return ss.onCellsChanged((changedNames) => {
    if (changedNames.includes(resolved)) {
      setValue(ss.getResolved(resolved));
    }
  });
}, [resolved, ss]);
```

- The spreadsheet engine lives in `src/core/domain/spreadsheet/` — find the
  `onCellsChanged` implementation (`grep -rn "onCellsChanged" src/core/domain/spreadsheet/`)
  and how notifications are fired after recomputes (`sync.ts` triggers,
  `recomputeAll` around `sync.ts:340`).
- The engine already has a prefix index for O(1) dependency matching (per
  docs/PARITY-PLAN.md) — this plan adds the analogous index on the
  _notification_ side.
- Non-virtualized budget list: `src/screens/budget/BudgetScreen/index.tsx:221-259`
  (kept as-is — see Out of scope).
- Existing spreadsheet tests: `ls src/core/domain/spreadsheet/__tests__/` —
  use as exemplars; PARITY-PLAN notes ~13+ tests exist here.

## Commands you will need

| Purpose   | Command                                      | Expected on success |
| --------- | -------------------------------------------- | ------------------- |
| Typecheck | `npx tsc --noEmit`                           | exit 0              |
| Focused   | `npx vitest run src/core/domain/spreadsheet` | all pass            |
| All tests | `npx vitest run`                             | 0 failures          |

## Scope

**In scope**:

- `src/core/domain/spreadsheet/` — the notification/subscription mechanism only
- `src/hooks/useSheetValue.ts` — switch to the keyed subscription API
- Tests under `src/core/domain/spreadsheet/__tests__/`

**Out of scope** (do NOT touch):

- Cell computation/recompute logic, bindings, the prefix dependency index.
- Virtualizing the budget ScrollView — separate decision; the accordion
  animation and inline-edit anchoring depend on mounted rows.
- Any other consumer of `onCellsChanged` beyond adapting it to the new API
  (enumerate first: `grep -rn "onCellsChanged" src/ app/`).

## Git workflow

- Conventional commit, e.g. `perf(spreadsheet): keyed cell subscriptions instead of per-listener scans`.
- **Never add AI-attribution or Co-Authored-By lines.** Do NOT push unless instructed.

## Steps

### Step 1: Map the current API surface

`grep -rn "onCellsChanged" src/ app/` — list every consumer. Expected: the
engine, `useSheetValue`, possibly a store or screen hook. If more than ~4
consumers exist, report the list before proceeding (blast radius check).

**Verify**: consumer list posted in your working notes/PR description.

### Step 2: Add a keyed subscription API to the engine

Alongside the existing broadcast (keep it working during the transition), add:

```ts
onCellChanged(name: string, listener: (value: CellValue) => void): () => void
```

backed by `Map<string, Set<listener>>`. In the notification path (where
`onCellsChanged` listeners are currently invoked with `changedNames`), also
iterate `changedNames` once and dispatch to the keyed sets — total cost
O(changedNames + affected listeners).

**Verify**: `npx vitest run src/core/domain/spreadsheet` → existing tests pass.

### Step 3: Engine tests for the keyed path

- subscribe to cell A; notify {A,B} → listener fires once with A's value.
- subscribe to A; notify {B} → no fire.
- unsubscribe → no fire; double-unsubscribe safe.
- two listeners on one cell → both fire.

**Verify**: `npx vitest run src/core/domain/spreadsheet` → all pass, new tests included.

### Step 4: Switch `useSheetValue`

Replace the broadcast subscription with `ss.onCellChanged(resolved, setValue)`
(preserving the initial `setValue(ss.getResolved(resolved))` on mount/re-key).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 5: Migrate or keep remaining broadcast consumers

For each Step-1 consumer: if it watches specific cells, migrate; if it genuinely
needs "anything changed" semantics, leave it on the broadcast API. Do NOT delete
`onCellsChanged` if any consumer remains.

**Verify**: `npx vitest run` → 0 failures; `npm run lint` → exit 0.

## Test plan

Step 3, plus existing spreadsheet suite green, plus manual PR note: "budget
screen month-switch feels equal or snappier; values update on edit."

## Done criteria

- [ ] `grep -n "changedNames.includes" src/hooks/useSheetValue.ts` → no match
- [ ] Keyed-dispatch tests pass; `npx vitest run` exits 0; `npx tsc --noEmit` exits 0
- [ ] `onCellsChanged` broadcast retained only if a consumer still needs it (state which in the PR)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The notification path turns out to already be keyed (audit finding wrong) —
  STOP and report; nothing to do.
- `resolved` names in `useSheetValue` are not stable strings per cell (dynamic
  per render) — the Map would leak; report the naming scheme you found.
- More than 4 broadcast consumers found in Step 1.

## Maintenance notes

- New spreadsheet consumers should use `onCellChanged(name, …)`; the broadcast
  API is for whole-sheet observers only. If the budget list is ever virtualized,
  this index also caps subscribe/unsubscribe churn cost during scroll.
