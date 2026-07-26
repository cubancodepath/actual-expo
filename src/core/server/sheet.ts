/**
 * Spreadsheet lifecycle + sync integration (upstream's server/sheet.ts).
 *
 * Owns the currently-loaded instance — one per budget file, built by
 * loadSpreadsheet() and dropped by unloadSpreadsheet() — and the two refresh
 * paths that keep it fresh (matching loot-core's pattern):
 * 1. Granular: triggerBudgetChanges() marks SQL cells (deps=[]) dirty after
 *    transaction/budget mutations. Formula cells cascade automatically via
 *    the dependency graph.
 * 2. Structural: Full cell re-creation when categories/groups change.
 */

import type { SyncMessage } from "@/core/server/sync/encoder";
import {
  first,
  isDatabaseOpen,
  run,
  runQuery,
  serializeDbWrite,
  transaction,
} from "@/core/server/db";
import {
  Spreadsheet,
  type CacheHooks,
  type CellValue,
} from "@/core/server/spreadsheet/spreadsheet";
import * as envelopeEngine from "@/core/server/budget/envelope";
import * as trackingEngine from "@/core/server/budget/tracking";
import { getCategories, getCategoryGroups } from "@/core/server/budget";
import { getBudgetType, type BudgetType } from "@/core/server/preferences";
import { getBudgetRange } from "@/core/server/budget/base";
import {
  warmSpreadsheetCache,
  clearSpreadsheetWarmCache,
} from "@/core/server/spreadsheet/warm-cache";
import { addMonths } from "@/core/shared/months";

type BudgetEngine = {
  createBudgetCells: typeof envelopeEngine.createBudgetCells;
  createAllBudgetCells: typeof envelopeEngine.createAllBudgetCells;
};

// ── The loaded instance (upstream: globalSheet + get()) ──

/**
 * One instance per budget file. Reusing a single instance across budgets used
 * to leak the previous file's values into the UI — cell names are
 * budget-agnostic ("budget2026-07!to-budget"), and a rebuilt cell whose new
 * value equals the placeholder 0 never notifies, so mounted subscribers kept
 * rendering the old number.
 *
 * Since a switch never unmounts the mobile UI (unlike desktop, which returns
 * to the file manager), subscribers must be told when the instance changes:
 * subscribeToSpreadsheetSwap + getSpreadsheetGeneration back the
 * useSpreadsheet() hook, which re-seeds and re-subscribes every sheet-value
 * consumer against the new instance.
 */
let instance: Spreadsheet | null = null;
let generation = 0;
const swapListeners = new Set<() => void>();

function notifySwap(): void {
  for (const fn of swapListeners) {
    fn();
  }
}

/**
 * The live instance. Lazily creates an EMPTY one when no budget is loaded
 * (first render before loadBudget, file manager after closeBudget) so reads
 * yield 0 instead of throwing. That lazy create deliberately does NOT bump the
 * generation — the useSyncExternalStore snapshot must stay stable while
 * nothing has actually been published.
 */
export function getSpreadsheet(): Spreadsheet {
  if (!instance) {
    instance = new Spreadsheet();
  }
  return instance;
}

/** Snapshot for useSyncExternalStore — bumped on every publish/unload. */
export function getSpreadsheetGeneration(): number {
  return generation;
}

/**
 * Install a fully-built instance and notify subscribers. Called only after the
 * build finishes, so a subscriber re-seeding via getResolved() reads final
 * values rather than placeholders.
 */
export function publishSpreadsheet(ss: Spreadsheet): void {
  instance = ss;
  generation++;
  notifySwap();
}

export function subscribeToSpreadsheetSwap(fn: () => void): () => void {
  swapListeners.add(fn);
  return () => {
    swapListeners.delete(fn);
  };
}

// ── Persisted value cache (upstream: kvcache + kvcache_key) ──
//
// Recomputing every cell on open is the bulk of a large budget's startup, so
// computed values are persisted to the budget's own `kvcache` table and
// restored on the next open. Upstream keeps them in a separate cache.sqlite on
// desktop and in the main DB in the browser; we have one DB per budget, like
// the browser case. `kvcache`/`kvcache_key` are excluded from CRDT sync
// (sync/apply.ts) and stripped before upload (cloud-storage.ts), so a cache
// never travels between devices.

