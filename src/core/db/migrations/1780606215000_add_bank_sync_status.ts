// Verbatim from actual/packages/loot-core/migrations/1780606215000_add_bank_sync_status.sql
export default `BEGIN TRANSACTION;

ALTER TABLE accounts ADD COLUMN bank_sync_status text;

COMMIT;
`;
