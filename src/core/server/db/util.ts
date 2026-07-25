// Faithful port of the `whereIn` helper from loot-core src/server/db/util.ts.
// Used by the grouped-splits transactions executor.
export function whereIn(ids: string[], field: string) {
  const ids2 = [...new Set(ids)];

  const filter = `${field} IN (` + ids2.map((id) => `'${id}'`).join(",") + ")";
  return filter;
}
