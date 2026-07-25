/**
 * In-memory payee/category id mapping cache.
 *
 * Port of loot-core's `server/db/mappings.ts`, adapted to this app's sync-event
 * bus. When payees are merged or a category is deleted-with-transfer, we only
 * write redirect rows to `payee_mapping`/`category_mapping` and tombstone the
 * source — the transaction rows keep their original ids (read-time resolution
 * via `views.ts` COALESCE joins). The rules engine, however, stores ids in
 * conditions/actions and must project them to the merge TARGET at use time;
 * `migrateIds` (rules/rule-utils.ts) needs this cache to do that synchronously.
 *
 * Upstream's `onApplySync` receives the changed rows and patches the map in
 * place. Our sync bus carries only table NAMES, so we simply re-SELECT both
 * tables whenever a `*mapping` table changes — they are tiny (one row per
 * payee/category), so the cost is negligible.
 *
 * IMPORTANT: `loadMappings()` must run before the rules system first reads
 * rules. `getRules()`/`getRuleById()` guarantee this by awaiting
 * `ensureMappingsLoaded()`, so a missing bootstrap call degrades to a lazy load
 * rather than stale (empty) mappings.
 */
import { runQuery, isDatabaseOpen } from "./index";
import { listen, type SyncEvent } from "@/core/server/sync/syncEvents";

let mappings: Map<string, string> | null = null;
let loadPromise: Promise<void> | null = null;
let unlisten: (() => void) | null = null;

async function doLoad(): Promise<void> {
  if (!isDatabaseOpen()) {
    mappings = new Map();
    return;
  }
  const categories = await runQuery<{ id: string; transferId: string }>(
    "SELECT id, transferId FROM category_mapping",
  );
  const payees = await runQuery<{ id: string; targetId: string }>(
    "SELECT id, targetId FROM payee_mapping",
  );
  // All ids are globally unique, so one flat map covers both tables.
  const next = new Map<string, string>();
  for (const c of categories) next.set(c.id, c.transferId);
  for (const p of payees) next.set(p.id, p.targetId);
  mappings = next;
}

function onSyncEvent(event: SyncEvent): void {
  if (!("tables" in event)) return;
  if (event.tables.some((t) => t.includes("mapping"))) {
    // Reassign loadPromise so an in-flight refresh is awaitable via
    // ensureMappingsLoaded() — this closes the race between a mapping mutation
    // and the next getRules() call.
    loadPromise = doLoad();
  }
}

/**
 * Load both mapping tables into memory and install the sync listener (once).
 * Call at budget open, before the rules system is first used.
 */
export function loadMappings(): Promise<void> {
  if (!unlisten) {
    // React to BOTH "applied" (local mutations, batch.ts) and "success" (remote
    // sync, fullSync.ts) — a merge can arrive through either path.
    unlisten = listen(onSyncEvent);
  }
  loadPromise = doLoad();
  return loadPromise;
}

/**
 * Ensure the cache is populated, awaiting any load/refresh already in flight.
 * Cheap no-op once loaded and idle.
 */
export async function ensureMappingsLoaded(): Promise<void> {
  if (!mappings && !loadPromise) {
    loadMappings();
  }
  if (loadPromise) await loadPromise;
}

/**
 * Synchronous accessor for the current mappings. Returns an empty map before
 * load, which makes `migrateIds` a safe no-op.
 */
export function getMappings(): Map<string, string> {
  return mappings ?? new Map();
}

/** Clear the cache and detach the listener. Called from closeDatabase(). */
export function clearMappings(): void {
  mappings = null;
  loadPromise = null;
  if (unlisten) {
    unlisten();
    unlisten = null;
  }
}