/**
 * Bump whenever cell names, formulas or dependencies change: a cache written
 * by an older app version describes cells this version no longer computes the
 * same way, and nothing else would catch that.
 */
const CACHE_FORMAT_VERSION = 1;
const CACHE_FORMAT_KEY = "__cache_format__";

/** How long writes coalesce. Long enough to batch a burst, short enough that a kill rarely loses much. */
const CACHE_FLUSH_DELAY_MS = 250;

/** Rows per queued write batch — small enough to let real mutations through. */
const CACHE_FLUSH_CHUNK = 500;

/** Tests build and rebuild spreadsheets constantly; caching across those would mask cold-build bugs. */
let cacheEnabled = process.env.NODE_ENV !== "test";

/** Test-only escape hatch — the kvcache suite opts back in. */
export function __setSpreadsheetCacheEnabled(enabled: boolean): void {
  cacheEnabled = enabled;
}

/**
 * Is what's persisted safe to trust? Dirty means "rebuild from SQL".
 *
 * The clean mark is a random number written alongside the rows in the same
 * transaction, so its presence proves the rows it accompanied were written in
 * full — a kill mid-flush leaves no mark and the next open rebuilds.
 */
async function isCacheDirty(): Promise<boolean> {
  const mark = await first<{ key: number }>("SELECT key FROM kvcache_key WHERE id = 1");
  if (!mark) return true;

  const version = await first<{ value: string }>("SELECT value FROM kvcache WHERE key = ?", [
    CACHE_FORMAT_KEY,
  ]);
  return version?.value !== String(CACHE_FORMAT_VERSION);
}

/**
 * Writes for one spreadsheet instance, coalesced and owner-checked.
 *
 * Two invariants carry the correctness here:
 * 1. The clean mark is written LAST and only if nothing went dirty while the
 *    rows were going in, so the mark can never vouch for values that aren't
 *    there. (Rows and mark are not one transaction — see the chunking note in
 *    flush() — but the ordering gives the same guarantee.)
 * 2. Going dirty is immediate and cancels any pending clean. Being wrongly
 *    dirty costs a rebuild; being wrongly clean shows stale numbers forever.
 */
