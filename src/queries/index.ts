/**
 * AQL — Actual Query Language for expo-sqlite.
 *
 * Ported from Actual Budget's loot-core query system.
 * Provides declarative query building, auto-refreshing live queries,
 * and paginated queries with optimistic update support.
 */

export { q, Query, getPrimaryOrderBy } from "./query";
export type { QueryState, ObjectExpression } from "./query";

export { compile, convertOutputRow } from "./compiler";
export type { CompiledQuery } from "./compiler";

export { executeQuery, executeCompiled, executeCount } from "./execute";
export type { QueryResult } from "./execute";

export { liveQuery } from "./liveQuery";
export type { LiveQueryInstance, LiveQueryOptions } from "./liveQuery";

export { pagedQuery } from "./pagedQuery";
export type { PagedQueryInstance, PagedQueryOptions } from "./pagedQuery";

export { registerQuery, unregisterQuery, refreshQueriesForDatasets } from "./queryRegistry";

export { schema } from "./schema";
export type { Schema, TableDef, FieldDef, FieldType } from "./schema";
