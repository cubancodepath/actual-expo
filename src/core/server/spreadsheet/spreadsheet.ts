/**
 * Spreadsheet engine — reactive cell computation with dependency graph.
 *
 * Ported from Actual Budget's spreadsheet.ts. Each cell is either:
 * - Static: a value set directly (e.g., user-entered budget amount)
 * - Dynamic: computed from dependencies via a function (e.g., balance = budgeted + spent)
 *
 * When a cell changes, the engine recomputes only its dependents in
 * topological order, then notifies subscribers.
 */

import { DependencyGraph } from "@/core/server/spreadsheet/graph-data-structure";
import { resolveName } from "@/core/server/spreadsheet/util";
// Type-only (erased at build): keeps the budget-type vocabulary in one place
// without giving the engine a runtime dependency on preferences. Upstream
// imports BudgetType into spreadsheet.ts the same way.
import type { BudgetType } from "@/core/server/preferences";

/**
 * The exact prefix strings triggerBudgetChanges() (spreadsheet/sync.ts)
 * queries via getCellsByPrefix() to directly mark leaf SQL cells dirty
 * (cells with no incoming dependency edge, so nothing else cascades into
 * them). Cells are indexed under every one of these they start with —
 * see indexCell(). This list must stay in sync with the prefixes actually
 * queried; add to it if triggerBudgetChanges starts querying a new one.
 */
const QUERYABLE_PREFIXES = [
  "sum-amount-",
  "budget-",
  "carryover-",
  "buffered",
  "goal-",
  "long-goal-",
];

/**
 * Version numbers are drawn from one module-level counter rather than per
 * instance, so they stay unique across a budget switch (which publishes a
 * brand-new Spreadsheet — see server/sheet.ts). Consumers memoize on
 * the bare number; a per-instance counter restarting at 0 would look like
 * "nothing changed" right after the swap.
 */
let versionCounter = 0;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CellValue = number | boolean | string | null;

export type StaticCell = {
  type: "static";
  name: string;
  value: CellValue;
};

export type DynamicCell = {
  type: "dynamic";
  name: string;
  value: CellValue;
  dependencies: string[];
  run: (...args: CellValue[]) => CellValue | Promise<CellValue>;
};

export type Cell = StaticCell | DynamicCell;

export type CellChangeListener = (changedNames: string[]) => void;

/**
 * Per-instance description of what this spreadsheet holds (upstream's
 * `_meta`). It lives on the instance, not in module state, so it can never
 * describe a budget other than the one whose cells are in `cells` — an
 * in-flight build that gets superseded mutates its own detached instance and
 * the live one is untouched.
 */
export type SpreadsheetMeta = {
  /**
   * The contiguous [builtStart, builtEnd] month range built here ("YYYY-MM",
   * compare lexicographically). Contiguity is load-bearing: budget cells
   * depend on the immediately preceding month (from-last-month, carryover
   * chains), so extending the range must never leave a gap.
   */
  builtStart: string | null;
  builtEnd: string | null;
  /** Which formula set built these cells — envelope and tracking differ wholesale. */
  budgetType: BudgetType | null;
};

/**
 * Persistence for computed values (upstream's `saveCache`/`setCacheStatus`
 * constructor args). The engine stays storage-agnostic: sheet.ts supplies
 * hooks that write to the budget's `kvcache` table so the next open can skip
 * recomputing. Without hooks the instance simply never persists anything.
 */
export type CacheHooks = {
  /** Persist the current values of these resolved cell names. */
  saveCache: (names: string[]) => void;
  /**
   * Record whether what's persisted is a complete, trustworthy snapshot.
   * `clean: false` must take effect immediately — being wrongly dirty costs a
   * rebuild, being wrongly clean shows stale numbers.
   */
  setCacheStatus: (status: { clean: boolean }) => void;
};

// ---------------------------------------------------------------------------
// Spreadsheet
// ---------------------------------------------------------------------------

export class Spreadsheet {
  private cells = new Map<string, Cell>();
  private graph = new DependencyGraph();
  private dirtyCells: string[] = [];
  private transactionDepth = 0;
  private listeners = new Set<CellChangeListener>();
  /**
   * Keyed subscriptions — Map<resolved cell name, Set<listener>>. Lets
   * runComputations() dispatch a single O(changedNames) scan instead of
   * every subscriber independently scanning changedNames (which was
   * O(subscribers × changedNames) — see plans/014).
   */
  private cellListeners = new Map<string, Set<(value: CellValue) => void>>();
  private computing = false;
  /** Cells that were directly set (optimistic) — skip their run() in next computation. */
  private directlySet = new Set<string>();

