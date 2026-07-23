import { describe, it, expect } from "vitest";
import { openDatabase, type PlatformDatabase } from "@/core/platform/sqlite";
import { runSchema } from "@/core/db/schema";
import {
  MIGRATIONS,
  SNAPSHOT_FREEZE_ID,
  SNAPSHOT_MIGRATION_IDS,
  type Migration,
} from "@/core/db/migrations";
import {
  applyMigration,
  checkDatabaseValidity,
  getAppliedMigrations,
  getPending,
  migrate,
} from "@/core/db/migrations/migrate";

let counter = 0;
async function freshDb(): Promise<PlatformDatabase> {
  const db = await openDatabase("db.sqlite", {}, `migrate-test-${++counter}`);
  await db.exec("CREATE TABLE IF NOT EXISTS __migrations__ (id INT PRIMARY KEY NOT NULL)");
  return db;
}

async function seedApplied(db: PlatformDatabase, ids: number[]): Promise<void> {
  for (const id of ids) {
    await db.run("INSERT INTO __migrations__ (id) VALUES (?)", [id]);
  }
}

describe("checkDatabaseValidity", () => {
  const list: Migration[] = [
    { id: 1, name: "1_a", up: null },
    { id: 2, name: "2_b", up: null },
    { id: 3, name: "3_c", up: "SELECT 1" },
  ];

  it("accepts an exact ordered prefix of the known migrations", () => {
    expect(() => checkDatabaseValidity([], list)).not.toThrow();
    expect(() => checkDatabaseValidity([1], list)).not.toThrow();
    expect(() => checkDatabaseValidity([1, 2, 3], list)).not.toThrow();
  });

  it("throws when more migrations are applied than known (newer/foreign DB)", () => {
    expect(() => checkDatabaseValidity([1, 2, 3, 4], list)).toThrow("out-of-sync-migrations");
  });

  it("throws when applied ids are out of order or unknown (e.g. old gating gap)", () => {
    expect(() => checkDatabaseValidity([1, 3], list)).toThrow("out-of-sync-migrations");
    expect(() => checkDatabaseValidity([2], list)).toThrow("out-of-sync-migrations");
  });
});

describe("getPending", () => {
  const list: Migration[] = [
    { id: 1, name: "1_a", up: null },
    { id: 2, name: "2_b", up: "SELECT 1" },
    { id: 3, name: "3_c", up: "SELECT 1" },
  ];

  it("returns only migrations whose id is not applied", () => {
    expect(getPending([1], list).map((m) => m.id)).toEqual([2, 3]);
    expect(getPending([1, 2, 3], list)).toEqual([]);
  });
});

describe("applyMigration", () => {
  it("runs SQL migrations and records the id", async () => {
    const db = await freshDb();
    await applyMigration(db, { id: 42, name: "42_x", up: "CREATE TABLE t_x (id TEXT)" });

    const tables = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 't_x'",
    );
    expect(tables).toHaveLength(1);
    expect(await getAppliedMigrations(db)).toEqual([42]);
  });

  it("runs function migrations and records the id", async () => {
    const db = await freshDb();
    await applyMigration(db, {
      id: 43,
      name: "43_fn",
      up: async (d) => {
        await d.exec("CREATE TABLE t_fn (id TEXT)");
      },
    });

    const tables = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 't_fn'",
    );
    expect(tables).toHaveLength(1);
    expect(await getAppliedMigrations(db)).toEqual([43]);
  });

  it("refuses to apply a snapshot migration (up: null)", async () => {
    const db = await freshDb();
    await expect(applyMigration(db, { id: 1, name: "1_a", up: null })).rejects.toThrow(
      /snapshot migration/,
    );
  });
});

describe("migrate (full runner via runSchema)", () => {
  it("applies every migration once and records them in order", async () => {
    const db = await openDatabase("db.sqlite", {}, `migrate-full-${++counter}`);
    await runSchema(db);

    const applied = await getAppliedMigrations(db);
    expect(applied).toEqual(MIGRATIONS.map((m) => m.id));
    // ordered ascending
    expect(applied).toEqual([...applied].sort((a, b) => a - b));
  });

  it("is a no-op on an already-migrated database", async () => {
    const db = await openDatabase("db.sqlite", {}, `migrate-noop-${++counter}`);
    await runSchema(db);

    const applied = migrate(db);
    await expect(applied).resolves.toEqual([]);
  });

  it("throws out-of-sync on a DB carrying the old conditional-gating gap", async () => {
    // A budget from the old system: snapshot ids present, plus a post-freeze id
    // WITHOUT the payee_locations id that precedes it — not a valid prefix.
    const db = await freshDb();
    const firstPostFreeze = MIGRATIONS.find((m) => m.id > SNAPSHOT_FREEZE_ID)!;
    const secondPostFreeze = MIGRATIONS.filter((m) => m.id > SNAPSHOT_FREEZE_ID)[1]!;
    await seedApplied(db, [...SNAPSHOT_MIGRATION_IDS, secondPostFreeze.id]);
    expect(firstPostFreeze.id).toBeLessThan(secondPostFreeze.id);

    await expect(migrate(db)).rejects.toThrow("out-of-sync-migrations");
  });
});
