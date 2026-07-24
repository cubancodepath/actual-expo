#!/bin/bash
#
# Architecture guardrail — enforces the dependency direction (see ARCHITECTURE.md):
#   app → screens → (ui | stores | lib) → core
# Stores are pure state slices; cross-store orchestration lives in
# src/stores/operations/ (Zustand equivalent of Redux thunks). Side effects
# live in core/server (transport/handlers) + core/platform (native seams).
# No services/.
# Legacy layers (features/, components/, design-system/) still exist during the
# strangler migration and are held to the same rules. Wired into husky pre-commit.
#
# HARD FAILS (block the commit):
#   1. src/core imports UI (@/screens, @/ui, @/features, @/components, @/design-system)
#      — core must stay pure logic, testable in Node. Test files are exempt.
#   2. src/ui or src/components imports @/screens or @/features — shared UI must not
#      depend on screens.
#   3. A screen imports from another domain's screens (src/screens/<a> → @/screens/<b>)
#      — cross-domain code must live in ui/, lib/ or stores/.
#   4. src/core imports React-ecosystem packages (react, react-native, @tanstack/*,
#      zustand, heroui-native, uniwind, expo-router) — react-query wiring lives in
#      src/lib/query/. expo-sqlite, expo-crypto, expo-file-system and expo-location stay allowed
#      (core's native deps, wrapped by src/core/platform/*).
#   5. src/core imports app-side lib modules (@/lib/errors, @/lib/query) — core only
#      THROWS typed ActualErrors; the error bus and react-query wiring are app-level.
#      Pure utils (@/lib/format, date, currencies) stay allowed.
#   6. A store file (src/stores/*.ts) imports another store — cross-store
#      orchestration must live in src/stores/operations/ (thunks). Keeps the
#      stores free of the module-init cycles the operations layer eliminated.
#      Exempt: operations/** (the orchestration layer), session.selectors.ts
#      (read-only composition), prefsStorage.ts (persistence adapter).
#
# WARNINGS (do not block):
#   - src/core imports @/stores — core must own its state (prefs/server-config);
#     this should find nothing now (kept as a guard).
#   - "fat" route files in app/ (> 120 lines) — routes must stay thin re-exports of
#     src/screens/ (ARCHITECTURE.md § rutas finas).
#
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

fail=0

# 1. core must not import UI layers (exclude test files)
core_ui=$(grep -rln "from ['\"]@/\(screens\|ui\|features\|components\|design-system\)" src/core --include='*.ts*' 2>/dev/null | grep -v '\.test\.' || true)
if [ -n "$core_ui" ]; then
  echo "ARCH FAIL: src/core imports UI (screens/ui/features/components/design-system):"
  echo "$core_ui" | sed 's/^/  - /'
  fail=1
fi

# 4. core must not import React-ecosystem packages (exclude test files)
core_react=$(grep -rln \
  -e "from ['\"]\(react\|react-native\|zustand\|heroui-native\|uniwind\|expo-router\)['\"/]" \
  -e "from ['\"]@tanstack/" \
  src/core --include='*.ts*' 2>/dev/null | grep -v '\.test\.' || true)
if [ -n "$core_react" ]; then
  echo "ARCH FAIL: src/core imports React-ecosystem packages (react/react-native/@tanstack/zustand/heroui-native/uniwind/expo-router):"
  echo "$core_react" | sed 's/^/  - /'
  fail=1
fi

# 5. core must not import app-side lib modules (bus/react-query wiring)
core_applib=$(grep -rln "from ['\"]@/lib/\(errors\|query\)" src/core --include='*.ts*' 2>/dev/null | grep -v '\.test\.' || true)
if [ -n "$core_applib" ]; then
  echo "ARCH FAIL: src/core imports @/lib/errors or @/lib/query (app-level wiring — core only throws):"
  echo "$core_applib" | sed 's/^/  - /'
  fail=1
fi

# 2. shared UI must not import screens/features
for dir in src/ui; do
  [ -d "$dir" ] || continue
  ui_up=$(grep -rln "from ['\"]@/\(screens\|features\)" "$dir" --include='*.ts*' 2>/dev/null || true)
  if [ -n "$ui_up" ]; then
    echo "ARCH FAIL: $dir imports @/screens or @/features:"
    echo "$ui_up" | sed 's/^/  - /'
    fail=1
  fi
done

# 2b. src/components/ was migrated to src/ui/ — it must not come back
if [ -d src/components ]; then
  echo "ARCH FAIL: src/components/ is legacy and was emptied into src/ui/ — do not recreate it."
  fail=1
fi