function makeCacheHooks(getOwner: () => Spreadsheet): CacheHooks & { cancel: () => void } {
  const pending = new Set<string>();
  let pendingClean = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Bumped whenever the cache goes dirty, so an in-flight flush can tell. */
  let dirtyEpoch = 0;

  /**
   * Only the published instance may touch the cache, and only while its DB is
   * open — otherwise a switch could flush one budget's values into another
   * budget's file. An instance still being built fails this too, which is
   * correct: a cold build has nothing to invalidate (the cache it's replacing
   * was already dirty, or it would have been a warm build), and its values
   * are written in one go right after publish.
   */
  const stillOurs = () => isDatabaseOpen() && instance === getOwner();

  const flush = async () => {
    timer = null;
    if (!stillOurs()) {
      pending.clear();
      pendingClean = false;
      return;
    }
    const names = [...pending];
    pending.clear();
    const markClean = pendingClean;
    pendingClean = false;
    if (names.length === 0 && !markClean) return;

    const epochAtStart = dirtyEpoch;
    try {
      const owner = getOwner();

      // This runs off a timer, so it can land in the middle of a sync apply —
      // hence serializeDbWrite, the gate every transaction-opening flow shares
      // (SQLite has no nested transactions). Batches stay small so a
      // full-graph save doesn't hold the gate against real mutations.
      for (let i = 0; i < names.length; i += CACHE_FLUSH_CHUNK) {
        const chunk = names.slice(i, i + CACHE_FLUSH_CHUNK);
        await serializeDbWrite(async () => {
          if (!stillOurs()) return;
          await transaction(async () => {
            for (const name of chunk) {
              // Read the value at write time, not at flush time: if a
              // mutation landed since, this persists the newer number.
              await run("INSERT OR REPLACE INTO kvcache (key, value) VALUES (?, ?)", [
                name,
                JSON.stringify(owner.getResolved(name)),
              ]);
            }
          });
        });
        if (!stillOurs()) return;
      }

      // The mark is what makes those rows trustworthy, so it goes last — and
      // not at all if anything invalidated them while we were writing.
      if (markClean && dirtyEpoch === epochAtStart) {
        await serializeDbWrite(async () => {
          if (!stillOurs() || dirtyEpoch !== epochAtStart) return;
          await transaction(async () => {
            await run("INSERT OR REPLACE INTO kvcache (key, value) VALUES (?, ?)", [
              CACHE_FORMAT_KEY,
              String(CACHE_FORMAT_VERSION),
            ]);
            await run("INSERT OR REPLACE INTO kvcache_key (id, key) VALUES (1, ?)", [
              Math.floor(Math.random() * 1e9),
            ]);
          });
        });
      }
    } catch (err) {
      if (__DEV__) console.warn("[spreadsheet/cache] flush failed:", err);
    }
  };

  const schedule = () => {
    if (timer === null) timer = setTimeout(() => void flush(), CACHE_FLUSH_DELAY_MS);
  };

  return {
    saveCache(names) {
      for (const name of names) pending.add(name);
      schedule();
    },
    setCacheStatus({ clean }) {
      if (clean) {
        pendingClean = true;
        schedule();
        return;
      }
      // Dirty wins immediately: drop the mark now, before anything else can
      // read it, and make sure neither a queued nor an in-flight flush
      // re-marks it clean.
      pendingClean = false;
      dirtyEpoch++;
      if (!stillOurs()) return;
      void run("DELETE FROM kvcache_key").catch((err) => {
        if (__DEV__) console.warn("[spreadsheet/cache] could not mark dirty:", err);
      });
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pending.clear();
      pendingClean = false;
    },
  };
}

/** Cancel hook for the live instance's pending writes — see unloadSpreadsheet. */
let cancelCacheWrites: (() => void) | null = null;

/**
 * Seed `ss` with the persisted values, if they can be trusted. Returns whether
 * the build that follows can skip querying entirely.
 */
async function restoreCachedValues(ss: Spreadsheet): Promise<boolean> {
  try {
    if (await isCacheDirty()) return false;

    const rows = await runQuery<{ key: string; value: string }>("SELECT key, value FROM kvcache");
    for (const row of rows) {
      if (row.key === CACHE_FORMAT_KEY) continue;
      ss.load(row.key, JSON.parse(row.value) as CellValue);
    }
    return ss.hasPreloadedValues();
  } catch (err) {
    // A malformed cache must never block opening a budget — rebuild instead.
    if (__DEV__) console.warn("[spreadsheet/cache] could not restore, rebuilding:", err);
    return false;
  }
}

/**
 * The formula module for a budget type (envelope.ts or tracking.ts) — both
 * export the same createBudgetCells/createAllBudgetCells contract, so every
 * call site here just needs to know which one to dispatch to.
 *
 * Which type is active is recorded in the spreadsheet's own meta (upstream
 * `meta().budgetType`), as a string rather than this module reference — the
 * range and the formula set describing an instance must travel with it.
 */
function engineForType(type: BudgetType): BudgetEngine {
  return type === "tracking" ? trackingEngine : envelopeEngine;
}

/** Timestamp of last loadSpreadsheet — suppresses structural refresh cooldown. */

/**
 * The instance an in-flight loadSpreadsheet is building into, before it's
 * published. Doubles as the supersede token: a second init takes over the slot,
 * and the first one discards its work instead of publishing a stale budget.
 * Non-null also means "a full rebuild is coming", so the incremental paths
 * (ensureMonthRange / rebuildForBudgetTypeChange) stand down.
 */
let currentInit: Spreadsheet | null = null;

