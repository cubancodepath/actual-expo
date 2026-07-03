import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { openDatabaseAsync } from "expo-sqlite";
import { runSchema } from "@/core/db/schema";
import { usePrefsStore } from "@/stores/prefsStore";

/**
 * Upstream schema parity guard.
 *
 * This port doesn't run Actual's migrations incrementally — `runSchema` creates
 * the full current schema (CREATE TABLE IF NOT EXISTS + idempotent column
 * upgrades) and seeds `__migrations__` with the upstream migration IDs so the
 * server's checkDatabaseValidity() passes. This test pins the migrations that
 * shipped after the old freeze point (1765518577215) so future upstream drift is
 * caught: if Actual adds a migration, bump this list AND reflect its DDL in
 * schema.ts, or this test fails.
 *
 * Reference: ../actual/packages/loot-core/migrations (through 1780606215001).
 */

// Migration IDs added upstream after 1765518577215_multiple_dashboards, with the
// schema effect each one must produce (verified against runSchema output below).
const RECENT_MIGRATIONS = [
  1768872504000, // add_payee_locations (conditional: server ≥ 26.4.0)
  1769000000000, // add_custom_upcoming_length
  1778510362740, // add_cleanup_groups_and_def
  1780099200000, // add_show_trend_lines_report_setting
  1780327681000, // add_tags_hidden
  1780606215000, // add_bank_sync_status
  1780606215001, // add_performance_indexes
];

describe("schema parity with upstream Actual migrations (post-1765518577215)", () => {
  let db: Awaited<ReturnType<typeof openDatabaseAsync>>;
  let prevIsLocalOnly: boolean;

  beforeAll(async () => {
    // isLocalOnly makes runSchema apply CONDITIONAL_MIGRATIONS (payee_locations)
    // regardless of server feature detection.
    prevIsLocalOnly = usePrefsStore.getState().isLocalOnly;
    usePrefsStore.setState({ isLocalOnly: true });

    db = await openDatabaseAsync("db.sqlite", {}, "schema-parity-test");
    await runSchema(db);
  });

  afterAll(() => {
    usePrefsStore.setState({ isLocalOnly: prevIsLocalOnly });
  });

  it("registers every post-freeze migration id in __migrations__", async () => {
    const rows = await db.getAllAsync<{ id: number }>("SELECT id FROM __migrations__");
    const applied = new Set(rows.map((r) => r.id));
    for (const id of RECENT_MIGRATIONS) {
      expect(applied.has(id), `migration ${id} not registered in __migrations__`).toBe(true);
    }
  });

  it("creates the tables added by those migrations", async () => {
    const rows = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    );
    const tables = new Set(rows.map((r) => r.name));
    expect(tables.has("cleanup_groups")).toBe(true); // 1778510362740
    expect(tables.has("payee_locations")).toBe(true); // 1768872504000
  });

  it("creates the columns added by those migrations", async () => {
    const hasColumn = async (table: string, column: string) => {
      const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
      return cols.some((c) => c.name === column);
    };
    expect(await hasColumn("schedules", "custom_upcoming_length")).toBe(true); // 1769000000000
    expect(await hasColumn("categories", "cleanup_def")).toBe(true); // 1778510362740
    expect(await hasColumn("custom_reports", "show_trend_lines")).toBe(true); // 1780099200000
    expect(await hasColumn("tags", "hidden")).toBe(true); // 1780327681000
    expect(await hasColumn("accounts", "bank_sync_status")).toBe(true); // 1780606215000
  });

  it("creates the indexes added by those migrations", async () => {
    const rows = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index'",
    );
    const indexes = new Set(rows.map((r) => r.name));
    // 1780606215001_add_performance_indexes
    expect(indexes.has("idx_transactions_acct_tombstone")).toBe(true);
    expect(indexes.has("idx_transactions_schedule")).toBe(true);
    // 1768872504000_add_payee_locations
    expect(indexes.has("idx_payee_locations_payee_id")).toBe(true);
    expect(indexes.has("idx_payee_locations_tombstone_payee_created")).toBe(true);
    expect(indexes.has("idx_payee_locations_geo_tombstone")).toBe(true);
  });
});
