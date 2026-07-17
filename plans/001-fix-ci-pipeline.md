# Plan 001: Make CI green and complete (pnpm install, fix the red test, add lint/fmt/arch gates)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 219c3c4..HEAD -- .github/workflows/pr-check.yml src/core/domain/schedules/schedule.test.ts src/features/transactions/hooks/transactionList/types.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `219c3c4`, 2026-07-16

## Why this matters

Every CI run on this repo currently fails in ~10 seconds: the workflow uses
`npm ci` and `cache: npm`, but the repo migrated to pnpm and has only
`pnpm-lock.yaml` — `actions/setup-node` aborts with "Dependencies lock file is
not found". Neither the typecheck nor the test job has executed for weeks, so
regressions land on `develop` with zero automated signal. Additionally, one
unit test is known-red (`buildListData` empty+previews case), so even after
fixing the install, the suite would stay red and train everyone to ignore CI.
This plan makes CI green AND meaningful (adds lint, format, and the
architecture guardrail that today only run in bypassable local hooks).

## Current state

- `.github/workflows/pr-check.yml` — two jobs (`type-check`, `test`), both broken:

```yaml
# .github/workflows/pr-check.yml (current, abridged)
jobs:
  type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm # ← fails: no npm lockfile exists
      - run: npm ci # ← never reached
      - name: Type check
        run: npx tsc --noEmit
  test:
    # identical setup, then: npx vitest run
```

- The repo's lockfile is `pnpm-lock.yaml` (no `package-lock.json`,
  no `yarn.lock`). `package.json` contains a `pnpm.onlyBuiltDependencies` block.
- Local hooks: `.husky/pre-commit` runs `bash scripts/check-arch.sh` and
  `npx lint-staged`. `.husky/pre-push` exists but is empty. CI runs neither
  lint (`oxlint`), format check (`oxfmt --check`), nor `scripts/check-arch.sh`.
- The red test — `src/core/domain/schedules/schedule.test.ts:488-500`:

```ts
it("empty transactions + previews → header + date-grouped previews only", () => {
  const items = buildListData([], {
    previewTransactions: previews,
    upcomingExpanded: true,
  });
  // header + 2 date headers + 2 upcoming items = 5
  expect(items).toHaveLength(5);   // ← FAILS: actual length is 6
  expect(items[0].type).toBe("upcoming-header");
  ...
```

The system under test is `buildListData` in
`src/features/transactions/hooks/transactionList/types.ts` (imported by the
test at its top). It builds the item list for the account-transactions
LegendList (consumed by `app/(auth)/account/[id].tsx`). Some item type is
being emitted twice (or a new item type was added) in the
empty-transactions-with-previews path; the test predates it. You must
determine which side is correct (Step 3).

- **IMPORTANT baseline**: `npx tsc --noEmit` exits NON-zero with exactly **5
  pre-existing errors**, all "cannot find module / type" errors in
  `app/(auth)/(tabs)/_layout.tsx`, `app/_layout.tsx`,
  `src/design-system/atoms/iconRegistry.ts`, `src/lib/screenOptions.ts`
  (missing ambient types for `sf-symbols-typescript`,
  `@react-navigation/native`, `@react-navigation/native-stack`). These are
  accepted baseline. The CI typecheck step must tolerate exactly this baseline
  (Step 4 handles it).

## Commands you will need

| Purpose       | Command                                                     | Expected on success                                   |
| ------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| Install       | `pnpm install`                                              | exit 0                                                |
| Typecheck     | `npx tsc --noEmit`                                          | exit 1 with exactly 5 pre-existing errors (see above) |
| Tests         | `npx vitest run`                                            | after Step 3: exit 0, 0 failures                      |
| One test file | `npx vitest run src/core/domain/schedules/schedule.test.ts` | after Step 3: all pass                                |
| Lint          | `npm run lint` (oxlint)                                     | exit 0 (warnings allowed)                             |
| Format        | `npm run fmt:check` (oxfmt)                                 | exit 0                                                |
| Arch          | `bash scripts/check-arch.sh`                                | exit 0 (WARN lines allowed)                           |

## Scope

**In scope** (the only files you should modify):

- `.github/workflows/pr-check.yml`
- `src/core/domain/schedules/schedule.test.ts` OR
  `src/features/transactions/hooks/transactionList/types.ts` (whichever Step 3
  determines is wrong — not both unless the fix requires it)
- `.husky/pre-push` (optional cleanup, Step 5)

**Out of scope** (do NOT touch, even though they look related):

- `package.json` scripts — do not rename or add scripts.
- The 5 pre-existing tsc errors / their files — do not install missing type
  packages or change tsconfig; that is separate work.
- Any other failing-looking test — if you find more than the one failure
  described here, STOP.

## Git workflow

- Branch: work directly on `develop` or `advisor/001-fix-ci` (ask operator if unclear).
- Conventional commits, e.g. `ci: run pipeline with pnpm and add lint/arch gates`,
  `fix(transactions): align buildListData empty+previews with expected layout`.
