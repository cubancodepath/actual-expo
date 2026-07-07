// Verbatim from actual/packages/loot-core/migrations/1780606215001_add_performance_indexes.sql
export default `BEGIN TRANSACTION;

CREATE INDEX IF NOT EXISTS idx_transactions_acct_tombstone ON transactions(acct, tombstone);
CREATE INDEX IF NOT EXISTS idx_transactions_schedule ON transactions(schedule);

COMMIT;
`;
