// Verbatim from actual/packages/loot-core/migrations/1780099200000_add_show_trend_lines_report_setting.sql
export default `BEGIN TRANSACTION;

ALTER TABLE custom_reports ADD COLUMN show_trend_lines INTEGER DEFAULT 0;

COMMIT;
`;
