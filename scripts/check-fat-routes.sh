#!/bin/bash
#
# Fat-route ratchet — app/ routes must stay thin re-exports of src/screens/
# (ARCHITECTURE.md § rutas finas). Not a dependency rule, so it lives outside
# dependency-cruiser: it counts lines, not imports.
#
# WARN below the cap, FAIL above it. Lower the cap as routes migrate; never raise it.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

max_fat=13

fat=$(find app -name '*.tsx' 2>/dev/null | while IFS= read -r f; do
  n=$(wc -l < "$f")
  [ "$n" -gt 120 ] && echo "$n $f"
done | sort -rn)

[ -z "$fat" ] && exit 0

count=$(echo "$fat" | wc -l | tr -d ' ')
echo "ARCH WARN: $count fat route(s) > 120 lines (target: src/screens/). Top 5:"
echo "$fat" | head -5 | awk '{printf "  · %s lines  %s\n", $1, $2}'

if [ "$count" -gt "$max_fat" ]; then
  echo "ARCH FAIL: fat route count ($count) exceeds ratchet cap ($max_fat)."
  exit 1
fi
exit 0
