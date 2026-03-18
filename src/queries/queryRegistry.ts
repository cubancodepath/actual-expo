/**
 * Registry for active live queries.
 *
 * Parallel to storeRegistry but for arbitrary query callbacks.
 * When _applyAndRecord fires in batch.ts, it notifies both registries.
 * Live queries that depend on affected datasets auto-refresh.
 */

type QueryEntry = {
  datasets: string[];
  refresh: () => void;
};

const registry = new Map<string, QueryEntry>();

export function registerQuery(id: string, datasets: string[], refresh: () => void): void {
  registry.set(id, { datasets, refresh });
}

export function unregisterQuery(id: string): void {
  registry.delete(id);
}

export function refreshQueriesForDatasets(datasets: Set<string>): void {
  for (const [, entry] of registry) {
    if (entry.datasets.some((d) => datasets.has(d))) {
      entry.refresh();
    }
  }
}
