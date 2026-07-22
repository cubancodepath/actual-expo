import type { SQLiteDatabase } from "@/core/platform/sqlite";

import m1768872504000 from "./1768872504000_add_payee_locations";
import m1769000000000 from "./1769000000000_add_custom_upcoming_length";
import m1778510362740 from "./1778510362740_add_cleanup_groups_and_def";
import m1780099200000 from "./1780099200000_add_show_trend_lines_report_setting";
import m1780327681000 from "./1780327681000_add_tags_hidden";
import m1780606215000 from "./1780606215000_add_bank_sync_status";
import m1780606215001 from "./1780606215001_add_performance_indexes";

/**
 * A single Actual Budget migration.
 *
 * `up`:
 *   - `string` — SQL executed verbatim (mirrors upstream `.sql` migrations).
 *   - function — JS migration (mirrors upstream `.js` migrations, run from a
 *     static map instead of `eval` for CSP/RN safety).
 *   - `null` — folded into the base snapshot (`schema.ts`), the RN stand-in for
 *     upstream's pre-migrated `default-db.sqlite`. Everything at or before
 *     `SNAPSHOT_FREEZE_ID` is created by the snapshot, so its `up` is `null`.
 */
export type Migration = {
  id: number;
  /** "<id>_<slug>", identical to the upstream migration filename (sans extension). */
  name: string;
  up: string | ((db: SQLiteDatabase) => Promise<void>) | null;
};

/**
 * Freeze point: the last migration bundled into the base snapshot. It matches
 * upstream's last `.js` migration (`1765518577215_multiple_dashboards`), so the
 * port never has to reimplement any JavaScript migration — everything after the
 * freeze is plain SQL.
 */
export const SNAPSHOT_FREEZE_ID = 1765518577215;

/**
 * Every upstream migration in order, mirroring
 * `actual/packages/loot-core/migrations/`. Migrations at or before the freeze
 * are `up: null` (the snapshot creates their schema); later ones carry the real
 * SQL and are applied incrementally by the runner. Keep this 1:1 with upstream —
 * `schemaParity.test.ts` fails if it drifts.
 */
export const MIGRATIONS: Migration[] = [
  { id: 1548957970627, name: "1548957970627_remove-db-version", up: null },
  { id: 1550601598648, name: "1550601598648_payees", up: null },
  { id: 1555786194328, name: "1555786194328_remove_category_group_unique", up: null },
  { id: 1561751833510, name: "1561751833510_indexes", up: null },
  { id: 1567699552727, name: "1567699552727_budget", up: null },
  { id: 1582384163573, name: "1582384163573_cleared", up: null },
  { id: 1597756566448, name: "1597756566448_rules", up: null },
  { id: 1608652596043, name: "1608652596043_parent_field", up: null },
  { id: 1608652596044, name: "1608652596044_trans_views", up: null },
  { id: 1612625548236, name: "1612625548236_optimize", up: null },
  { id: 1614782639336, name: "1614782639336_trans_views2", up: null },
  { id: 1615745967948, name: "1615745967948_meta", up: null },
  { id: 1616167010796, name: "1616167010796_accounts_order", up: null },
  { id: 1618975177358, name: "1618975177358_schedules", up: null },
  { id: 1632571489012, name: "1632571489012_remove_cache", up: null },
  { id: 1679728867040, name: "1679728867040_rules_conditions", up: null },
  { id: 1681115033845, name: "1681115033845_add_schedule_name", up: null },
  { id: 1682974838138, name: "1682974838138_remove_payee_rules", up: null },
  { id: 1685007876842, name: "1685007876842_add_category_hidden", up: null },
  { id: 1686139660866, name: "1686139660866_remove_account_type", up: null },
  { id: 1688749527273, name: "1688749527273_transaction_filters", up: null },
  { id: 1688841238000, name: "1688841238000_add_account_type", up: null },
  { id: 1691233396000, name: "1691233396000_add_schedule_next_date_tombstone", up: null },
  { id: 1694438752000, name: "1694438752000_add_goal_targets", up: null },
  { id: 1697046240000, name: "1697046240000_add_reconciled", up: null },
  { id: 1704572023730, name: "1704572023730_add_account_sync_source", up: null },
  { id: 1704572023731, name: "1704572023731_add_missing_goCardless_sync_source", up: null },
  { id: 1707267033000, name: "1707267033000_reports", up: null },
  { id: 1712784523000, name: "1712784523000_unhide_input_group", up: null },
  { id: 1716359441000, name: "1716359441000_include_current", up: null },
  { id: 1720310586000, name: "1720310586000_link_transfer_schedules", up: null },
  { id: 1720664867241, name: "1720664867241_add_payee_favorite", up: null },
  { id: 1720665000000, name: "1720665000000_goal_context", up: null },
  { id: 1722717601000, name: "1722717601000_reports_move_selected_categories", up: null },
  { id: 1722804019000, name: "1722804019000_create_dashboard_table", up: null },
  { id: 1723665565000, name: "1723665565000_prefs", up: null },
  { id: 1730744182000, name: "1730744182000_fix_dashboard_table", up: null },
  { id: 1736640000000, name: "1736640000000_custom_report_sorting", up: null },
  { id: 1737158400000, name: "1737158400000_add_learn_categories_to_payees", up: null },
  { id: 1738491452000, name: "1738491452000_sorting_rename", up: null },
  { id: 1739139550000, name: "1739139550000_bank_sync_page", up: null },
  { id: 1740506588539, name: "1740506588539_add_last_reconciled_at", up: null },
  { id: 1745425408000, name: "1745425408000_update_budgetType_pref", up: null },
  { id: 1749799110000, name: "1749799110000_add_tags", up: null },
  { id: 1749799110001, name: "1749799110001_tags_tombstone", up: null },
  { id: 1754611200000, name: "1754611200000_add_category_template_settings", up: null },
  { id: 1759260219000, name: "1759260219000_add_trim_interval_report_setting", up: null },
  { id: 1759842823172, name: "1759842823172_add_isGlobal_to_preferences", up: null },
  { id: 1762178745667, name: "1762178745667_rename_csv_skip_lines_pref", up: null },
  { id: 1765518577215, name: "1765518577215_multiple_dashboards", up: null },
  { id: 1768872504000, name: "1768872504000_add_payee_locations", up: m1768872504000 },
  { id: 1769000000000, name: "1769000000000_add_custom_upcoming_length", up: m1769000000000 },
  { id: 1778510362740, name: "1778510362740_add_cleanup_groups_and_def", up: m1778510362740 },
  {
    id: 1780099200000,
    name: "1780099200000_add_show_trend_lines_report_setting",
    up: m1780099200000,
  },
  { id: 1780327681000, name: "1780327681000_add_tags_hidden", up: m1780327681000 },
  { id: 1780606215000, name: "1780606215000_add_bank_sync_status", up: m1780606215000 },
  { id: 1780606215001, name: "1780606215001_add_performance_indexes", up: m1780606215001 },
];

/** IDs baked into the base snapshot (everything at/before the freeze). */
export const SNAPSHOT_MIGRATION_IDS = MIGRATIONS.filter((m) => m.up === null).map((m) => m.id);
