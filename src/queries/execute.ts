/**
 * Query executor — runs compiled AQL queries against expo-sqlite.
 */

import type { SQLiteBindParams } from "expo-sqlite";
import { runQuery } from "../db";
import { compile, convertOutputRow, type CompiledQuery } from "./compiler";
import type { Query, QueryState } from "./query";

export type QueryResult<T> = {
  data: T[];
  dependencies: string[];
};

/**
 * Compile and execute an AQL query against the local SQLite database.
 */
export async function executeQuery<T = Record<string, unknown>>(
  query: Query | QueryState,
): Promise<QueryResult<T>> {
  const state = "serialize" in query ? query.serialize() : query;
  const compiled = compile(state);
  return executeCompiled<T>(compiled);
}

/**
 * Execute a pre-compiled query.
 */
export async function executeCompiled<T = Record<string, unknown>>(
  compiled: CompiledQuery,
): Promise<QueryResult<T>> {
  const rows = await runQuery<Record<string, unknown>>(
    compiled.sql,
    compiled.params as SQLiteBindParams,
  );
  // Convert boolean 0/1 to true/false (SQLite stores booleans as integers)
  const boolFields: string[] = [];
  for (const [key, type] of compiled.outputTypes) {
    if (type === "boolean") boolFields.push(key);
  }
  const data =
    boolFields.length > 0
      ? rows.map((row) => {
          const r = { ...row };
          for (const f of boolFields) {
            if (f in r) r[f] = r[f] === 1 || r[f] === true;
          }
          return r as T;
        })
      : (rows as T[]);
  return { data, dependencies: compiled.dependencies };
}

/**
 * Execute a query and return the count (for totalCount in PagedQuery).
 */
export async function executeCount(query: Query | QueryState): Promise<number> {
  const state = "serialize" in query ? query.serialize() : query;

  // Build a COUNT query by stripping select/order/limit/offset
  const countState: QueryState = {
    ...state,
    selectExpressions: [{ count: { $count: "$id" } }],
    orderExpressions: [],
    groupExpressions: [],
    calculation: true,
    limit: null,
    offset: null,
  };

  const compiled = compile(countState);
  const rows = await runQuery<{ count: number }>(compiled.sql, compiled.params as SQLiteBindParams);
  return rows[0]?.count ?? 0;
}
