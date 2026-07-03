#!/bin/bash
#
# Architecture guardrail — enforces the dependency direction:
#   app → features → components|hooks|stores → core
# and forbids inversions. Wired into the husky pre-commit hook.
#
# HARD FAILS (block the commit):
#   1. src/core imports UI (@/features, @/components, @/design-system) — core must stay
#      pure logic, testable in Node. Test files are exempt.
#   2. src/components imports @/features — shared components must not depend on features.
#
# WARNINGS (do not block):
#   - src/core imports @/stores — known port compromise (prefs read from the store
#     directly instead of being threaded through; see docs/architecture-differences).
#   - "fat" route files in app/ (> 120 lines) — routes should stay thin (see Fase 2).
#
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

fail=0

# 1. core must not import UI layers (exclude test files)
core_ui=$(grep -rln "from ['\"]@/\(features\|components\|design-system\)" src/core --include='*.ts*' 2>/dev/null | grep -v '\.test\.' || true)
if [ -n "$core_ui" ]; then
  echo "ARCH FAIL: src/core imports UI (features/components/design-system):"
  echo "$core_ui" | sed 's/^/  - /'
  fail=1
fi

# 2. components must not import features
comp_feat=$(grep -rln "from ['\"]@/features" src/components --include='*.ts*' 2>/dev/null || true)
if [ -n "$comp_feat" ]; then
  echo "ARCH FAIL: src/components imports @/features:"
  echo "$comp_feat" | sed 's/^/  - /'
  fail=1
fi

# WARN: core importing stores (known debt)
core_stores=$(grep -rln "from ['\"]@/stores" src/core --include='*.ts*' 2>/dev/null | grep -v '\.test\.' || true)
if [ -n "$core_stores" ]; then
  echo "ARCH WARN: src/core imports @/stores (known port compromise):"
  echo "$core_stores" | sed 's/^/  · /'
fi

# WARN: fat routes (Fase 2 target: extract into features/*/screens/). Summarized to
# avoid noise — full list: find app -name '*.tsx' | xargs wc -l | sort -rn
fat=$(find app -name '*.tsx' 2>/dev/null | while IFS= read -r f; do
  n=$(wc -l < "$f"); [ "$n" -gt 120 ] && echo "$n $f"
done | sort -rn)
if [ -n "$fat" ]; then
  count=$(echo "$fat" | wc -l | tr -d ' ')
  echo "ARCH WARN: $count fat route(s) > 120 lines (target: features/*/screens/). Top 5:"
  echo "$fat" | head -5 | awk '{printf "  · %s lines  %s\n", $1, $2}'
fi

exit $fail
