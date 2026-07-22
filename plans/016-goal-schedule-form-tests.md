# Plan 016: Tests for the goals-editor and schedule-form input/validation glue

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cab6621..HEAD -- src/screens/budget/EditGoalsScreen/ src/screens/schedules/`
> If in-scope files changed since this plan was written, compare the "Current
> state" against the live code; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (additive)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `cab6621`, 2026-07-19

## Why this matters

The goals _engine_ (`src/core/domain/goals/`, 47+ tests) and schedules _domain_
(recurrence, next-date logic) are well covered — but the recently shipped UI
layers that translate user input INTO those engines are not: the goals editor's
validation schema and edit-session logic, and the schedule form provider, have
**zero test files**. A bad edit can write a malformed goal template or schedule
that the (tested) engine then faithfully mis-executes. The gap is the
input/validation glue, which is mostly pure functions — cheap to test without
rendering React Native.

## Current state

- `src/screens/budget/EditGoalsScreen/validation/goalForm.schema.ts` — Zod (v4)
  validation schema for the goal form. No tests.
- `src/screens/budget/EditGoalsScreen/hooks/useGoalEditSession.ts` — edit-session
  hook (diff/apply between form state and stored goal). No tests.
- `src/screens/budget/EditGoalsScreen/hooks/useGoalAutomationsQuery.ts` — query
  hook; only pure helpers inside it (if any) are in scope.
- `src/screens/schedules/` — includes
  `ScheduleDetailScreen/context/ScheduleFormProvider.tsx` (TanStack Form). No
  tests anywhere under `src/screens/schedules/` (verified via `find`).
- Repo form convention (memory + code): forms derive from the route
  (formId + defaultValues), never imperative reset between screens — respect
  this when extracting testables.
- Test infra: vitest, Node environment. There is NO React Native
  component-testing setup — test **pure functions and reducers only**; do not
  add rendering libraries.
- Engine exemplars for style: `src/core/domain/goals/*.test.ts`.

## Commands you will need

| Purpose   | Command                                                                   | Expected on success |
| --------- | ------------------------------------------------------------------------- | ------------------- |
| Typecheck | `npx tsc --noEmit`                                                        | exit 0              |
| Focused   | `npx vitest run src/screens/budget/EditGoalsScreen src/screens/schedules` | all pass            |
| All tests | `npx vitest run`                                                          | 0 failures          |

## Scope

**In scope**:

- `src/screens/budget/EditGoalsScreen/validation/__tests__/goalForm.schema.test.ts` (create)
- `src/screens/budget/EditGoalsScreen/hooks/__tests__/goalEditSession.test.ts` (create)
- `src/screens/schedules/**/__tests__/*` (create, for extracted pure logic)
- MINIMAL extraction refactors: moving a pure function out of a hook/component
  body into a colocated `*.logic.ts` file so it's importable — allowed only
  when behavior-preserving (pure cut-paste + import updates).

**Out of scope** (do NOT touch):

- Any behavior change to validation rules or session logic — if a test reveals a
  wrong rule, pin current behavior and report it.
- Rendering/component tests; new dev dependencies.
- `src/core/domain/goals/` and `src/core/domain/schedules/` (already tested).

## Git workflow

- Conventional commit, e.g. `test(goals,schedules): cover form validation and edit-session logic`.
- **Never add AI-attribution or Co-Authored-By lines.** Do NOT push unless instructed.

## Steps

### Step 1: goalForm.schema tests

Read the schema; write a test per branch: valid minimal input per goal type;
each rejection path (missing required field, negative/zero amounts where
disallowed, invalid date combos); boundary values. Assert on Zod
`safeParse().success` and error paths.

**Verify**: `npx vitest run src/screens/budget/EditGoalsScreen` → pass.

### Step 2: goal edit-session logic

Read `useGoalEditSession.ts`. Identify its pure core (initial-state derivation
from a stored goal, dirty-diff computation, the payload built on save). If that
logic is inline in the hook, extract to
`hooks/goalEditSession.logic.ts` (pure move) and test: round-trip (stored goal →
form state → save payload preserves semantics), each editable field diffs
correctly, no-op edit produces empty/none diff.

**Verify**: `npx vitest run src/screens/budget/EditGoalsScreen` → pass; `npx tsc --noEmit` → exit 0.

### Step 3: schedule form logic

Read `ScheduleFormProvider.tsx` and sibling files under
`src/screens/schedules/`. Test the extractable pure parts: default-values
derivation from a schedule row, field→`RecurConfig`/conditions mapping used on
save, and validation guards. Same extraction rule as Step 2.

**Verify**: `npx vitest run src/screens/schedules` → pass.

### Step 4: Full-suite regression

**Verify**: `npx vitest run` → 0 failures; `npm run lint` → exit 0.

## Test plan

Steps 1–3, ~15–25 tests total. Style exemplar: `src/core/domain/goals/parse.test.ts`
(if that exact file is absent, any `src/core/domain/goals/*.test.ts`).

## Done criteria

- [ ] Schema tests + session-logic tests + schedule-logic tests exist and pass
- [ ] Extractions (if any) are pure moves — behavior identical, `npx vitest run` exits 0
- [ ] `npx tsc --noEmit` exits 0; `npm run lint` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- The hooks' logic is so interwoven with TanStack Form/React state that
  extraction is not behavior-preserving-obvious — test what IS pure and report
  the untestable remainder rather than restructuring the hook.
- A validation rule appears wrong (e.g. accepts a nonsensical goal) — pin it,
  name the test `"KNOWN-ODD: …"`, and report.

## Maintenance notes

- New goal types or schedule fields must extend these suites — reviewers should
  reject schema changes without a matching test.
- If RN component testing is ever added to the repo, the form providers are the
  first candidates.
