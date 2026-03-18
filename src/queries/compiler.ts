/**
 * AQL Compiler — compiles QueryState into SQL + params for expo-sqlite.
 *
 * Ported from Actual Budget's loot-core server AQL compiler, adapted to
 * execute directly against expo-sqlite instead of IPC to a server.
 */

import type { QueryState, ObjectExpression } from "./query";
import { schema, getMappingJoin, type FieldDef, type FieldType, type Schema } from "./schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CompiledQuery = {
  sql: string;
  params: unknown[];
  dependencies: string[];
  outputTypes: Map<string, FieldType>;
};

type TypedExpr = {
  value: string;
  type: FieldType | "null" | "param" | "array";
  literal?: boolean;
};

type PathInfo = {
  tableName: string;
  tableId: string;
  joinField: string;
  joinTable: string;
};

type CompilerState = {
  schema: Schema;
  table: string;
  tableId: string;
  paths: Map<string, PathInfo>;
  params: unknown[];
  dependencies: Set<string>;
  outputTypes: Map<string, FieldType>;
  uidCounters: Map<string, number>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uid(state: CompilerState, name: string): string {
  const count = (state.uidCounters.get(name) ?? 0) + 1;
  state.uidCounters.set(name, count);
  return `${name}${count}`;
}

function quoteAlias(name: string): string {
  return `"${name}"`;
}

function addTombstone(tableDef: { fields: Record<string, FieldDef> } | undefined, tableId: string): string {
  if (tableDef?.fields.tombstone) {
    return `${tableId}.tombstone = 0`;
  }
  return "";
}

function convertInputValue(value: unknown, type: FieldType): unknown {
  if (value === null || value === undefined) return null;
  switch (type) {
    case "boolean":
      return value ? 1 : 0;
    case "date": {
      if (typeof value === "string") {
        // "2024-03-19" → 20240319
        return parseInt(value.replace(/-/g, ""), 10);
      }
      return value;
    }
    default:
      return value;
  }
}

// ---------------------------------------------------------------------------
// Field Resolution
// ---------------------------------------------------------------------------

function resolveField(
  state: CompilerState,
  field: string,
): { sql: string; type: FieldType; table: string } {
  // Handle dotted paths: "payee.name" → join payees, return payees.name
  const parts = field.split(".");

  if (parts.length === 1) {
    // Simple field on the main table
    const fieldDef = state.schema[state.table]?.fields[field];
    if (!fieldDef) {
      throw new Error(`Unknown field "${field}" on table "${state.table}"`);
    }
    return { sql: `${state.tableId}.${field}`, type: fieldDef.type, table: state.table };
  }

  // Dotted path — resolve through joins
  let currentTable = state.table;
  let currentTableId = state.tableId;

  for (let i = 0; i < parts.length - 1; i++) {
    const segment = parts[i];
    const pathKey = `${currentTable}.${segment}`;

    let pathInfo = state.paths.get(pathKey);
    if (!pathInfo) {
      const fieldDef = state.schema[currentTable]?.fields[segment];
      if (!fieldDef?.ref) {
        throw new Error(`Field "${segment}" on "${currentTable}" has no ref for join`);
      }

      // Check for mapping table (payee_mapping, category_mapping)
      const mapping = getMappingJoin(segment);
      const targetTable = fieldDef.ref;
      const targetTableId = uid(state, targetTable);

      pathInfo = {
        tableName: targetTable,
        tableId: targetTableId,
        joinField: segment,
        joinTable: currentTableId,
      };
      state.paths.set(pathKey, pathInfo);
      state.dependencies.add(targetTable);

      // If there's a mapping table, add it too
      if (mapping) {
        const mappingId = uid(state, mapping.mappingTable);
        state.paths.set(`${pathKey}__mapping`, {
          tableName: mapping.mappingTable,
          tableId: mappingId,
          joinField: segment,
          joinTable: currentTableId,
        });
        // The actual join field uses COALESCE(mapping.targetId, original)
        pathInfo.joinField = `COALESCE(${mappingId}.${mapping.column}, ${currentTableId}.${segment})`;
      }
    }

    currentTable = pathInfo.tableName;
    currentTableId = pathInfo.tableId;
  }

  // Final field on the resolved table
  const finalField = parts[parts.length - 1];
  const finalFieldDef = state.schema[currentTable]?.fields[finalField];
  if (!finalFieldDef) {
    throw new Error(`Unknown field "${finalField}" on table "${currentTable}"`);
  }

  return { sql: `${currentTableId}.${finalField}`, type: finalFieldDef.type, table: currentTable };
}

// ---------------------------------------------------------------------------
// Expression Compilation
// ---------------------------------------------------------------------------

function compileValue(state: CompilerState, value: unknown, contextType: FieldType): TypedExpr {
  if (value === null || value === undefined) {
    return { value: "NULL", type: "null", literal: true };
  }

  if (Array.isArray(value)) {
    // For $oneof
    const items = value.map((v) => {
      state.params.push(convertInputValue(v, contextType));
      return "?";
    });
    return { value: `(${items.join(", ")})`, type: "array", literal: true };
  }

  state.params.push(convertInputValue(value, contextType));
  return { value: "?", type: contextType };
}

function compileFieldRef(state: CompilerState, ref: string): TypedExpr {
  // Field refs start with $ in expressions: "$amount", "$payee.name"
  const fieldName = ref.startsWith("$") ? ref.slice(1) : ref;
  const resolved = resolveField(state, fieldName);
  return { value: resolved.sql, type: resolved.type, literal: true };
}

function compileExpression(state: CompilerState, expr: unknown): TypedExpr {
  if (expr === null || expr === undefined) {
    return { value: "NULL", type: "null", literal: true };
  }

  if (typeof expr === "string") {
    if (expr.startsWith("$")) {
      return compileFieldRef(state, expr);
    }
    // Literal string value
    state.params.push(expr);
    return { value: "?", type: "string" };
  }

  if (typeof expr === "number") {
    state.params.push(expr);
    return { value: "?", type: "integer" };
  }

  if (typeof expr === "boolean") {
    state.params.push(expr ? 1 : 0);
    return { value: "?", type: "boolean" };
  }

  if (typeof expr === "object" && !Array.isArray(expr)) {
    return compileFunction(state, expr as ObjectExpression);
  }

  state.params.push(expr);
  return { value: "?", type: "string" };
}

function compileFunction(state: CompilerState, expr: ObjectExpression): TypedExpr {
  const keys = Object.keys(expr);
  if (keys.length !== 1) {
    throw new Error(`Function expression must have exactly one key: ${JSON.stringify(expr)}`);
  }

  const fn = keys[0];
  const arg = expr[fn];

  switch (fn) {
    case "$sum": {
      const inner = compileExpression(state, arg);
      return { value: `SUM(${inner.value})`, type: "integer", literal: true };
    }
    case "$count": {
      const inner = compileExpression(state, arg);
      return { value: `COUNT(${inner.value})`, type: "integer", literal: true };
    }
    case "$month": {
      const inner = compileExpression(state, arg);
      return { value: `SUBSTR(${inner.value}, 1, 6)`, type: "string", literal: true };
    }
    case "$year": {
      const inner = compileExpression(state, arg);
      return { value: `SUBSTR(${inner.value}, 1, 4)`, type: "string", literal: true };
    }
    case "$lower": {
      const inner = compileExpression(state, arg);
      return { value: `LOWER(${inner.value})`, type: "string", literal: true };
    }
    case "$abs": {
      const inner = compileExpression(state, arg);
      return { value: `ABS(${inner.value})`, type: inner.type, literal: true };
    }
    case "$neg": {
      const inner = compileExpression(state, arg);
      return { value: `-(${inner.value})`, type: inner.type, literal: true };
    }
    default:
      throw new Error(`Unknown function: ${fn}`);
  }
}

// ---------------------------------------------------------------------------
// Filter (WHERE) Compilation
// ---------------------------------------------------------------------------

function compileCondition(state: CompilerState, field: string, condition: unknown): string {
  const resolved = resolveField(state, field);
  const left = resolved.sql;
  const fieldType = resolved.type;

  // Simple equality: { field: value }
  if (condition === null || condition === undefined) {
    return `${left} IS NULL`;
  }

  if (typeof condition !== "object" || Array.isArray(condition)) {
    const rhs = compileValue(state, condition, fieldType);
    return `${left} = ${rhs.value}`;
  }

  // Operator object: { $gt: value }
  const ops = condition as Record<string, unknown>;
  const clauses: string[] = [];

  for (const [op, value] of Object.entries(ops)) {
    switch (op) {
      case "$eq":
        if (value === null) {
          clauses.push(`${left} IS NULL`);
        } else {
          const rhs = compileValue(state, value, fieldType);
          clauses.push(`${left} = ${rhs.value}`);
        }
        break;
      case "$ne":
        if (value === null) {
          clauses.push(`${left} IS NOT NULL`);
        } else {
          const rhs = compileValue(state, value, fieldType);
          clauses.push(`${left} != ${rhs.value}`);
        }
        break;
      case "$gt": {
        const rhs = compileValue(state, value, fieldType);
        clauses.push(`${left} > ${rhs.value}`);
        break;
      }
      case "$gte": {
        const rhs = compileValue(state, value, fieldType);
        clauses.push(`${left} >= ${rhs.value}`);
        break;
      }
      case "$lt": {
        const rhs = compileValue(state, value, fieldType);
        clauses.push(`${left} < ${rhs.value}`);
        break;
      }
      case "$lte": {
        const rhs = compileValue(state, value, fieldType);
        clauses.push(`${left} <= ${rhs.value}`);
        break;
      }
      case "$like": {
        const rhs = compileValue(state, value, "string");
        clauses.push(`${left} LIKE ${rhs.value}`);
        break;
      }
      case "$notlike": {
        const rhs = compileValue(state, value, "string");
        clauses.push(`${left} NOT LIKE ${rhs.value}`);
        break;
      }
      case "$oneof": {
        if (!Array.isArray(value) || value.length === 0) {
          clauses.push("0"); // empty IN → always false
        } else {
          const rhs = compileValue(state, value, fieldType);
          clauses.push(`${left} IN ${rhs.value}`);
        }
        break;
      }
      default:
        throw new Error(`Unknown operator: ${op}`);
    }
  }

  return clauses.length === 1 ? clauses[0] : `(${clauses.join(" AND ")})`;
}

function compileFilterExpr(state: CompilerState, expr: ObjectExpression): string {
  const clauses: string[] = [];

  for (const [key, value] of Object.entries(expr)) {
    if (key === "$and") {
      const subExprs = value as ObjectExpression[];
      const subClauses = subExprs.map((e) => compileFilterExpr(state, e));
      clauses.push(`(${subClauses.join(" AND ")})`);
    } else if (key === "$or") {
      const subExprs = value as ObjectExpression[];
      const subClauses = subExprs.map((e) => compileFilterExpr(state, e));
      clauses.push(`(${subClauses.join(" OR ")})`);
    } else {
      clauses.push(compileCondition(state, key, value));
    }
  }

  return clauses.length === 1 ? clauses[0] : clauses.join(" AND ");
}

// ---------------------------------------------------------------------------
// SELECT Compilation
// ---------------------------------------------------------------------------

function compileSelect(state: CompilerState, queryState: QueryState): string {
  const exprs = queryState.selectExpressions;

  if (exprs.length === 0 || (exprs.length === 1 && exprs[0] === "*")) {
    // SELECT * — expand all fields from the main table
    const tableDef = state.schema[state.table];
    if (!tableDef) return `${state.tableId}.*`;

    const fields = Object.keys(tableDef.fields).map((f) => {
      state.outputTypes.set(f, tableDef.fields[f].type);
      return `${state.tableId}.${f} AS ${quoteAlias(f)}`;
    });
    return fields.join(", ");
  }

  const parts: string[] = [];

  for (const expr of exprs) {
    if (typeof expr === "string") {
      if (expr === "*") {
        parts.push(`${state.tableId}.*`);
        continue;
      }
      // Simple field reference
      const resolved = resolveField(state, expr);
      state.outputTypes.set(expr, resolved.type);
      parts.push(`${resolved.sql} AS ${quoteAlias(expr)}`);
    } else if (typeof expr === "object") {
      // Named expression: { alias: expression }
      for (const [alias, value] of Object.entries(expr as Record<string, unknown>)) {
        const compiled = compileExpression(state, value);
        state.outputTypes.set(alias, compiled.type as FieldType);
        parts.push(`${compiled.value} AS ${quoteAlias(alias)}`);
      }
    }
  }

  return parts.join(", ");
}

// ---------------------------------------------------------------------------
// JOIN Compilation
// ---------------------------------------------------------------------------

function compileJoins(state: CompilerState): string {
  const joins: string[] = [];

  for (const [key, pathInfo] of state.paths) {
    if (key.endsWith("__mapping")) {
      // Mapping table join: LEFT JOIN payee_mapping ON payee_mapping.id = transactions.description
      joins.push(
        `LEFT JOIN ${pathInfo.tableName} ${pathInfo.tableId} ON ${pathInfo.tableId}.id = ${pathInfo.joinTable}.${pathInfo.joinField}`,
      );
    } else {
      // Regular ref join with optional tombstone
      const tableDef = state.schema[pathInfo.tableName];
      const tombstone = addTombstone(tableDef, pathInfo.tableId);
      const joinField = pathInfo.joinField;
      // If joinField contains COALESCE, it was set up by mapping resolution
      const onClause = joinField.includes("COALESCE")
        ? `${pathInfo.tableId}.id = ${joinField}`
        : `${pathInfo.tableId}.id = ${pathInfo.joinTable}.${joinField}`;
      const tombstoneClause = tombstone ? ` AND ${tombstone}` : "";
      joins.push(`LEFT JOIN ${pathInfo.tableName} ${pathInfo.tableId} ON ${onClause}${tombstoneClause}`);
    }
  }

  return joins.join("\n");
}

// ---------------------------------------------------------------------------
// ORDER BY Compilation
// ---------------------------------------------------------------------------

function compileOrderBy(state: CompilerState, queryState: QueryState): string {
  let orderExprs = queryState.orderExpressions;

  // Apply default order if none specified
  if (orderExprs.length === 0) {
    const tableDef = state.schema[state.table];
    if (tableDef?.defaultOrder) {
      orderExprs = tableDef.defaultOrder;
    }
  }

  if (orderExprs.length === 0) return "";

  const parts: string[] = [];

  for (const expr of orderExprs) {
    if (typeof expr === "string") {
      const resolved = resolveField(state, expr);
      parts.push(`${resolved.sql} ASC`);
    } else if (typeof expr === "object") {
      for (const [field, dir] of Object.entries(expr)) {
        const resolved = resolveField(state, field);
        parts.push(`${resolved.sql} ${(dir as string).toUpperCase()}`);
      }
    }
  }

  return parts.length > 0 ? `ORDER BY ${parts.join(", ")}` : "";
}

// ---------------------------------------------------------------------------
// GROUP BY Compilation
// ---------------------------------------------------------------------------

function compileGroupBy(state: CompilerState, queryState: QueryState): string {
  if (queryState.groupExpressions.length === 0) return "";

  const parts: string[] = [];

  for (const expr of queryState.groupExpressions) {
    if (typeof expr === "string") {
      const resolved = resolveField(state, expr);
      parts.push(resolved.sql);
    } else if (typeof expr === "object") {
      const compiled = compileExpression(state, expr);
      parts.push(compiled.value);
    }
  }

  return parts.length > 0 ? `GROUP BY ${parts.join(", ")}` : "";
}

// ---------------------------------------------------------------------------
// Main Compiler
// ---------------------------------------------------------------------------

export function compile(queryState: QueryState): CompiledQuery {
  const tableDef = schema[queryState.table];
  if (!tableDef) {
    throw new Error(`Unknown table: "${queryState.table}"`);
  }

  const sqlTable = tableDef.sqlTable ?? queryState.table;

  const state: CompilerState = {
    schema,
    table: queryState.table,
    tableId: sqlTable,
    paths: new Map(),
    params: [],
    dependencies: new Set([queryState.table]),
    outputTypes: new Map(),
    uidCounters: new Map(),
  };

  // Compile SELECT
  const selectSql = compileSelect(state, queryState);

  // Compile WHERE
  const whereClauses: string[] = [];
  for (const filterExpr of queryState.filterExpressions) {
    whereClauses.push(compileFilterExpr(state, filterExpr));
  }

  // Auto-add tombstone filter
  if (!queryState.withDead) {
    const tombstone = addTombstone(tableDef, state.tableId);
    if (tombstone) whereClauses.push(tombstone);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  // Compile JOINs (after filters/selects so paths are populated)
  const joinsSql = compileJoins(state);

  // Compile GROUP BY
  const groupBySql = compileGroupBy(state, queryState);

  // Compile ORDER BY
  const orderBySql = compileOrderBy(state, queryState);

  // Compile LIMIT / OFFSET
  const limitSql = queryState.limit != null ? `LIMIT ${queryState.limit}` : "";
  const offsetSql = queryState.offset != null ? `OFFSET ${queryState.offset}` : "";

  // Assemble SQL
  const parts = [
    `SELECT ${selectSql}`,
    `FROM ${sqlTable} ${state.tableId}`,
    joinsSql,
    whereSql,
    groupBySql,
    orderBySql,
    limitSql,
    offsetSql,
  ].filter(Boolean);

  return {
    sql: parts.join("\n"),
    params: state.params,
    dependencies: [...state.dependencies],
    outputTypes: state.outputTypes,
  };
}

/** Convert a raw DB row's output types (boolean 0/1 → true/false, date int → string, etc.) */
export function convertOutputRow(row: Record<string, unknown>, outputTypes: Map<string, FieldType>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const type = outputTypes.get(key);
    if (value === null || value === undefined) {
      result[key] = null;
      continue;
    }
    switch (type) {
      case "boolean":
        result[key] = value === 1 || value === true;
        break;
      case "date":
        if (typeof value === "number") {
          const s = String(value);
          result[key] = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
        } else {
          result[key] = value;
        }
        break;
      case "json":
        if (typeof value === "string") {
          try {
            result[key] = JSON.parse(value);
          } catch {
            result[key] = null;
          }
        } else {
          result[key] = value;
        }
        break;
      default:
        result[key] = value;
    }
  }
  return result;
}
