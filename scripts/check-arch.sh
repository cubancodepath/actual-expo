#!/bin/bash
#
# Architecture guardrail — enforces the dependency direction (see ARCHITECTURE.md):
#   app → screens → (ui | stores | lib | services) → core
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
#
# WARNINGS (do not block):
#   - src/core imports @/stores or @/services — known port compromises (prefs read from
#     the store; sync posts over HTTP; see docs/architecture-differences).
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

# 2. shared UI must not import screens/features
for dir in src/ui src/components; do
  [ -d "$dir" ] || continue
  ui_up=$(grep -rln "from ['\"]@/\(screens\|features\)" "$dir" --include='*.ts*' 2>/dev/null || true)
  if [ -n "$ui_up" ]; then
    echo "ARCH FAIL: $dir imports @/screens or @/features:"
    echo "$ui_up" | sed 's/^/  - /'
    fail=1
  fi
done

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

# WARN: core importing stores/services (known debt)
core_impure=$(grep -rln "from ['\"]@/\(stores\|services\)" src/core --include='*.ts*' 2>/dev/null | grep -v '\.test\.' || true)
if [ -n "$core_impure" ]; then
  echo "ARCH WARN: src/core imports @/stores or @/services (known port compromise):"
  echo "$core_impure" | sed 's/^/  · /'
fi

# WARN: fat routes (target: extract into src/screens/). Summarized to avoid noise —
# full list: find app -name '*.tsx' | xargs wc -l | sort -rn
fat=$(find app -name '*.tsx' 2>/dev/null | while IFS= read -r f; do
  n=$(wc -l < "$f"); [ "$n" -gt 120 ] && echo "$n $f"
done | sort -rn)
if [ -n "$fat" ]; then
  count=$(echo "$fat" | wc -l | tr -d ' ')
  echo "ARCH WARN: $count fat route(s) > 120 lines (target: src/screens/). Top 5:"
  echo "$fat" | head -5 | awk '{printf "  · %s lines  %s\n", $1, $2}'
fi

exit $fail
