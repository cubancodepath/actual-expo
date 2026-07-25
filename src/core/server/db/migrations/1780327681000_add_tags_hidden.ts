// Verbatim from actual/packages/loot-core/migrations/1780327681000_add_tags_hidden.sql
export default `BEGIN TRANSACTION;

ALTER TABLE tags ADD COLUMN hidden BOOLEAN DEFAULT 0;

COMMIT;
`;
