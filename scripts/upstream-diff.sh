#!/bin/bash
#
# upstream-diff.sh — show what changed in Actual's loot-core between the commit
# src/core was last reconciled against (UPSTREAM_VERSION) and a newer tag/commit.
# Cross the output against docs/upstream-map.md to decide what to port.
#
# Usage:  scripts/upstream-diff.sh <new-tag-or-commit> [--names|--patch]
#   (default shows a --stat summary of the areas src/core mirrors)
#
# Assumes the upstream repo is checked out at ../actual (sibling of this repo).
#
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

UPSTREAM_REPO="../actual"
NEW=${1:?"usage: upstream-diff.sh <new-tag-or-commit> [--names|--patch]"}
MODE=${2:---stat}
BASE=$(tr -d '[:space:]' < UPSTREAM_VERSION)

if [ ! -d "$UPSTREAM_REPO/.git" ]; then
  echo "error: upstream repo not found at $UPSTREAM_REPO" >&2
  exit 1
fi

# Paths in loot-core that src/core is a port of (see docs/upstream-map.md).
PATHS=(
  packages/loot-core/src/server
  packages/loot-core/src/shared
  packages/loot-core/src/types/models
  packages/loot-core/migrations
)

case "$MODE" in
  --names) GITMODE="--name-only" ;;
  --patch) GITMODE="-p" ;;
  *)       GITMODE="--stat" ;;
esac

echo "Upstream diff: $BASE..$NEW  (in $UPSTREAM_REPO)"
echo "Areas mirrored by src/core — cross-reference docs/upstream-map.md:"
echo

git -C "$UPSTREAM_REPO" diff "$BASE".."$NEW" $GITMODE -- "${PATHS[@]}"

echo
echo "Migrations added since $BASE:"
git -C "$UPSTREAM_REPO" diff "$BASE".."$NEW" --name-only --diff-filter=A -- \
  packages/loot-core/migrations | sed 's/^/  + /'
echo
echo "Next: for each relevant change, port it with a test, then bump UPSTREAM_VERSION"
echo "and update docs/upstream-map.md + docs/upstream-sync.md. See that checklist."
