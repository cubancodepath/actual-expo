import { sqlite, type PlatformDatabase, type SqliteBindParams } from "@/core/platform/sqlite";
import { randomUUID } from "@/core/platform/crypto";
import { batchMessages, sendMessages } from "@/core/server/sync";
import { Timestamp } from "@/core/crdt";
import { runSchema } from "./schema";
import { SORT_INCREMENT, shoveSortOrders } from "./sort";
import { whereIn } from "./util";
import type { CategoryGroupRow, CategoryRow } from "./types";

// The connection lives on globalThis, not a module-level `let`, so it survives
// Fast Refresh. When Metro re-evaluates this module (or a dependency) the old
// module state is discarded — a plain `let _db` would reset to undefined and
// orphan the still-open native connection. Hermes then GCs that orphan and
// finalizes its lingering prepared statements while in-flight liveQueries are
// still running on it → use-after-free crash on expo.module.sqlite.AsyncQueue.
const _dbState = globalThis as typeof globalThis & {
  __actualDb?: PlatformDatabase;
  __actualDbDir?: string;
};

export async function openDatabase(budgetDir: string): Promise<void> {
  // Idempotent: the same budget already open (e.g. bootstrap re-running after a
  // Fast Refresh remount) reuses the live connection. Reopening with
  // useNewConnection:true would spawn a second connection and orphan the first.
  if (_dbState.__actualDb && _dbState.__actualDbDir === budgetDir) {
    if (__DEV__) console.log("[db] openDatabase (reuse)", budgetDir);
    return;
  }
  // Switching budgets, or a stale handle from a previous reload: close the old
  // connection and AWAIT it, so no statement finalize races the close.
  if (_dbState.__actualDb) {
    const stale = _dbState.__actualDb;
    _dbState.__actualDb = undefined;
    _dbState.__actualDbDir = undefined;
    try {
      await stale.close();
    } catch {
      // Already closed/invalid — nothing to do.
    }
  }

  if (__DEV__) console.log("[db] openDatabase", budgetDir);
  const db = await sqlite.openDatabase("db.sqlite", { useNewConnection: true }, budgetDir);
  await db.exec("PRAGMA journal_mode = WAL");
  await db.exec("PRAGMA foreign_keys = ON");
  // Secondary connections (upload snapshot, temp dbs) can briefly hold the
  // WAL writer lock — wait instead of failing with SQLITE_BUSY.
  await db.exec("PRAGMA busy_timeout = 5000");
  await runSchema(db);
  _dbState.__actualDb = db;
  _dbState.__actualDbDir = budgetDir;
}

export async function closeDatabase(): Promise<void> {
  // Drop the in-memory mappings cache tied to this budget. Dynamic import keeps
  // db/index.ts free of a static dependency on mappings.ts (which imports this
  // module) — no import cycle.
  const { clearMappings } = await import("./mappings");
  clearMappings();
  if (_dbState.__actualDb) {
    if (__DEV__) console.log("[db] closeDatabase");
    const dbToClose = _dbState.__actualDb;
    // Null first so getDb() throws a JS error, not a native "closed resource".
    _dbState.__actualDb = undefined;
    _dbState.__actualDbDir = undefined;
    await dbToClose.close();
  }
}

export function getDb(): PlatformDatabase {
  if (!_dbState.__actualDb) {
    if (__DEV__) console.trace("[db] getDb() called but _db is undefined");
    throw new Error("Database not initialized — call openDatabase() first");
  }
  return _dbState.__actualDb;
}

/** True when a connection is open. Use to make open flows idempotent (Fast Refresh). */
export function isDatabaseOpen(budgetDir?: string): boolean {
  if (!_dbState.__actualDb) return false;
  return budgetDir === undefined || _dbState.__actualDbDir === budgetDir;
}

export async function runQuery<T = unknown>(
  sql: string,
  params: SqliteBindParams = [],
): Promise<T[]> {
  const db = _dbState.__actualDb;
  if (!db) return [];
  return db.all<T>(sql, params);
}

/** Alias of {@link runQuery} — matches upstream `db.all`, so the ported AQL
 *  exec/executors read verbatim. */
export const all = runQuery;

export async function first<T = unknown>(
  sql: string,
  params: SqliteBindParams = [],
): Promise<T | null> {
  const db = _dbState.__actualDb;
  if (!db) return null;
  return db.first<T>(sql, params);
}

