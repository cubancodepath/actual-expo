import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { openDatabaseAsync } from "expo-sqlite";
import { runSchema } from "@/core/db/schema";
import { MIGRATIONS } from "@/core/db/migrations";

/**
 * Upstream migration parity.
 *
 * The migration registry (`src/core/db/migrations/index.ts`) must stay 1:1 with
 * `actual/packages/loot-core/migrations/`. This test reads the upstream
 * directory directly and fails if the port drifts — the DX signal for "add the
 * new migration and evolve with them". When the upstream repo isn't checked out
 * next to this one (e.g. some CI), the directory-comparison tests skip, but the
 * runtime schema-effect tests below always run.
 */

const UPSTREAM_MIGRATIONS_DIR = path.resolve(
  process.cwd(),
  "../actual/packages/loot-core/migrations",
);

const hasUpstream = fs.existsSync(UPSTREAM_MIGRATIONS_DIR);

function migrationId(filename: string): number {
  return parseInt(filename.match(/^(\d+)/)![1], 10);
}

describe.skipIf(!hasUpstream)("registry parity with upstream migrations directory", () => {
  const upstreamFiles = hasUpstream
    ? fs
        .readdirSync(UPSTREAM_MIGRATIONS_DIR)
        .filter((f) => /\.(sql|js)$/.test(f))
        .sort((a, b) => migrationId(a) - migrationId(b))
    : [];

  it("has the same migration ids, in the same order, as upstream", () => {
    const upstreamIds = upstreamFiles.map(migrationId);
    expect(MIGRATIONS.map((m) => m.id)).toEqual(upstreamIds);
  });

  it("names each migration exactly like its upstream filename (sans extension)", () => {
    const upstreamNames = upstreamFiles.map((f) => f.replace(/\.(sql|js)$/, ""));
    expect(MIGRATIONS.map((m) => m.name)).toEqual(upstreamNames);
  });

  it("carries the exact upstream SQL for every post-freeze migration", () => {
    for (const migration of MIGRATIONS) {
      if (typeof migration.up !== "string") continue;
      const upstreamSql = fs.readFileSync(
        path.join(UPSTREAM_MIGRATIONS_DIR, `${migration.name}.sql`),
        "utf8",
      );
      expect(migration.up, `SQL mismatch for ${migration.name}`).toBe(upstreamSql);
    }
  });
});

describe("runSchema produces the full current schema", () => {
  let db: Awaited<ReturnType<typeof openDatabaseAsync>>;

  beforeAll(async () => {
    db = await openDatabaseAsync("db.sqlite", {}, "schema-parity-test");
    await runSchema(db);
  });

  it("registers every migration id in __migrations__", async () => {
    const rows = await db.getAllAsync<{ id: number }>("SELECT id FROM __migrations__");
    const applied = new Set(rows.map((r) => r.id));
    for (const migration of MIGRATIONS) {
      expect(applied.has(migration.id), `migration ${migration.name} not registered`).toBe(true);
    }
  });

  it("creates the tables added by post-freeze migrations", async () => {
    const rows = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    );
    const tables = new Set(rows.map((r) => r.name));
    expect(tables.has("cleanup_groups")).toBe(true); // 1778510362740
    expect(tables.has("payee_locations")).toBe(true); // 1768872504000
  });

  it("creates the columns added by post-freeze migrations", async () => {
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

  it("creates the indexes added by post-freeze migrations", async () => {
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