  /**
   * Prefix index for O(1) cell lookup by name fragment.
   * Key = the fragment after "!" (e.g., "catSpent-", "catBudgeted-").
   * Used by triggerBudgetChanges to avoid O(N) iteration over all cells.
   */
  private prefixIndex = new Map<string, Set<string>>();

  /** Monotonic counter bumped after every computation with changes. */
  version = ++versionCounter;

  private _meta: SpreadsheetMeta = { builtStart: null, builtEnd: null, budgetType: null };

  /**
   * Values restored from the persisted cache, consumed as cells get created.
   * A cell that finds its value here starts out already correct and is NOT
   * marked dirty, so its `run()` — and the SQL inside it — never executes.
   * That is the whole point: a warm open builds the graph without querying.
   */
  private preloadedValues = new Map<string, CellValue>();

  /** While true, no computation may declare the persisted cache trustworthy. */
  private cacheBarrier = false;

  constructor(private readonly hooks?: CacheHooks) {}

  // ---- Meta ----

  /** What this instance holds — see {@link SpreadsheetMeta}. */
  meta(): SpreadsheetMeta {
    return this._meta;
  }

  setMeta(patch: Partial<SpreadsheetMeta>): void {
    Object.assign(this._meta, patch);
  }

  // ---- Cell Creation ----

  /** Register a resolved cell name in the prefix index for fast lookup. */
  private indexCell(resolved: string): void {
    // Extract the part after "!" (cell local name), e.g., "sum-amount-abc123".
    // Bucketing must be done against the known QUERYABLE_PREFIXES rather
    // than by splitting at the cell's first dash — cell ids are UUIDs and
    // routinely contain dashes themselves, and several prefixes (e.g.
    // "sum-amount-") have an internal dash before the id even starts, so a
    // naive first-dash split silently mis-buckets them (e.g. under "sum-"
    // instead of "sum-amount-"), and getCellsByPrefix() would then never
    // find them — the exact cells that most need direct invalidation,
    // since they're leaf query cells nothing else cascades into.
    const bang = resolved.indexOf("!");
    if (bang === -1) return;
    const localName = resolved.slice(bang + 1);
    for (const prefix of QUERYABLE_PREFIXES) {
      if (!localName.startsWith(prefix)) continue;
      let set = this.prefixIndex.get(prefix);
      if (!set) {
        set = new Set();
        this.prefixIndex.set(prefix, set);
      }
      set.add(resolved);
    }
  }

  createStatic(sheet: string, name: string, initialValue: CellValue = 0): void {
    const resolved = resolveName(sheet, name);
    const existing = this.cells.get(resolved);
    if (existing) {
      // Update existing cell — only mark dirty if value changed
      if (existing.value !== initialValue) {
        existing.value = initialValue;
        this.dirtyCells.push(resolved);
      }
      return;
    }
    this.cells.set(resolved, { type: "static", name: resolved, value: initialValue });
    this.graph.addNode(resolved);
    this.indexCell(resolved);
    this.dirtyCells.push(resolved);
  }

  /**
   * The cached value for a cell about to be created, or `undefined` when
   * there is none. Kept separate from the value itself because `null` is a
   * legitimate cached value.
   */
  private takePreloaded(resolved: string): { value: CellValue } | undefined {
    if (!this.preloadedValues.has(resolved)) return undefined;
    return { value: this.preloadedValues.get(resolved) as CellValue };
  }

  createDynamic(
    sheet: string,
    name: string,
    opts: {
      dependencies: string[];
      run: (...args: CellValue[]) => CellValue | Promise<CellValue>;
      initialValue?: CellValue;
      /**
       * Recompute even when a cached value is available. For cells whose
       * result depends on something the cache can't witness (upstream marks
       * its tracking spent/total-spent cells this way).
       */
      refresh?: boolean;
    },
  ): void {
    const resolved = resolveName(sheet, name);
    const resolvedDeps = opts.dependencies.map((dep) =>
      dep.includes("!") ? dep : resolveName(sheet, dep),
    );

    const existing = this.cells.get(resolved);
    if (existing && existing.type === "dynamic") {
      // Cell already exists — do nothing (idempotent, like loot-core).
      // Each cell should be created exactly once per month.
      return;
    }

    const preloaded = this.takePreloaded(resolved);

    this.cells.set(resolved, {
      type: "dynamic",
      name: resolved,
      value: preloaded ? preloaded.value : (opts.initialValue ?? 0),
      dependencies: resolvedDeps,
      run: opts.run,
    });

    this.graph.addNode(resolved);
    for (const dep of resolvedDeps) {
      this.graph.addEdge(dep, resolved);
    }
    this.indexCell(resolved);
    // A cell restored from cache already holds its computed value, so leaving
    // it clean is what skips the query. Anything not cached still computes,
    // and the topological cascade pulls its cached dependents along with it —
    // a partially-warm build heals itself.
    if (!preloaded || opts.refresh) {
      this.dirtyCells.push(resolved);
    }
  }