export async function run(sql: string, params: SqliteBindParams = []): Promise<void> {
  const db = _dbState.__actualDb;
  if (!db) return;
  await db.run(sql, params);
}

// ── Synchronous queries (for spreadsheet dynamic cells) ──

export function runQuerySync<T = unknown>(sql: string, params: SqliteBindParams = []): T[] {
  const db = _dbState.__actualDb;
  if (!db) return [];
  return db.allSync<T>(sql, params);
}

export function firstSync<T = unknown>(sql: string, params: SqliteBindParams = []): T | null {
  const db = _dbState.__actualDb;
  if (!db) return null;
  return db.firstSync<T>(sql, params);
}

export async function transaction(fn: () => Promise<void>): Promise<void> {
  // DEFERRED (not EXCLUSIVE) — serializeDbWrite() prevents concurrent writers,
  // so we don't need to block all readers during sync.
  await getDb().transaction(fn);
}

// ── Writes (CRDT) ──
//
// Every write goes out as one sync message PER COLUMN, exactly like upstream's
// db layer: rows are never UPDATEd directly, they're derived by applying
// messages. `sendMessages` either applies immediately or buffers, when we're
// inside a `batchMessages`.

/** One `{dataset, row, column, value}` message per field, stamped in order. */
function messagesFor(table: string, id: string, fields: Record<string, unknown>) {
  return Object.entries(fields).map(([column, value]) => ({
    timestamp: Timestamp.send()!,
    dataset: table,
    row: id,
    column,
    value: value as string | number | null,
  }));
}

/** Insert `row` under its own `id` (required). Mirrors upstream's `insert`. */
export async function insert(table: string, row: Record<string, unknown>): Promise<void> {
  const { id, ...fields } = row;
  if (typeof id !== "string") {
    throw new Error(`insert into '${table}': row needs a string id`);
  }
  await sendMessages(messagesFor(table, id, fields));
}

/** Insert `row` under a freshly generated uuid and return it. */
export async function insertWithUUID(table: string, row: Record<string, unknown>): Promise<string> {
  const id = (row.id as string | undefined) ?? randomUUID();
  await insert(table, { ...row, id });
  return id;
}

/**
 * Update the given columns of one row. `id` picks the row and is never written
 * as a column; passing nothing else is a no-op rather than an empty message set.
 */
export async function update(table: string, row: Record<string, unknown>): Promise<void> {
  const { id, ...fields } = row;
  if (typeof id !== "string") {
    throw new Error(`update on '${table}': row needs a string id`);
  }
  const present = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
  if (Object.keys(present).length === 0) return;
  await sendMessages(messagesFor(table, id, present));
}

/** Soft-delete: sets `tombstone = 1`, like upstream's `delete_`. */
export async function delete_(table: string, id: string): Promise<void> {
  await sendMessages(messagesFor(table, id, { tombstone: 1 }));
}

/**
 * FIFO gate for every flow that opens a transaction.
 *
 * SQLite has no nested transactions: two overlapping `transaction()` calls
 * fail with "cannot start a transaction within a transaction", and the loser's
 * rollback then fails too. Since these flows are async, "overlapping" needs no
 * concurrency — one awaiting mid-transaction while a timer fires is enough.
 * Anything that opens a transaction must queue here instead of assuming it is
 * the only writer.
 */
let writeQueue: Promise<unknown> = Promise.resolve();

export function serializeDbWrite<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn);
  // Swallow the outcome for the queue's purposes — one rejected write must not
  // wedge every write behind it. The caller still sees the rejection.
  writeQueue = result.then(
    () => {},
    () => {},
  );
  return result;
}

/** Wipe all local data by deleting rows from every table. Keeps the DB connection alive. */
export async function clearLocalData(): Promise<void> {
  const db = getDb();
  const tables = [
    "transactions",
    "accounts",
    "categories",
    "category_groups",
    "payees",
    "zero_budgets",
    "zero_budget_months",
    "payee_locations",
    "messages_crdt",
    "messages_clock",
    "payee_mapping",
    "category_mapping",
    "notes",
    "preferences",
    "tags",
    "schedules",
    "schedules_next_date",
    "schedules_json_paths",
    "rules",
  ];
  await db.exec(tables.map((t) => `DELETE FROM ${t};`).join("\n"));
}

