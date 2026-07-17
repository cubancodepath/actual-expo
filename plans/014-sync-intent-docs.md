# Plan 014: Bring the intent docs back in line with the code (CLAUDE.md + feature-roadmap.md)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 219c3c4..HEAD -- CLAUDE.md docs/feature-roadmap.md ARCHITECTURE.md`
> Heavy edits to these files since 219c3c4 → re-verify each claim below
> before writing; on contradiction, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (docs only)
- **Depends on**: none (012 also edits CLAUDE.md — coordinate; run 012 first
  or fold its Maestro lines into this edit and mark 012's Step 2 done)
- **Category**: docs
- **Planned at**: commit `219c3c4`, 2026-07-16

## Why this matters

Two intent docs actively mislead:

1. **CLAUDE.md** (the first file agents load) still describes the
   PRE-migration architecture as current: `design-system/` as "single source
   of truth for UI", extraction target `features/*/screens/`, theming via
   `useTheme()`/`useThemedStyles`. ARCHITECTURE.md — which CLAUDE.md itself
   defers to in a banner — mandates the opposite (screens-first, heroui-native
   - Uniwind, no new `@/design-system`/`@/features` imports). An agent
     following CLAUDE.md's "Key Patterns" writes NEW legacy code.
2. **docs/feature-roadmap.md** lists as "Pendiente" things that shipped: the
   rules screen (`app/(auth)/settings/rules.tsx`, 188 lines, view+delete) and
   the reports dashboard (`app/(auth)/(tabs)/(reports)/index.tsx` renders
   NetWorthCard, CashFlowCard, SpendingByCategoryCard, SavingsRateCard,
   AgeOfMoneyCard, BudgetProgressCard). A planner reading it would rebuild
   existing features.

Wrong docs are worse than no docs; both files are load-bearing for agents.

## Current state

- `CLAUDE.md` sections needing rewrite (verify each against the live file):
  - "Source Layout" tree: presents `design-system/` ("single source of truth"),
    `features/`, `components/`, `hooks/` as the canonical layout; carries a
    banner deferring to ARCHITECTURE.md but the body contradicts it.
  - "Architecture Rules" 2/4/5: reference features→design-system direction and
    `features/*/screens/` as the route-extraction target.
  - "Key Patterns" → "Theme system": prescribes `useTheme()` +
    `useThemedStyles` (legacy); the migrated stack uses heroui-native tokens
    via Uniwind classes + `useThemeColor`, themed by `global.css`.
  - "Modals" / "Icons" bullets: partially stale (Ionicons/`Icon` atom vs the
    migrated screens' `lucide-react-native`).
- `ARCHITECTURE.md` — the source of truth to align WITH (read fully before
  writing; its "Estructura objetivo", "Dirección de dependencias",
  "Guardarraíles" and "Decisiones tomadas" sections provide the wording).
- `docs/feature-roadmap.md`:
  - Line ~21: "[ ] Pantalla de rules (read-only en Settings)" → shipped
    (and it's view+DELETE, more than read-only).
  - Lines ~74-78: report charts pending → six cards shipped.
  - Keep genuinely-pending items: rules-on-sync, OFX/CSV import,
    onBudget/offBudget conditions, recurring-date conditions,
    template/formula actions, export.

## Commands you will need

| Purpose         | Command                                                                      | Expected                |
| --------------- | ---------------------------------------------------------------------------- | ----------------------- |
| Claim check     | `ls "app/(auth)/settings/rules.tsx" "app/(auth)/(tabs)/(reports)/index.tsx"` | both exist              |
| No code touched | `git status`                                                                 | only .md files modified |

## Scope

**In scope**: `CLAUDE.md`, `docs/feature-roadmap.md`.

**Out of scope**: ARCHITECTURE.md (already correct), any source file, other
docs/ files (PARITY-PLAN etc. — they are historical records, not live intent).

## Git workflow

- Conventional commit: `docs: align CLAUDE.md with screens-first architecture and reconcile roadmap with shipped features`.
- **Never add AI attribution lines to commits.**
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Rewrite CLAUDE.md's structural sections

Rewrite "Source Layout" to present the ARCHITECTURE.md target as current
direction: `src/core` (unchanged), `src/screens/<domain>/<Screen>/` (screen
bodies + domain hooks/components), `src/ui/` (cross-domain custom pieces:
Money, ScreenHeader, amount-keyboard, PickerScreen, feedback/), `src/stores`,
`src/services`, `src/lib`, `src/i18n` — and mark `src/features/` +
`src/design-system/` explicitly as LEGACY being strangled ("do not add new
imports; touched files move to their destination"). Update Architecture
Rules to the dependency direction from ARCHITECTURE.md
(`app → screens → (ui|stores|lib|services) → core`) and name
`scripts/check-arch.sh` as enforcement. Replace the "Theme system" pattern
with: heroui-native components + Uniwind `className` (tokens from
`global.css` / DESIGN.md), `useThemeColor("...")` for imperative colors;
icons: `lucide-react-native` on migrated screens. Keep commands/bootstrap/sync
sections as they are (they are accurate) except anything plan 012 removed.

**Verify**: `grep -n "single source of truth" CLAUDE.md` → 0 matches;
`grep -c "screens-first\|src/screens" CLAUDE.md` → ≥2.

### Step 2: Reconcile the roadmap

In `docs/feature-roadmap.md`: move the rules screen to "Completado" (noting
it ships view+delete; edit/create still open). In the reports section, mark
the six shipped cards as completed and re-scope the pending list to what is
actually missing (export, anything the cards don't cover — verify by reading
`app/(auth)/(tabs)/(reports)/index.tsx` imports). Do not delete pending items
that remain genuinely pending.

**Verify**: `grep -n "Pantalla de rules" docs/feature-roadmap.md` shows it
under a "Completado" heading (check with `sed -n` around the match).

### Step 3: Cross-check

Re-read both edited files start-to-finish for internal contradictions
(e.g. a Key Pattern still naming a deleted module).

**Verify**: `git status` → only the two .md files modified.

## Test plan

None (docs). The "tests" are the grep-based verifications above.

## Done criteria

- [ ] CLAUDE.md no longer calls design-system the source of truth and
      documents screens-first + heroui as current
- [ ] Roadmap reflects shipped rules screen + report cards
- [ ] Only the two files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

- ARCHITECTURE.md and the code disagree on something you must document (e.g.
  a rule the code systematically violates) — report the discrepancy rather
  than picking a side in the docs.
- The reports/rules files don't exist at the stated paths (drift).

## Maintenance notes

- CLAUDE.md is the highest-leverage doc for agent sessions: whoever finishes
  a migration phase should update it in the same PR (suggest adding that to
  ARCHITECTURE.md's guardrails section — a one-line follow-up).
- Reviewer: check no COMMAND in CLAUDE.md was altered (they are correct today,
  except the Maestro lines owned by plan 012).
