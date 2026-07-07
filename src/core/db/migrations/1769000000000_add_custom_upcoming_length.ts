// Verbatim from actual/packages/loot-core/migrations/1769000000000_add_custom_upcoming_length.sql
export default `BEGIN TRANSACTION;

ALTER TABLE schedules ADD COLUMN custom_upcoming_length TEXT DEFAULT NULL;

COMMIT;
`;