# 3. no cross-domain imports between screens
if [ -d src/screens ]; then
  for domain_dir in src/screens/*/; do
    domain=$(basename "$domain_dir")
    cross=$(grep -rn "from ['\"]@/screens/" "$domain_dir" --include='*.ts*' 2>/dev/null \
      | grep -v "@/screens/$domain/" || true)
    if [ -n "$cross" ]; then
      echo "ARCH FAIL: src/screens/$domain imports another domain's screens:"
      echo "$cross" | sed 's/^/  - /'
      fail=1
    fi
  done
fi

# 6. Legacy-import freeze: non-legacy code must not import @/features or @/design-system.
#    Grandfathered files (pre-freeze debt — REMOVE lines as they migrate, never add).
#    Includes app/ routes that thinly re-export not-yet-migrated legacy screens
#    (reports/spending/schedules/settings/onboarding — see CLAUDE.md screens/ layout):
legacy_allowlist="src/ui/feedback/ErrorBoundary.tsx
src/screens/auth/components/BudgetSetupWizard.tsx
src/screens/budget/components/BudgetListSkeleton.tsx
src/lib/screenOptions.ts
src/hooks/useSharedAmountInput.ts
src/hooks/useCursorBlink.tsx
src/hooks/useRefreshControl.ts
app/_layout.tsx
app/(auth)/_layout.tsx
app/(auth)/(tabs)/(accounts)/_layout.tsx
app/(auth)/(tabs)/(accounts)/index.tsx
app/(auth)/(tabs)/(budget)/_layout.tsx
app/(auth)/(tabs)/(reports)/_layout.tsx
app/(auth)/(tabs)/(reports)/index.tsx
app/(auth)/account/close.tsx
app/(auth)/account/new.tsx
app/(auth)/account/reconcile.tsx
app/(auth)/account/settings.tsx
app/(auth)/budget/edit-group.tsx
app/(auth)/budget/edit.tsx
app/(auth)/budget/hold.tsx
app/(auth)/budget/new-category.tsx
app/(auth)/budget/new-group.tsx
app/(auth)/budget/notes.tsx
app/(auth)/budget/quick-edit-category.tsx
app/(auth)/budget/reorder.tsx
app/(auth)/schedule/_layout.tsx
app/(auth)/schedule/new.tsx
app/(auth)/schedule/recurrence-custom.tsx
app/(auth)/schedule/recurrence.tsx
app/(auth)/schedules.tsx
app/(auth)/settings/_layout.tsx
app/(auth)/settings/budget.tsx
app/(auth)/settings/display.tsx
app/(auth)/settings/index.tsx
app/(auth)/settings/language.tsx
app/(auth)/settings/payees.tsx
app/(auth)/settings/rules.tsx
app/(auth)/transaction/_layout.tsx
app/(auth)/transaction/account-picker.tsx
app/(auth)/transaction/split-category-picker.tsx
app/(auth)/transaction/split.tsx
app/(auth)/transaction/tags.tsx
app/(public)/onboarding.tsx"
legacy_new=$(grep -rln "from ['\"]@/\(features\|design-system\)" \
  src/ui src/screens src/lib src/hooks src/stores app \
  --include='*.ts*' 2>/dev/null | grep -vxF "$legacy_allowlist" || true)
if [ -n "$legacy_new" ]; then
  echo "ARCH FAIL: new legacy imports (@/features|@/design-system) outside the grandfather list:"
  echo "$legacy_new" | sed 's/^/  - /'
  fail=1
fi

# 7. STORE FILES must not import sibling stores — cross-store orchestration
#    lives in src/stores/operations/ (thunks). Prevents the module-init cycles
#    the operations layer was created to eliminate. Exempt: operations/** (the
#    orchestration layer, checked recursively-excluded by the *.ts glob),
#    session.selectors.ts (read-only composition), prefsStorage.ts (the
#    persistence adapter — an allowed import target, matched out below).
store_cross=""
for f in src/stores/*.ts; do
  [ -e "$f" ] || continue
  case "$f" in
    src/stores/session.selectors.ts | src/stores/prefsStorage.ts) continue ;;
  esac
  hits=$(grep -nE "from ['\"](@/stores/|\./)|import\(['\"]@/stores/" "$f" 2>/dev/null \
    | grep -v "prefsStorage" || true)
  if [ -n "$hits" ]; then
    store_cross="${store_cross}${f}:
${hits}
"
  fi
done
if [ -n "$store_cross" ]; then
  echo "ARCH FAIL: store files import sibling stores (move orchestration to src/stores/operations/):"
  echo "$store_cross" | sed 's/^/  - /'
  fail=1
fi

# WARN: core importing stores (should be empty now) — static AND dynamic imports
core_impure=$(grep -rln \
  -e "from ['\"]@/stores" \
  -e "import(['\"]@/stores" \
  src/core --include='*.ts*' 2>/dev/null | grep -v '\.test\.' || true)
if [ -n "$core_impure" ]; then
  echo "ARCH WARN: src/core imports @/stores (known port compromise):"
  echo "$core_impure" | sed 's/^/  · /'
fi

# Fat-route ratchet: WARN below the cap, FAIL if the count exceeds it.
# lower this number as routes migrate; never raise it.
max_fat=25
fat=$(find app -name '*.tsx' 2>/dev/null | while IFS= read -r f; do
  n=$(wc -l < "$f"); [ "$n" -gt 120 ] && echo "$n $f"
done | sort -rn)
if [ -n "$fat" ]; then
  count=$(echo "$fat" | wc -l | tr -d ' ')
  echo "ARCH WARN: $count fat route(s) > 120 lines (target: src/screens/). Top 5:"
  echo "$fat" | head -5 | awk '{printf "  · %s lines  %s\n", $1, $2}'
  if [ "$count" -gt "$max_fat" ]; then
    echo "ARCH FAIL: fat route count ($count) exceeds ratchet cap ($max_fat)."
    fail=1
  fi
fi

exit $fail
