/**
 * Declarative optimistic mutation engine for local-first apps.
 *
 * Consumers declare WHAT changed, the engine handles HOW to update state.
 * After the optimistic update, the real DB mutation runs in background.
 * The storeRegistry refresh (sendMessages → refreshStoresForDatasets)
 * overwrites optimistic state with DB truth once the write completes.
 *
 * No rollback needed — local SQLite writes virtually never fail.
 *
 * @example
 * // Update a field on an entity
 * mutate.update(useCategoriesStore, "categories", id, { hidden: true },
 *   () => updateCategory(id, { hidden: true }),
 * );
 *
 * // Remove an entity from a collection
 * mutate.remove(useCategoriesStore, "categories", id,
 *   () => deleteCategory(id),
 * );
 *
 * // Low-level: custom updater for complex cases
 * mutate(store, (s) => ({ ... }), () => mutation());
 */

import type { StoreApi } from "zustand";

type Store<T> = {
  setState: StoreApi<T>["setState"];
  getState: StoreApi<T>["getState"];
};

type Entity = { id: string };

function fireAndForget(mutation: () => Promise<void>): void {
  mutation().catch((err) => {
    if (__DEV__) console.warn("[mutate] failed, store will self-correct:", err);
  });
}

/**
 * Low-level optimistic update with a custom updater function.
 * Use `mutate.update` or `mutate.remove` for common cases.
 */
function mutate<T>(
  store: Store<T>,
  updater: (state: T) => Partial<T>,
  mutation: () => Promise<void>,
): void {
  store.setState(updater(store.getState()));
  fireAndForget(mutation);
}

/**
 * Optimistically update fields on a single entity in a collection.
 * Finds the entity by `id`, merges `fields`, fires mutation in background.
 */
mutate.update = function update<T, K extends keyof T>(
  store: Store<T>,
  collection: K,
  id: string,
  fields: Partial<T[K] extends (infer E)[] ? E : never>,
  mutation: () => Promise<void>,
): void {
  const items = store.getState()[collection] as Entity[];
  store.setState({
    [collection]: items.map((item) => (item.id === id ? { ...item, ...fields } : item)),
  } as Partial<T>);
  fireAndForget(mutation);
};

/**
 * Optimistically remove an entity from a collection by id.
 */
mutate.remove = function remove<T>(
  store: Store<T>,
  collection: keyof T,
  id: string,
  mutation: () => Promise<void>,
): void {
  const items = store.getState()[collection] as Entity[];
  store.setState({
    [collection]: items.filter((item) => item.id !== id),
  } as Partial<T>);
  fireAndForget(mutation);
};

export { mutate };
