type StoreEntry = {
  datasets: string[];
  load: () => Promise<void>;
};

const registry = new Map<string, StoreEntry>();

export function registerStore(
  name: string,
  datasets: string[],
  load: () => Promise<void>,
) {
  registry.set(name, { datasets, load });
}

export async function refreshStoresForDatasets(
  datasets: Set<string>,
): Promise<void> {
  const loads: Promise<void>[] = [];

  for (const [, entry] of registry) {
    if (entry.datasets.some((d) => datasets.has(d))) {
      loads.push(entry.load());
    }
  }

  if (loads.length === 0) return;

  const results = await Promise.allSettled(loads);
  for (const r of results) {
    if (r.status === 'rejected') {
      console.warn('[storeRegistry] load failed:', r.reason);
    }
  }
}

export async function refreshAllRegisteredStores(): Promise<void> {
  const loads = [...registry.values()].map((e) => e.load());
  const results = await Promise.allSettled(loads);
  for (const r of results) {
    if (r.status === 'rejected') {
      console.warn('[storeRegistry] load failed:', r.reason);
    }
  }
}
