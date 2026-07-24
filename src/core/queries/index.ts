/**
 * Reactive query layer barrel.
 *
 * The AQL engine (compiler/schema/exec) now lives in `@/core/server/aql` (a
 * faithful port of upstream). This module keeps the app-facing reactive pieces:
 * the `Query` builder (re-exported from `@/core/shared/query`), one-shot
 * `executeQuery`/`executeCount`, and the auto-refreshing `liveQuery`/`pagedQuery`.
 *
 * TODO(refactor: align to upstream): upstream keeps these reactive live-query
 * helpers in `loot-core/src/client/query-helpers` (NOT in `server/aql`, which is
 * the pure engine). This `src/core/queries/` dir is our stand-in because expo has
 * no `client/` layer. When we do the client/ alignment pass, rename+move these
 * files (liveQuery/pagedQuery/queryCache/execute) to a `src/core/client/`-style
 * location matching upstream, and drop this barrel's `q`/`Query` re-exports so
 * consumers import the builder straight from `@/core/shared/query`.
 */

export { q, Query, getPrimaryOrderBy } from "@/core/shared/query";
export type { QueryState, ObjectExpression } from "@/core/shared/query";

export { executeQuery, executeCount } from "./execute";
export type { QueryResult } from "./execute";

export { liveQuery } from "./liveQuery";
export type { LiveQueryInstance, LiveQueryOptions } from "./liveQuery";

export { pagedQuery } from "./pagedQuery";
export type { PagedQueryInstance, PagedQueryOptions } from "./pagedQuery";
