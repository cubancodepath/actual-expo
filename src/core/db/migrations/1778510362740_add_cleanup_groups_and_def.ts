// Verbatim from actual/packages/loot-core/migrations/1778510362740_add_cleanup_groups_and_def.sql
export default `BEGIN TRANSACTION;

ALTER TABLE categories ADD COLUMN cleanup_def TEXT DEFAULT NULL;

CREATE TABLE cleanup_groups
  (id TEXT PRIMARY KEY,
   name TEXT NOT NULL,
   tombstone INTEGER DEFAULT 0);

COMMIT;
`;
