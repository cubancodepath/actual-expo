// Faithful port of loot-core src/server/aql/index.ts — the public AQL entry.
// `aqlQuery` returns `{ data, dependencies }` (dependencies = base table +
// joined tables, used by the reactive layer for cache invalidation).
import { Query } from "@/core/shared/query";
import type { QueryState } from "@/core/shared/query";

import { compileQuery } from "./compiler";
import type { CompilerState, SqlPieces } from "./compiler";
import { compileAndRunAqlQuery, runCompiledAqlQuery } from "./exec";
import type { AqlQueryParams } from "./exec";
import { schema, schemaConfig } from "./schema";
import { schemaExecutors } from "./schema/executors";

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

export function aqlQuery<T = unknown>(
  query: Query | QueryState,
  params?: AqlQueryParams,
): Promise<{ data: T; dependencies: string[] }> {
  if (query instanceof Query) {
    query = query.serialize();
  }

  return compileAndRunAqlQuery(schema, schemaConfig, query, {
    params,
    executors: schemaExecutors,
  }) as Promise<{ data: T; dependencies: string[] }>;
}

/**
 * Compile-only: the tables a query depends on (base + joined), without running
 * it. Used by the reactive layer (`liveQuery`/`pagedQuery`) to seed the
 * table-subscription set before the first fetch.
 */
export function getQueryDependencies(query: Query | QueryState): string[] {
  const state = query instanceof Query ? query.serialize() : query;
  const { state: compilerState } = compileQuery(state, schema, schemaConfig);
  return compilerState.dependencies;
}
