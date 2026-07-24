/**
 * Reactive-layer query executor — now a thin adapter over the faithful AQL port
 * in `@/core/server/aql`. Keeps the `{ data, dependencies }` contract the
 * reactive layer (liveQuery/pagedQuery) depends on, and preserves the public
 * `executeQuery`/`executeCount` signatures so existing consumers are unaffected.
 */

import { aqlQuery } from "@/core/server/aql";
import type { Query, QueryState } from "@/core/shared/query";

export type QueryResult<T> = {
  data: T[];
  dependencies: string[];
};

function toState(query: Query | QueryState): QueryState {
  const state = "serialize" in query ? query.serialize() : query;
  // App convention (preserved from the previous flat compiler): a reactive query
  // with no explicit `.select()` returns ALL fields. The faithful AQL compiler
  // instead defaults an empty select to just `id`, so expand it to `*` here — an
  // adapter-layer default, NOT a compiler/schema change. Calculations keep their
  // own select.
  if (!state.calculation && state.selectExpressions.length === 0) {
    return { ...state, selectExpressions: ["*"] } as unknown as QueryState;
  }
  return state;
}

/** Compile and execute an AQL query against the local SQLite database. */
export async function executeQuery<T = Record<string, unknown>>(
  query: Query | QueryState,
): Promise<QueryResult<T>> {
  const state = toState(query);
  const { data, dependencies } = await aqlQuery(state);
  // `aqlQuery` unwraps `.calculate()` to a scalar (upstream contract), but the
  // reactive-layer consumers read `data[0].result`. Re-wrap so their shape is
  // preserved; direct `aqlQuery` callers (spreadsheets) still get the scalar.
  if (state.calculation) {
    return { data: [{ result: data }] as unknown as T[], dependencies };
  }
  return { data: (data ?? []) as T[], dependencies };
}

/** Execute a query and return the count (for totalCount in PagedQuery). */
export async function executeCount(query: Query | QueryState): Promise<number> {
  const state = toState(query);

  // Build a COUNT query by stripping select/order/group/limit/offset.
  const countState = {
    ...state,
    selectExpressions: [{ result: { $count: "*" } }],
    orderExpressions: [],
    groupExpressions: [],
    calculation: true,
    limit: null,
    offset: null,
  } as unknown as QueryState;

  const { data } = await aqlQuery(countState);
  return typeof data === "number" ? data : 0;
}
