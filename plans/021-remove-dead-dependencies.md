# Plan 021: Remove dead dependencies (react-native-screen-transitions, react-dom, patch-package, eslint-plugin-i18next)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cab6621..HEAD -- package.json pnpm-lock.yaml`
> If package.json changed since this plan was written, re-run the Step 1 greps
> before proceeding.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW — each removal is individually verified and reversible
- **Depends on**: none
- **Category**: tech-debt (deps)
- **Planned at**: commit `cab6621`, 2026-07-19

## Why this matters

Four manifest entries are carried with zero wiring: `react-native-screen-transitions`
and `react-dom` have no import sites anywhere in `src/`, `app/`, or `modules/`
(and the app is iOS-only: `app.config.ts` declares `platforms: ["ios"]`);
`patch-package` is a devDependency with no `patches/` directory and no
postinstall wiring; `eslint-plugin-i18next` has no ESLint config to load it
(linting is oxlint). They add install time and supply-chain surface for zero
benefit — but each needs a config-level verification before removal, because a
grep of source misses build-tool references.

## Current state

Verified at `cab6621`:

- `package.json:93` `react-native-screen-transitions` — 0 references in src/app/modules/metro.config.js/app.config.ts/index.ts.
- `package.json:82` `react-dom` — 0 references (same scope). NOTE: React 19.2 +
  Expo SDK 55; some Expo tooling expects react-dom only for web — app is iOS-only.
- `package.json:116` (devDeps) `patch-package` — no `patches/` dir; `prepare`
  script is `husky`, no postinstall.
- `package.json:111` (devDeps) `eslint-plugin-i18next` — no `.eslintrc*` or
  `eslint.config.*` exists in the repo.
- Do **NOT** remove `@internationalized/date` / `@internationalized/number` —
  0 direct imports but they are peer deps of `heroui-native-pro`.

## Commands you will need

| Purpose   | Command                                                                     | Expected on success |
| --------- | --------------------------------------------------------------------------- | ------------------- |
| Install   | `pnpm install`                                                              | exit 0              |
| Typecheck | `npx tsc --noEmit`                                                          | exit 0              |
| All tests | `npx vitest run`                                                            | 0 failures          |
| Lint      | `npm run lint`                                                              | exit 0              |
| Bundle    | `npx expo export --platform ios --output-dir /tmp/claude/expo-export-check` | exit 0              |

## Scope

**In scope**:

- `package.json`, `pnpm-lock.yaml` (via pnpm commands only)

**Out of scope** (do NOT touch):

- `@internationalized/*` (peer deps — see above).
- Any source file. If a removal requires a source change, that dep is NOT dead — STOP.
- Native project dirs (`ios/`) — do not run prebuild.

## Git workflow

- Conventional commit, e.g. `chore(deps): remove unused dependencies`.
- **Never add AI-attribution or Co-Authored-By lines.** Do NOT push unless instructed.

## Steps

### Step 1: Re-verify each dep is unreferenced (config surface included)

For each of the four, run BOTH:

- `grep -rn "<dep-name>" src app modules index.ts app.config.ts metro.config.js eas.json vitest.config.ts tsconfig.json .oxlintrc.json .oxfmtrc.json 2>/dev/null`
- `grep -rn "<dep-name>" .github .husky 2>/dev/null`

Expected: 0 matches for all four. Additionally for `eslint-plugin-i18next`:
inspect `.oxlintrc.json` — oxlint can load some eslint plugins; if the config
references `i18next`, the dep is ALIVE (keep it, drop it from this plan, note it).

**Verify**: outputs pasted into the PR description.

### Step 2: Remove

`pnpm remove react-native-screen-transitions react-dom` and
`pnpm remove -D patch-package eslint-plugin-i18next`
(minus any dep Step 1 proved alive).

**Verify**: `pnpm install` → exit 0 with no peer-dependency warnings that name
the removed packages as MISSING peers of something still installed. If pnpm
reports e.g. "expo-router requires react-dom", reinstate `react-dom` and record
it in the plan's README row as partially done.

### Step 3: Full gates

**Verify**: `npx tsc --noEmit` → exit 0; `npx vitest run` → 0 failures;
`npm run lint` → exit 0; `npx expo export --platform ios --output-dir /tmp/claude/expo-export-check`
→ exit 0 (proves the Metro bundle resolves without the removed deps; delete the
output dir after).

## Test plan

No new tests; the gates in Step 3 (especially the export bundle) are the test.

## Done criteria

- [ ] The four deps absent from `package.json` (or the exceptions documented per Step 1/2)
- [ ] `pnpm install`, tsc, vitest, lint, and `expo export` all exit 0
- [ ] `git status` shows only `package.json` + `pnpm-lock.yaml`
- [ ] `plans/README.md` status row updated (noting any dep kept and why)

## STOP conditions

- Step 1 finds a reference for a dep this plan calls dead — keep that dep,
  remove it from the removal set, and note the reference location.
- `expo export` fails naming a removed package — reinstate that package and report.
- pnpm workspace hoisting means another workspace package needs one of these —
  check `pnpm why <dep>` before forcing.

## Maintenance notes

- `heroui-native-pro@1.0.0-beta.5` is an exact beta pin on the UI critical
  path — NOT removable, but tracked as a watch item in plans/README.md: bump to
  caret when 1.0.0 stable lands, with a UI smoke pass.
- Consider a quarterly `pnpm why` sweep for new carry-on deps.