  // ---- Read ----

  getValue(sheet: string, name: string): CellValue {
    return this.cells.get(resolveName(sheet, name))?.value ?? 0;
  }

  getResolved(resolvedName: string): CellValue {
    return this.cells.get(resolvedName)?.value ?? 0;
  }

  hasCell(sheet: string, name: string): boolean {
    return this.cells.has(resolveName(sheet, name));
  }

  // ---- Write ----

  set(resolvedName: string, value: CellValue): void {
    const cell = this.cells.get(resolvedName);
    if (!cell) return;
    if (cell.value === value) return; // no change

    cell.value = value;
    // Mark as directly set so runComputations skips re-running this cell's
    // query (the DB hasn't been updated yet — this is an optimistic update).
    // Dependents will still be recomputed with the new value.
    this.directlySet.add(resolvedName);
    this.markDirty(resolvedName);
  }

  setByName(sheet: string, name: string, value: CellValue): void {
    this.set(resolveName(sheet, name), value);
  }

  // ---- Transactions (batching) ----

  startTransaction(): void {
    this.transactionDepth++;
  }

  endTransaction(): void {
    this.transactionDepth--;
    if (this.transactionDepth === 0 && this.dirtyCells.length > 0) {
      this.runComputations();
    }
  }

  transaction(fn: () => void): void {
    this.startTransaction();
    try {
      fn();
    } finally {
      this.endTransaction();
    }
  }

  async transactionAsync(fn: () => Promise<void>): Promise<void> {
    this.startTransaction();
    try {
      await fn();
    } finally {
      this.endTransaction();
    }
  }

  // ---- Computation ----

  private markDirty(name: string): void {
    this.dirtyCells.push(name);
    if (this.transactionDepth === 0 && !this.computing) {
      this.runComputations();
    }
  }

  private runComputations(): void {
    this.computing = true;
    const dirty = [...this.dirtyCells];
    this.dirtyCells = [];

    // Topological sort: get all cells that need recomputation in order
    const sorted = this.graph.topologicalSort(dirty);

    const changed: string[] = [];

    for (const name of sorted) {
      const cell = this.cells.get(name);
      if (!cell) continue;

      if (this.directlySet.has(name)) {
        // Cell was optimistically set via set() — value is already correct.
        // Just propagate to dependents without re-running the query.
        changed.push(name);
        continue;
      }

      if (cell.type === "dynamic") {
        // Gather dependency values
        const args = cell.dependencies.map((dep) => this.getResolved(dep));
        const oldValue = cell.value;
        const result = cell.run(...args);

        // Handle async results (SQL queries)
        if (result instanceof Promise) {
          if (__DEV__) console.warn(`[spreadsheet] async cell not supported: ${name}`);
          continue;
        }

        cell.value = result;
        if (cell.value !== oldValue) {
          changed.push(name);
        }
      } else {
        // Static cell was directly set — always counts as changed
        changed.push(name);
      }
    }

    this.directlySet.clear();

    this.computing = false;

    if (__DEV__ && changed.length > 0) {
      console.log(
        `[spreadsheet] runComputations: ${sorted.length} sorted, ${changed.length} changed`,
      );
    }

    // Notify listeners
    if (changed.length > 0) {
      this.version = ++versionCounter;
      for (const listener of this.listeners) {
        listener(changed);
      }
      // Keyed dispatch — O(changed) instead of each subscriber scanning
      // `changed` independently (O(subscribers × changed)).
      for (const name of changed) {
        const keyed = this.cellListeners.get(name);
        if (!keyed) continue;
        const value = this.getResolved(name);
        for (const listener of keyed) {
          listener(value);
        }
      }

      this.saveCachedCells(changed);
    }

    // The queue drained, so what's persisted now matches the data it was
    // computed from — unless a barrier says a mutation is still mid-flight.
    this.markCacheSafe();
  }