/**
 * True when `ss` is no longer the spreadsheet worth extending — either the
 * budget switched under us (a new instance got published) or a full rebuild
 * started. Incremental work checks this after every await: these flows run
 * fire-and-forget from screens/forecast, so one can easily still be in flight
 * when the user switches budgets.
 *
 * This is a work-avoidance check, not a correctness guard: since the range
 * lives in each instance's own meta, a stale run that slips through only
 * builds cells into (and records its range on) the detached instance nobody
 * reads. It stays because that work is pure waste.
 */
function isStale(ss: Spreadsheet): boolean {
  return currentInit !== null || getSpreadsheet() !== ss;
}

/** Months per init transaction — each chunk computes synchronously, then the
 * loop yields to the event loop so timers/renders/progress land in between. */
const INIT_CHUNK_MONTHS = 6;

/**
 * Initialize the spreadsheet with budget cells for all months.
 * Called during bootstrap in loadBudget().
 *
 * Divergence from `createAllBudgetCells` (which runs everything in ONE
 * transaction and stays for structural refreshes): months are built in
 * ascending chunks, each in its own transaction, with an event-loop yield
 * between chunks. Cell values are identical — months already build strictly
 * ascending, so every chunk's previous-month cells are computed before the
 * chunk that reads them (same invariant `buildMonthsAscending` relies on) —
 * but the JS thread is no longer blocked for the whole build, so the busy
 * overlay's message/progress can update and timers/touch handlers don't pile
 * up behind one multi-second span. `onProgress` reports built/total months
 * between chunks (core stays UI-free — the caller wires it to the overlay).
 *
 * This is upstream's `loadSpreadsheet`: cells are built into a BRAND-NEW
 * instance that only becomes visible (publishSpreadsheet) once the whole build
 * succeeds. Rebuilding the live instance instead would leave the previous
 * budget's numbers on screen — a cell that recomputes to the same 0 its fresh
 * placeholder holds notifies nobody, so mounted subscribers never hear about
 * the switch.
 *
 * When the persisted cache is trustworthy the build adopts its values instead
 * of computing them, which turns the whole thing into graph construction with
 * no SQL at all — the difference between a multi-second open and an instant
 * one on a budget with history.
 */
