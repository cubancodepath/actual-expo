// Faithful port of loot-core src/server/aql/index.ts — the public AQL entry.
// `aqlQuery` returns `{ data, dependencies }` (dependencies = base table +
// joined tables, used by the reactive layer for cache invalidation).
//
// Expo addition (no semantic change): compilation is memoized. Compiling is
// pure — schema/schemaConfig are module constants and params bind at run time
// in `runCompiledAqlQuery` — but reports and liveQuery re-issue the same query
// shapes constantly, so `aqlQuery` routes through a bounded LRU of compiled
// `{sqlPieces, state}` keyed on the serialized QueryState. `exec.ts` stays
// untouched (upstream-mirrored).
import { Query } from "@/core/shared/query";
import type { QueryState } from "@/core/shared/query";

import { compileQuery } from "./compiler";
import type { CompilerState, SqlPieces } from "./compiler";
import { runCompiledAqlQuery } from "./exec";
import type { AqlQueryParams } from "./exec";
import { schema, schemaConfig } from "./schema";
import { schemaExecutors } from "./schema/executors";

const COMPILE_CACHE_MAX = 200;
const compileCache = new Map<string, { sqlPieces: SqlPieces; state: CompilerState }>();

function compileCached(queryState: QueryState): { sqlPieces: SqlPieces; state: CompilerState } {
  const key = JSON.stringify(queryState);
  const hit = compileCache.get(key);
  if (hit) {
    // Map iterates in insertion order — re-insert to mark as most recent.
    compileCache.delete(key);
    compileCache.set(key, hit);
    return hit;
  }

  const { sqlPieces, state } = compileQuery(queryState, schema, schemaConfig);
  const entry = { sqlPieces, state };
  compileCache.set(key, entry);
  if (compileCache.size > COMPILE_CACHE_MAX) {
    compileCache.delete(compileCache.keys().next().value as string);
  }
  return entry;
}

/** Test-only: number of distinct compiled entries currently cached. */
export function __getCompileCacheSize(): number {
  return compileCache.size;
}

/** Test-only: drop all cached compilations. */
export function __clearCompileCache(): void {
  compileCache.clear();
}

export {
  convertForInsert,
  convertForUpdate,
  convertFromSelect,
  convertInputType,
  convertOutputType,
} from "./schema-helpers";
export { compileQuery, quoteAlias, isAggregateQuery } from "./compiler";
export type { CompilerState, SqlPieces, SchemaConfig, OutputTypes } from "./compiler";
export { makeViews } from "./views";
export { schema, schemaConfig } from "./schema";
export { expoDialect, RegexpUnsupportedError } from "./dialect";
export type { SqlDialect } from "./dialect";

export function aqlCompiledQuery(
  queryState: QueryState,
  sqlPieces: SqlPieces,
  compilerState: CompilerState,
  params?: AqlQueryParams,
) {
  return runCompiledAqlQuery(queryState, sqlPieces, compilerState, {
    params,
    executors: schemaExecutors,
  });
}

export async function aqlQuery<T = unknown>(
  query: Query | QueryState,
  params?: AqlQueryParams,
): Promise<{ data: T; dependencies: string[] }> {
  if (query instanceof Query) {
    query = query.serialize();
  }

  const { sqlPieces, state } = compileCached(query);
  const data = await runCompiledAqlQuery(query, sqlPieces, state, {
    params,
    executors: schemaExecutors,
  });
  return { data: data as T, dependencies: state.dependencies };
}

/**
 * Compile-only: the tables a query depends on (base + joined), without running
 * it. Used by the reactive layer (`liveQuery`/`pagedQuery`) to seed the
 * table-subscription set before the first fetch.
 */
export function getQueryDependencies(query: Query | QueryState): string[] {
  const state = query instanceof Query ? query.serialize() : query;
  return compileCached(state).state.dependencies;
}