// ── Categories ──
//
// Mirrors the category section of upstream's db layer: this is where the SQL,
// the duplicate-name rules and the sort_order maths live. Everything above the
// DB layer (server/budget) does entity mapping and trims input, then delegates
// here — it must not reimplement any of this.

export async function getCategories(ids?: string[]): Promise<CategoryRow[]> {
  return all<CategoryRow>(
    `SELECT * FROM categories WHERE tombstone = 0 ${ids ? `AND ${whereIn(ids, "id")}` : ""} ORDER BY sort_order, id`,
  );
}

/**
 * Groups only. Upstream's db layer has no such function (its handler reaches for
 * AQL instead), but `sheet.ts` fetches groups and categories in parallel on the
 * spreadsheet-init path, and routing that through `getCategoriesGrouped` would
 * SELECT every category a second time for nothing.
 */
export async function getCategoryGroups(ids?: string[]): Promise<CategoryGroupRow[]> {
  return all<CategoryGroupRow>(
    `SELECT * FROM category_groups WHERE tombstone = 0 ${ids ? `AND ${whereIn(ids, "id")}` : ""} ORDER BY is_income, sort_order, id`,
  );
}

export async function getCategoriesGrouped(
  ids?: string[],
): Promise<Array<CategoryGroupRow & { categories: CategoryRow[] }>> {
  const groups = await getCategoryGroups(ids);
  const categories = await all<CategoryRow>(
    `SELECT * FROM categories WHERE tombstone = 0 ORDER BY sort_order, id`,
  );

  return groups.map((group) => ({
    ...group,
    categories: categories.filter((c) => c.cat_group === group.id),
  }));
}

export async function insertCategoryGroup(
  group: Partial<CategoryGroupRow> & { name: string },
): Promise<string> {
  // Don't allow duplicate group
  const existingGroup = await first<Pick<CategoryGroupRow, "id" | "name" | "hidden">>(
    `SELECT id, name, hidden FROM category_groups WHERE UPPER(name) = ? AND tombstone = 0 LIMIT 1`,
    [group.name.toUpperCase()],
  );
  if (existingGroup) {
    throw new Error(
      `A ${existingGroup.hidden ? "hidden " : ""}'${existingGroup.name}' category group already exists.`,
    );
  }

  const lastGroup = await first<Pick<CategoryGroupRow, "sort_order">>(
    `SELECT sort_order FROM category_groups WHERE tombstone = 0 ORDER BY sort_order DESC, id DESC LIMIT 1`,
  );
  const sort_order = (lastGroup?.sort_order ?? 0) + SORT_INCREMENT;

  return insertWithUUID("category_groups", {
    ...group,
    is_income: group.is_income ?? 0,
    hidden: group.hidden ?? 0,
    // Expo addition: an explicit sort_order wins. Upstream never needs this
    // because its default budget ships as a prebuilt sqlite file; we build ours
    // in code (budgetfiles/seed.ts), inside one batchMessages — so the SELECT
    // above cannot see rows written earlier in the same batch.
    sort_order: group.sort_order ?? sort_order,
  });
}

export async function updateCategoryGroup(
  group: Partial<CategoryGroupRow> & { id: string },
): Promise<void> {
  if (group.name !== undefined) {
    const existingGroup = await first<Pick<CategoryGroupRow, "id" | "name" | "hidden">>(
      `SELECT id, name, hidden FROM category_groups WHERE UPPER(name) = ? AND id != ? AND tombstone = 0 LIMIT 1`,
      [group.name.toUpperCase(), group.id],
    );
    if (existingGroup) {
      throw new Error(
        `A ${existingGroup.hidden ? "hidden " : ""}'${existingGroup.name}' category group already exists.`,
      );
    }
  }
  await update("category_groups", group);
}

export async function moveCategoryGroup(id: string, targetId: string | null = null): Promise<void> {
  const groups = await all<Pick<CategoryGroupRow, "id" | "sort_order">>(
    `SELECT id, sort_order FROM category_groups WHERE tombstone = 0 ORDER BY sort_order, id`,
  );

  const { updates, sort_order } = shoveSortOrders(
    groups.map((g) => ({ id: g.id, sort_order: g.sort_order ?? 0 })),
    targetId,
  );
  for (const info of updates) {
    await update("category_groups", info);
  }
  await update("category_groups", { id, sort_order });
}

