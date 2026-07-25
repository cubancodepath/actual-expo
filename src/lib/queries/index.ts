/**
 * Reactive query layer — the client-side counterpart to the AQL engine.
 *
 * Mirrors upstream's `desktop-client/src/queries/` (aqlQuery + liveQuery +
 * pagedQuery): the pieces that keep a query subscribed and re-running as data
 * changes. The engine itself (compiler/schema/exec) is in `@/core/server/aql`,
 * and the one-shot `executeQuery` adapter sits beside it there because `core/`
 * calls it too — `core` may not import from `lib`.
 *
 * Not to be confused with `@/lib/tanstack/` — the TanStack Query
 * wiring: query client, ambient types, per-domain query options.
 */

export { q, Query, getPrimaryOrderBy } from "@/core/shared/query";
export type { QueryState, ObjectExpression } from "@/core/shared/query";

export { executeQuery, executeCount } from "@/core/server/aql/execute";
export type { QueryResult } from "@/core/server/aql/execute";

export { liveQuery } from "./liveQuery";
export type { LiveQueryInstance, LiveQueryOptions } from "./liveQuery";

export { pagedQuery } from "./pagedQuery";
export type { PagedQueryInstance, PagedQueryOptions } from "./pagedQuery";