- **Never add AI attribution lines (no "Co-Authored-By: Claude" etc.) to commits.**
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Switch the workflow to pnpm

Rewrite `.github/workflows/pr-check.yml` so both existing jobs install with
pnpm. Target shape for the setup block of each job:

```yaml
- uses: actions/checkout@v4
- uses: pnpm/action-setup@v4 # reads pnpm version from packageManager or lockfile
- uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: pnpm
- run: pnpm install --frozen-lockfile
```

Replace `npm ci` with `pnpm install --frozen-lockfile` in both jobs. Keep
`npx tsc --noEmit` and `npx vitest run` as the run steps for now (Step 4
adjusts typecheck).

**Verify**: `npx --yes yaml-lint .github/workflows/pr-check.yml 2>/dev/null || python3 -c "import yaml,sys;yaml.safe_load(open('.github/workflows/pr-check.yml'));print('yaml ok')"` → `yaml ok`

### Step 2: Reproduce the red test locally

**Verify**: `npx vitest run src/core/domain/schedules/schedule.test.ts` →
output contains `1 failed` and the failure is
`empty transactions + previews → header + date-grouped previews only`
expecting length 5, receiving 6. If the failure count or case differs, STOP.

### Step 3: Fix the red test (determine which side is wrong)

1. Open `src/features/transactions/hooks/transactionList/types.ts` and find
   `buildListData`. Trace the branch taken when `transactions` is empty and
   `previewTransactions` is non-empty with `upcomingExpanded: true`.
2. Log or reason out the 6 items actually produced (the test failure output
   prints the array). Identify the extra item relative to the expected
   sequence `upcoming-header, upcoming-date, upcoming, upcoming-date, upcoming`.
3. Decide:
   - If the extra item is a **deliberate UI addition** (e.g. a section footer
     or an empty-state row added after the test was written, and it renders
     correctly in the account screen), update the test to assert the real
     6-item sequence, with a comment explaining the layout.
   - If the extra item is a **spurious duplicate** (same type+date emitted
     twice, or a `date` group header for a list with no transactions), fix
     `buildListData` so the empty+previews path emits exactly the 5 documented
     items, and leave the test as is.

**Verify**: `npx vitest run src/core/domain/schedules/schedule.test.ts` → all pass.
Then `npx vitest run` → exit 0, `0 failed`.

### Step 4: Make the CI typecheck step baseline-aware

`npx tsc --noEmit` exits 1 due to the 5 accepted pre-existing errors, which
would keep CI red. Change the type-check job's run step to compare against the
baseline count instead of requiring zero:

```yaml
- name: Type check (5 pre-existing module-resolution errors are baseline)
  run: |
    count=$(npx tsc --noEmit 2>&1 | grep -c "error TS" || true)
    echo "tsc errors: $count (baseline 5)"
    test "$count" -le 5
```

**Verify**: run the same shell snippet locally → prints `tsc errors: 5 (baseline 5)` and exits 0.

### Step 5: Add a lint job (oxlint + oxfmt + check-arch)

Append a third job to the workflow:

```yaml
lint:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
        cache: pnpm
    - run: pnpm install --frozen-lockfile
    - run: npm run lint
    - run: npm run fmt:check
    - run: bash scripts/check-arch.sh
```

Optionally delete the empty `.husky/pre-push` file (it is a no-op).

**Verify locally**: `npm run lint && npm run fmt:check && bash scripts/check-arch.sh` → all exit 0.

### Step 6: Full local dry run

**Verify**: `pnpm install --frozen-lockfile && npx vitest run` → install exit 0, tests 0 failed.

## Test plan

- No new test files. The deliverable is: the existing suite passes
  (`npx vitest run` → 0 failed) and the workflow file exercises install,
  typecheck (baseline-aware), tests, lint, format, and check-arch.
- If Step 3 changed `buildListData` (not the test), the existing test IS the
  regression test.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "npm ci" .github/workflows/pr-check.yml` → `0`
- [ ] `grep -c "pnpm install --frozen-lockfile" .github/workflows/pr-check.yml` → `3`
- [ ] `npx vitest run` exits 0 with 0 failures
- [ ] `npm run lint`, `npm run fmt:check`, `bash scripts/check-arch.sh` all exit 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] After push (if operator allows): `gh run list --limit 1` shows `success`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `npx vitest run` shows more than 1 failing test at Step 2 (the codebase has
  drifted; the extra failures need triage first).
- In Step 3 you cannot determine within the two named options why the 6th item
  exists (e.g. it's nondeterministic).
- The tsc error count differs from 5 before you make any change.
- `pnpm install --frozen-lockfile` fails locally (lockfile out of sync with
  package.json — that must be fixed by the operator, not by regenerating).

## Maintenance notes

- When the 5 baseline tsc errors are eventually fixed (by installing the
  missing type packages), tighten Step 4's threshold to `test "$count" -eq 0`.
- Anyone adding a CI job must copy the pnpm setup block, not `npm ci`.
- Deferred: caching the pnpm store beyond setup-node's default. (Maestro E2E
  is being removed entirely — plan 012 — so no E2E job is planned.)
