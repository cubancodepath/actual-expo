import type { SQLiteDatabase } from "expo-sqlite";

import { MIGRATIONS, type Migration } from "./index";

/**
 * Budget-database migration runner — mirrors upstream
 * `actual/packages/loot-core/src/server/migrate/migrations.ts`.
 *
 * The base snapshot (`schema.ts`) plays the role of upstream's pre-migrated
 * `default-db.sqlite`: it creates the schema up to the freeze point and seeds
 * `__migrations__` with those IDs. This runner then applies every migration
 * after the freeze incrementally, exactly like upstream applies migrations that
 * postdate the shipped default DB.
 */

export async function getAppliedMigrations(db: SQLiteDatabase): Promise<number[]> {
  const rows = await db.getAllAsync<{ id: number }>(
    "SELECT id FROM __migrations__ ORDER BY id ASC",
  );
  return rows.map((r) => r.id);
}

export function getPending(appliedIds: number[], all: Migration[]): Migration[] {
  const applied = new Set(appliedIds);
  return all.filter((m) => !applied.has(m.id));
}

/**
 * Applied migrations must be an exact prefix of the known list, in order —
 * same invariant upstream enforces (`checkDatabaseValidity`). A database with
 * more, unknown, or out-of-order applied IDs is from a newer/foreign app
 * version and can't be safely migrated forward.
 */
export function checkDatabaseValidity(appliedIds: number[], available: Migration[]): void {
  if (appliedIds.length > available.length) {
    throw new Error("out-of-sync-migrations");
  }
  for (let i = 0; i < appliedIds.length; i++) {
    if (appliedIds[i] !== available[i].id) {
      throw new Error("out-of-sync-migrations");
    }
  }
}

export async function applyMigration(db: SQLiteDatabase, migration: Migration): Promise<void> {
  if (migration.up == null) {
    // A snapshot migration should already be registered by the base snapshot;
    // reaching here means the DB is missing pre-freeze schema we can't recreate.
    throw new Error(`Cannot apply snapshot migration ${migration.name}: no up() defined`);
  }

  if (typeof migration.up === "string") {
    await db.execAsync(migration.up);
  } else {
    await migration.up(db);
  }

  await db.runAsync("INSERT INTO __migrations__ (id) VALUES (?)", [migration.id]);
}

/** Apply all pending migrations in order. Returns the names that were applied. */
export async function migrate(db: SQLiteDatabase): Promise<string[]> {
  const appliedIds = await getAppliedMigrations(db);

  checkDatabaseValidity(appliedIds, MIGRATIONS);

  const pending = getPending(appliedIds, MIGRATIONS);
  for (const migration of pending) {
    await applyMigration(db, migration);
  }

  return pending.map((m) => m.name);
}