export async function loadSpreadsheet(
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  // The hooks need the instance they serve, and the instance needs the hooks —
  // resolve the owner lazily, it's only read once writes actually run.
  let ss!: Spreadsheet;
  const hooks = makeCacheHooks(() => ss);
  ss = new Spreadsheet(cacheEnabled ? hooks : undefined);
  currentInit = ss;
  // Nothing computed during the build may declare the cache clean: it's only
  // trustworthy once every month is in. Lifted after publish.
  ss.startCacheBarrier();
  try {
    const budgetType = await getBudgetType();
    const engine = engineForType(budgetType);
    const { start, end, months } = await getBudgetRange();
    const [cats, groups] = await Promise.all([getCategories(), getCategoryGroups()]);

    const warm = cacheEnabled && (await restoreCachedValues(ss));

    // Batch the leaf-cell reads: a handful of grouped queries replace the
    // thousands of per-cell synchronous ones while the cells compute. A warm
    // build has almost nothing left to query — at most a month that entered
    // the range since the cache was written — so the batch would cost more
    // than the handful of reads it saves.
    const warmToken = warm ? null : await warmSpreadsheetCache(start, end);
    try {
      for (let i = 0; i < months.length; i += INIT_CHUNK_MONTHS) {
        // A newer init took the slot while we yielded — everything we build
        // from here is thrown away, so stop burning the JS thread on it.
        if (currentInit !== ss) return;

        const chunk = months.slice(i, i + INIT_CHUNK_MONTHS);
        ss.startTransaction();
        try {
          for (const month of chunk) {
            await engine.createBudgetCells(ss, month, cats, groups);
          }
        } finally {
          ss.endTransaction();
        }

        const done = Math.min(i + INIT_CHUNK_MONTHS, months.length);
        onProgress?.(done, months.length);
        if (done < months.length) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    } finally {
      if (warmToken !== null) clearSpreadsheetWarmCache(warmToken);
    }

    if (currentInit !== ss) return;

    ss.setMeta({ builtStart: start, builtEnd: end, budgetType });
    // Swap + notify last: subscribers re-seed off this instance, so every
    // value they read here is final.
    publishSpreadsheet(ss);

    if (cacheEnabled) {
      cancelCacheWrites?.();
      cancelCacheWrites = hooks.cancel;
      // Persist every cell, not just the ones runComputations reported as
      // changed: a cell whose computed value happens to equal its placeholder
      // never enters `changed` and would be missing from the cache forever.
      ss.saveCachedCells([...ss.getCells().keys()]);
    }
  } finally {
    // Lifting the barrier marks the cache clean once the graph is settled;
    // on the failure path there is nothing pending to mark.
    ss.endCacheBarrier();
    if (currentInit === ss) currentInit = null;
  }
}

/**
 * Drop the per-budget spreadsheet and everything describing it (upstream
 * `unloadSpreadsheet`). Close paths only — never on a switch, where the old
 * instance must stay published until the new one is built, or the mounted
 * screens would re-render to zeros mid-switch (EaseView SIGSEGV, see
 * operations/budgetfiles.ts). Any in-flight incremental work becomes a no-op
 * via isStale().
 */
export function unloadSpreadsheet(): void {
  // Drop queued cache writes before the DB closes — they belong to a budget
  // that is going away, and the next one gets its own hooks.
  cancelCacheWrites?.();
  cancelCacheWrites = null;
  // The built range and budget type die with the instance (they live in its
  // meta), so only the module's own scheduling state needs clearing.
  currentInit = null;
  instance = null;
  generation++;
  notifySwap();
}

/** True when `month` already falls inside the instance's contiguous built range. */
function isMonthBuilt(ss: Spreadsheet, month: string): boolean {
  const { builtStart, builtEnd } = ss.meta();
  if (builtStart === null || builtEnd === null) return false;
  return month >= builtStart && month <= builtEnd;
}

/** Ascending walk from `from` to `to` (inclusive), building each month's cells in order. */
async function buildMonthsAscending(
  engine: BudgetEngine,
  ss: Spreadsheet,
  from: string,
  to: string,
  cats: Awaited<ReturnType<typeof getCategories>>,
  groups: Awaited<ReturnType<typeof getCategoryGroups>>,
): Promise<void> {
  let cursor = from;
  while (cursor <= to) {
    await engine.createBudgetCells(ss, cursor, cats, groups);
    cursor = addMonths(cursor, 1);
  }
}

/**
 * Extend the built spreadsheet range to cover `month`, filling any gap in
 * ascending month order first. Call before reading budget cells for a month
 * that may be outside the initially-loaded (mobile-tightened) range — e.g.
 * on month-picker navigation — so distant months render real values instead
 * of silently reading 0 from missing prevSheet cells.
 */
export async function ensureMonthRange(month: string): Promise<void> {
  if (currentInit) return; // a full rebuild is coming — it covers every month

  const ss = getSpreadsheet();
  if (ss.meta().builtStart === null) return; // not initialized yet
  if (isMonthBuilt(ss, month)) return;

  const [budgetType, cats, groups] = await Promise.all([
    getBudgetType(),
    getCategories(),
    getCategoryGroups(),
  ]);
  if (isStale(ss)) return;

  const { builtStart, builtEnd } = ss.meta();
  if (builtStart === null || builtEnd === null) return;
  const start = builtStart;
  const end = builtEnd;
  if (month >= start && month <= end) return; // built while we were reading

  const engine = engineForType(budgetType);

  // Walking backwards means building forward from the new earliest month up to
  // (but not including) the old start, so each month's prevSheet is always
  // already built by the time it's needed.
  const extendEnd = month > end;
  const from = extendEnd ? addMonths(end, 1) : month;
  const to = extendEnd ? month : addMonths(start, -1);

  // Batch the gap's leaf-cell reads (same batching as loadSpreadsheet).
  const warmToken = await warmSpreadsheetCache(from, to);
  if (isStale(ss)) {
    clearSpreadsheetWarmCache(warmToken);
    return;
  }

  ss.startTransaction();
  try {
    await buildMonthsAscending(engine, ss, from, to, cats, groups);
  } finally {
    ss.endTransaction();
    clearSpreadsheetWarmCache(warmToken);
  }

  // Recorded on the instance we actually extended: if this run turned out to
  // be stale, that's a detached instance and the live one keeps its own range.
  if (extendEnd) ss.setMeta({ builtEnd: month });
  else ss.setMeta({ builtStart: month });
}

// ── Granular budget invalidation (ported from loot-core/budget/base.ts) ──

/**
 * The months the live spreadsheet has cells for. `triggerBudgetChanges` needs
 * them to know which sheets a category-wide change touches (upstream reads the
 * equivalent from `meta().createdMonths`).
 */
export function getBuiltMonths(): string[] {
  const { builtStart, builtEnd } = getSpreadsheet().meta();
  if (builtStart === null || builtEnd === null) return [];

  const months: string[] = [];
  let current = builtStart;
  while (current <= builtEnd) {
    months.push(current);
    current = addMonths(current, 1);
  }
  return months;
}

/**
 * Structural changes — the ones that add or remove CELLS rather than change
 * what existing cells evaluate to. Value-level invalidation lives in
 * `budget/base.ts::triggerBudgetChanges`, where upstream keeps it.
 *
 * Only budgetType lands here: the entire formula set differs between envelope
 * and tracking, so no amount of granular invalidation covers it — only a
 * structural rebuild (upstream does the same in `setType`). Categories and
 * groups don't come through here at all: `budget/base.ts`'s handlers wire them
 * in cell by cell.
 */
export function triggerStructuralChanges(messages: SyncMessage[]): void {
  for (const msg of messages) {
    if (msg.dataset === "preferences" && msg.row === "budgetType") {
      void rebuildForBudgetTypeChange();
      return;
    }
  }
}

/**
 * Re-widen the live spreadsheet to a range a previous build had reached — a
 * structural rebuild only recreates the mobile-tightened default range, so
 * without this the cells for an already-visited far month go missing again.
 */
async function restorePreviousRange(
  prevStart: string | null,
  prevEnd: string | null,
): Promise<void> {
  if (prevStart === null || prevEnd === null) return;
  const { builtStart, builtEnd } = getSpreadsheet().meta();
  if (builtStart === null || builtEnd === null) return;
  if (prevStart < builtStart) await ensureMonthRange(prevStart);
  if (prevEnd > builtEnd) await ensureMonthRange(prevEnd);
}

/**
 * The one change no amount of granular invalidation covers: switching between
 * envelope and tracking swaps the entire formula set, so the old cells must not
 * linger. Rebuilds through `loadSpreadsheet` rather than clearing in place —
 * subscribers would otherwise stay on the old numbers for every cell whose new
 * value happens to equal its placeholder. Upstream's `setType` does the same.
 *
 * Categories and groups used to come through here too, rebuilding every month's
 * cells to add one category. They're incremental now — see
 * `handleCategoryChange` in envelope.ts/tracking.ts.
 */
async function rebuildForBudgetTypeChange(): Promise<void> {
  // A full rebuild already in flight recreates every cell anyway.
  if (currentInit) return;

  try {
    const ss = getSpreadsheet();
    // Remember any range previously widened by ensureMonthRange(): a rebuild
    // only recreates the mobile-tightened default range, so without this the
    // cells for an already-visited far month would silently go missing.
    const { builtStart: prevStart, builtEnd: prevEnd } = ss.meta();

    const budgetType = await getBudgetType();
    if (isStale(ss) || budgetType === ss.meta().budgetType) return;

    await loadSpreadsheet();
    await restorePreviousRange(prevStart, prevEnd);
  } catch (err) {
    if (__DEV__) console.warn("[spreadsheet/sync] budget-type rebuild failed:", err);
  }
}