export async function deleteCategoryGroup(
  group: { id: string },
  transferId?: string | null,
): Promise<void> {
  const categories = await all<Pick<CategoryRow, "id">>(
    `SELECT id FROM categories WHERE cat_group = ? AND tombstone = 0`,
    [group.id],
  );

  // Delete all the categories within a group
  for (const category of categories) {
    await deleteCategory({ id: category.id }, transferId);
  }

  await delete_("category_groups", group.id);
}

export async function insertCategory(
  category: Partial<CategoryRow> & { name: string; cat_group: string },
  { atEnd }: { atEnd?: boolean } = {},
): Promise<string> {
  let sort_order: number;
  let id_ = "";

  await batchMessages(async () => {
    // Don't allow duplicated names in groups
    const existingCatInGroup = await first<Pick<CategoryRow, "id">>(
      `SELECT id FROM categories WHERE cat_group = ? AND UPPER(name) = ? AND tombstone = 0 LIMIT 1`,
      [category.cat_group, category.name.toUpperCase()],
    );
    if (existingCatInGroup) {
      throw new Error(
        `Category '${category.name}' already exists in group '${category.cat_group}'`,
      );
    }

    if (atEnd) {
      const lastCat = await first<Pick<CategoryRow, "sort_order">>(
        `SELECT sort_order FROM categories WHERE tombstone = 0 ORDER BY sort_order DESC, id DESC LIMIT 1`,
      );
      sort_order = (lastCat?.sort_order ?? 0) + SORT_INCREMENT;
    } else {
      // Unfortunately since we insert at the beginning, we need to shove
      // the sort orders to make sure there's room for it
      const categories = await all<Pick<CategoryRow, "id" | "sort_order">>(
        `SELECT id, sort_order FROM categories WHERE cat_group = ? AND tombstone = 0 ORDER BY sort_order, id`,
        [category.cat_group],
      );

      const { updates, sort_order: order } = shoveSortOrders(
        categories.map((c) => ({ id: c.id, sort_order: c.sort_order ?? 0 })),
        categories.length > 0 ? categories[0].id : null,
      );
      for (const info of updates) {
        await update("categories", info);
      }
      sort_order = order;
    }

    const id = await insertWithUUID("categories", {
      ...category,
      is_income: category.is_income ?? 0,
      hidden: category.hidden ?? 0,
      // See insertCategoryGroup: explicit sort_order wins, for the seeder.
      sort_order: category.sort_order ?? sort_order,
    });
    // Create an entry in the mapping table that points it to itself
    await insert("category_mapping", { id, transferId: id });
    id_ = id;
  });

  return id_;
}

export async function updateCategory(
  category: Partial<CategoryRow> & { id: string },
): Promise<void> {
  await update("categories", category);
}

export async function moveCategory(
  id: string,
  groupId: string,
  targetId: string | null = null,
): Promise<void> {
  if (!groupId) {
    throw new Error("moveCategory: groupId is required");
  }

  const categories = await all<Pick<CategoryRow, "id" | "sort_order">>(
    `SELECT id, sort_order FROM categories WHERE cat_group = ? AND tombstone = 0 ORDER BY sort_order, id`,
    [groupId],
  );

  const { updates, sort_order } = shoveSortOrders(
    categories.map((c) => ({ id: c.id, sort_order: c.sort_order ?? 0 })),
    targetId,
  );
  for (const info of updates) {
    await update("categories", info);
  }
  await update("categories", { id, sort_order, cat_group: groupId });
}

export async function deleteCategory(
  category: { id: string },
  transferId?: string | null,
): Promise<void> {
  if (transferId) {
    // Re-point every mapping that currently resolves to this category, so
    // chains stay intact: if A → category, after deletion A → transferId.
    const existingTransfers = await all<Pick<CategoryRow, "id">>(
      `SELECT id FROM category_mapping WHERE transferId = ?`,
      [category.id],
    );
    for (const mapping of existingTransfers) {
      await update("category_mapping", { id: mapping.id, transferId });
    }

    // Map the category itself to the new one
    await update("category_mapping", { id: category.id, transferId });
  }

  await delete_("categories", category.id);
}

export async function getCategory(id: string): Promise<CategoryRow | null> {
  return first<CategoryRow>(`SELECT * FROM categories WHERE id = ?`, [id]);
}