  // ---- Persisted value cache ----

  /**
   * Seed a value restored from the persisted cache. Deliberately does not
   * mark anything dirty (upstream's `Spreadsheet.load`) — call before building
   * cells, and the build will adopt these values instead of computing them.
   */
  load(resolvedName: string, value: CellValue): void {
    this.preloadedValues.set(resolvedName, value);
  }

  /** Whether any cached values are still waiting to be adopted by a build. */
  hasPreloadedValues(): boolean {
    return this.preloadedValues.size > 0;
  }

  saveCachedCells(names: string[]): void {
    if (names.length > 0) this.hooks?.saveCache(names);
  }

  markCacheSafe(): void {
    if (!this.cacheBarrier) this.hooks?.setCacheStatus({ clean: true });
  }

  /**
   * The persisted cache no longer describes the data. Also drops any
   * unconsumed preloads: they were read at open time, so a month built later
   * (ensureMonthRange) would otherwise adopt pre-mutation values — those cells
   * don't exist yet, so no invalidation can reach them.
   */
  markCacheDirty(): void {
    this.preloadedValues.clear();
    this.hooks?.setCacheStatus({ clean: false });
  }

  /**
   * Bracket a mutation window: nothing computed inside it may declare the
   * cache trustworthy, because the data is only partway updated.
   */
  startCacheBarrier(): void {
    this.cacheBarrier = true;
    this.markCacheDirty();
  }

  endCacheBarrier(): void {
    this.cacheBarrier = false;
    if (this.dirtyCells.length === 0 && !this.computing) this.markCacheSafe();
  }

  /**
   * Force recomputation of a specific cell and its dependents.
   */
  recompute(sheet: string, name: string): void {
    this.markDirty(resolveName(sheet, name));
  }

  /**
   * Force recomputation by resolved name (already includes sheet prefix).
   */
  recomputeResolved(resolvedName: string): void {
    this.markDirty(resolvedName);
  }

  /**
   * Get all cells (for inspection).
   */
  getCells(): Map<string, Cell> {
    return this.cells;
  }

  /**
   * Get all resolved cell names whose local name starts with prefix (e.g., "catSpent-").
   * O(1) lookup via the prefix index — avoids O(N) iteration in triggerBudgetChanges.
   */
  getCellsByPrefix(prefix: string): Set<string> {
    return this.prefixIndex.get(prefix) ?? new Set();
  }

  /**
   * Recompute all cells (e.g., after loading a new month).
   */
  recomputeAll(): void {
    this.startTransaction();
    for (const [name, cell] of this.cells) {
      if (cell.type === "dynamic") {
        this.dirtyCells.push(name);
      }
    }
    this.endTransaction();
  }

  // ---- Subscriptions ----

  onCellsChanged(fn: CellChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Subscribe to a single resolved cell name. O(1) dispatch cost per
   * notification (vs. onCellsChanged's O(changedNames) scan per listener).
   * Prefer this for components that watch one specific cell (e.g.
   * useSheetValue); use onCellsChanged only for whole-sheet observers.
   */
  onCellChanged(resolvedName: string, fn: (value: CellValue) => void): () => void {
    let set = this.cellListeners.get(resolvedName);
    if (!set) {
      set = new Set();
      this.cellListeners.set(resolvedName, set);
    }
    set.add(fn);
    return () => {
      const current = this.cellListeners.get(resolvedName);
      if (!current) return;
      current.delete(fn);
      if (current.size === 0) {
        this.cellListeners.delete(resolvedName);
      }
    };
  }

  // ---- Cleanup ----

  /**
   * Remove all cells for a sheet (e.g., when navigating away from a month).
   */
  clearSheet(sheet: string): void {
    const prefix = `${sheet}!`;
    for (const name of [...this.cells.keys()]) {
      if (name.startsWith(prefix)) {
        this.graph.removeNode(name);
        this.cells.delete(name);
        // The name must leave the prefix index and the optimistic-write set
        // too, or getCellsByPrefix() keeps handing dead names to
        // triggerBudgetChanges and directlySet leaks a stale entry.
        this.directlySet.delete(name);
        for (const set of this.prefixIndex.values()) {
          set.delete(name);
        }
      }
    }
  }

  /** Remove all cells and reset. */
  clear(): void {
    this.cells.clear();
    this.graph = new DependencyGraph();
    this.dirtyCells = [];
    this.transactionDepth = 0;
  }
}
