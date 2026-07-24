// Faithful port of loot-core src/server/aql/exec.ts. Runs compiled AQL against
// the DB (via the `@/core/db` seam — already async on expo-sqlite) and maps rows
// back through `convertOutputType`. `.calculate()` unwraps to a scalar.
import * as db from "@/core/db";
import type { QueryState } from "@/core/shared/query";

import { compileQuery, defaultConstructQuery } from "./compiler";
import type { CompilerState, OutputTypes, SchemaConfig, SqlPieces } from "./compiler";
import type { SqlDialect } from "./dialect";
import { convertInputType, convertOutputType, type Schema } from "./schema-helpers";

function applyTypes(data: Record<string, unknown>[], outputTypes: OutputTypes) {
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    Object.keys(item).forEach((name) => {
      item[name] = convertOutputType(item[name], outputTypes.get(name) as string);
    });
  }
}

export async function execQuery(
  queryState: QueryState,
  compilerState: CompilerState,
  sqlPieces: SqlPieces,
  params: (string | number)[],
  outputTypes: OutputTypes,
) {
  const sql = defaultConstructQuery(queryState, compilerState, sqlPieces);
  const data = await db.all<Record<string, unknown>>(sql, params);
  applyTypes(data, outputTypes);
  return data;
}

export type AqlQueryExecutor = (
  compilerState: CompilerState,
  queryState: QueryState,
  sqlPieces: SqlPieces,
  params: (string | number)[],
  outputTypes: OutputTypes,
) => Promise<Record<string, unknown>[]>;

type AqlQueryParamName = string;
type AqlQueryParamValue = unknown;
export type AqlQueryParams = Record<AqlQueryParamName, AqlQueryParamValue>;

export type RunCompiledAqlQueryOptions = {
  params?: AqlQueryParams;
  executors?: Record<string, AqlQueryExecutor>;
};

export async function runCompiledAqlQuery(
  queryState: QueryState,
  sqlPieces: SqlPieces,
  compilerState: CompilerState,
  { params = {}, executors = {} }: RunCompiledAqlQueryOptions = {},
) {
  const paramArray = compilerState.namedParameters.map((param) => {
    const name = param.paramName;
    if (params[name] === undefined) {
      throw new Error(`Parameter ${name} not provided to query`);
    }
    return convertInputType(params[name], param.paramType as string) as string | number;
  });

  let data: Record<string, unknown>[] = [];
  if (executors[compilerState.implicitTableName]) {
    data = await executors[compilerState.implicitTableName](
      compilerState,
      queryState,
      sqlPieces,
      paramArray,
      compilerState.outputTypes,
    );
  } else {
    data = await execQuery(
      queryState,
      compilerState,
      sqlPieces,
      paramArray,
      compilerState.outputTypes,
    );
  }

  if (queryState.calculation) {
    if (data.length > 0) {
      const row = data[0];
      const k = Object.keys(row)[0];
      // TODO: the function being run should determine the default value.
      return row[k] || 0;
    } else {
      return null;
    }
  }

  return data;
}

export async function compileAndRunAqlQuery(
  schema: Schema,
  schemaConfig: SchemaConfig,
  queryState: QueryState,
  options?: RunCompiledAqlQueryOptions,
  dialect?: SqlDialect,
) {
  const { sqlPieces, state } = compileQuery(queryState, schema, schemaConfig, dialect);
  const data = await runCompiledAqlQuery(queryState, sqlPieces, state, options);
  return { data, dependencies: state.dependencies };
}
