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

import { DependencyGraph } from "./graph";

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function resolveName(sheet: string, name: string): string {
  return `${sheet}!${name}`;
}

export function unresolveName(resolved: string): { sheet: string; name: string } {
  const idx = resolved.indexOf("!");
  return { sheet: resolved.slice(0, idx), name: resolved.slice(idx + 1) };
}

function safeNumber(n: unknown): number {
  if (typeof n === "number" && !Number.isNaN(n)) return n;
  return 0;
}

// ---------------------------------------------------------------------------
// Spreadsheet
// ---------------------------------------------------------------------------

export class Spreadsheet {
  private cells = new Map<string, Cell>();
  private graph = new DependencyGraph();
  private dirtyCells: string[] = [];
  private transactionDepth = 0;
  private listeners = new Set<CellChangeListener>();
  private computing = false;
  /** Cells that were directly set (optimistic) — skip their run() in next computation. */
  private directlySet = new Set<string>();

  /** Monotonic counter incremented after every computation with changes. */
  version = 0;

  // ---- Cell Creation ----

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
    this.dirtyCells.push(resolved);
  }

  createDynamic(
    sheet: string,
    name: string,
    opts: {
      dependencies: string[];
      run: (...args: CellValue[]) => CellValue | Promise<CellValue>;
      initialValue?: CellValue;
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

    this.cells.set(resolved, {
      type: "dynamic",
      name: resolved,
      value: opts.initialValue ?? 0,
      dependencies: resolvedDeps,
      run: opts.run,
    });

    this.graph.addNode(resolved);
    for (const dep of resolvedDeps) {
      this.graph.addEdge(dep, resolved);
    }

    this.dirtyCells.push(resolved);
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
      this.version++;
      for (const listener of this.listeners) {
        listener(changed);
      }
    }
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
   * Get all cells (for inspection by triggerBudgetChanges).
   */
  getCells(): Map<string, Cell> {
    return this.cells;
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

  // ---- Cleanup ----

  /**
   * Remove all cells for a sheet (e.g., when navigating away from a month).
   */
  removeSheet(sheet: string): void {
    const prefix = `${sheet}!`;
    for (const name of [...this.cells.keys()]) {
      if (name.startsWith(prefix)) {
        this.graph.removeNode(name);
        this.cells.delete(name);
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
