/**
 * Reactive query layer barrel.
 *
 * The AQL engine (compiler/schema/exec) now lives in `@/core/server/aql` (a
 * faithful port of upstream). This module keeps the app-facing reactive pieces:
 * the `Query` builder (re-exported from `@/core/shared/query`), one-shot
 * `executeQuery`/`executeCount`, and the auto-refreshing `liveQuery`/`pagedQuery`.
 */

export { q, Query, getPrimaryOrderBy } from "@/core/shared/query";
export type { QueryState, ObjectExpression } from "@/core/shared/query";

export { executeQuery, executeCount } from "./execute";
export type { QueryResult } from "./execute";

export { liveQuery } from "./liveQuery";
export type { LiveQueryInstance, LiveQueryOptions } from "./liveQuery";

export { pagedQuery } from "./pagedQuery";
export type { PagedQueryInstance, PagedQueryOptions } from "./pagedQuery";
