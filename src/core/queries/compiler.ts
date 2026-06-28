/**
 * AQL Compiler — compiles QueryState into SQL + params for expo-sqlite.
 *
 * Supports view definitions (mapping tables, virtual fields), split handling,
 * and automatic JOIN generation. Ported from Actual Budget's loot-core compiler.
 */

import type { QueryState, ObjectExpression } from "./query";
import { schema, type FieldDef, type FieldType, type Schema } from "./schema";
import { views, type ViewDef, type VirtualFieldDef } from "./views";

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

type CompilerState = {
  schema: Schema;
  table: string;
  /** Table alias (e.g., "t" for transactions, or table name if no view) */
  alias: string;
  view: ViewDef | undefined;
  params: unknown[];
  dependencies: Set<string>;
  outputTypes: Map<string, FieldType>;
  /** Track which virtual field JOINs have been added (avoid duplicates) */
  addedVirtualJoins: Set<string>;
  /** Extra JOINs accumulated from virtual fields */
  extraJoins: string[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function quoteAlias(name: string): string {
  return `"${name}"`;
}

function convertInputValue(value: unknown, type: FieldType): unknown {
  if (value === null || value === undefined) return null;
  switch (type) {
    case "boolean":
      return value ? 1 : 0;
    case "date": {
      if (typeof value === "string") {
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
  // Check virtual fields first (payeeName, categoryName, accountName)
  const vf = state.view?.virtualFields?.[field];
  if (vf) {
    addVirtualFieldJoins(state, field, vf);
    return { sql: vf.sql, type: vf.type, table: state.table };
  }

  // Check field overrides from view (mapping resolution)
  const override = state.view?.fieldOverrides?.[field];
  if (override) {
    const fieldDef = state.schema[state.table]?.fields[field];
    return { sql: override, type: fieldDef?.type ?? "string", table: state.table };
  }

  // Simple field on the main table
  const fieldDef = state.schema[state.table]?.fields[field];
  if (fieldDef) {
    return { sql: `${state.alias}.${field}`, type: fieldDef.type, table: state.table };
  }

  throw new Error(`Unknown field "${field}" on table "${state.table}"`);
}

function addVirtualFieldJoins(state: CompilerState, name: string, vf: VirtualFieldDef): void {
  if (state.addedVirtualJoins.has(name)) return;
  state.addedVirtualJoins.add(name);
  for (const join of vf.joins) {
    state.extraJoins.push(join);
  }
  if (vf.dependencies) {
    for (const dep of vf.dependencies) {
      state.dependencies.add(dep);
    }
  }
}

// ---------------------------------------------------------------------------
// Expression Compilation
// ---------------------------------------------------------------------------

function compileValue(state: CompilerState, value: unknown, contextType: FieldType): TypedExpr {
  if (value === null || value === undefined) {
    return { value: "NULL", type: "null", literal: true };
  }
  if (Array.isArray(value)) {
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
  const fieldName = ref.startsWith("$") ? ref.slice(1) : ref;
  const resolved = resolveField(state, fieldName);
  return { value: resolved.sql, type: resolved.type, literal: true };
}

function compileExpression(state: CompilerState, expr: unknown): TypedExpr {
  if (expr === null || expr === undefined) {
    return { value: "NULL", type: "null", literal: true };
  }
  if (typeof expr === "string") {
    if (expr.startsWith("$")) return compileFieldRef(state, expr);
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

  if (condition === null || condition === undefined) {
    return `${left} IS NULL`;
  }
  if (typeof condition !== "object" || Array.isArray(condition)) {
    const rhs = compileValue(state, condition, fieldType);
    return `${left} = ${rhs.value}`;
  }

  const ops = condition as Record<string, unknown>;
  const clauses: string[] = [];

  for (const [op, value] of Object.entries(ops)) {
    switch (op) {
      case "$eq":
        if (value === null) clauses.push(`${left} IS NULL`);
        else {
          const rhs = compileValue(state, value, fieldType);
          clauses.push(`${left} = ${rhs.value}`);
        }
        break;
      case "$ne":
        if (value === null) clauses.push(`${left} IS NOT NULL`);
        else {
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
        if (!Array.isArray(value) || value.length === 0) clauses.push("0");
        else {
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
      const subClauses = (value as ObjectExpression[]).map((e) => compileFilterExpr(state, e));
      clauses.push(`(${subClauses.join(" AND ")})`);
    } else if (key === "$or") {
      const subClauses = (value as ObjectExpression[]).map((e) => compileFilterExpr(state, e));
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
  const hasStar = exprs.length === 0 || exprs.includes("*");

  if (hasStar) {
    const tableDef = state.schema[state.table];
    if (!tableDef) return `${state.alias}.*`;

    const parts: string[] = [];

    // All schema fields (with view overrides + column renames)
    const renames = state.view?.columnRenames ?? {};
    for (const [f, def] of Object.entries(tableDef.fields)) {
      const outputName = renames[f] ?? f;
      state.outputTypes.set(outputName, def.type);
      const override = state.view?.fieldOverrides?.[f];
      if (override) {
        parts.push(`${override} AS ${quoteAlias(outputName)}`);
      } else {
        parts.push(`${state.alias}.${f} AS ${quoteAlias(outputName)}`);
      }
    }

    // Default virtual fields included automatically in SELECT *
    const defaultVirtualsMap: Record<string, string[]> = {
      transactions: ["payeeName", "categoryName"],
      schedules: ["next_date", "conditions", "actions"],
    };
    const defaultVirtuals = defaultVirtualsMap[state.table] ?? [];
    for (const vName of defaultVirtuals) {
      const vf = state.view?.virtualFields?.[vName];
      if (vf) {
        addVirtualFieldJoins(state, vName, vf);
        state.outputTypes.set(vName, vf.type);
        parts.push(`${vf.sql} AS ${quoteAlias(vName)}`);
      }
    }

    // Also include explicitly requested non-* fields
    for (const expr of exprs) {
      if (expr === "*") continue;
      if (typeof expr === "string") {
        // Check if it's a virtual field
        const vf = state.view?.virtualFields?.[expr];
        if (vf) {
          addVirtualFieldJoins(state, expr, vf);
          state.outputTypes.set(expr, vf.type);
          parts.push(`${vf.sql} AS ${quoteAlias(expr)}`);
        }
      }
    }

    return parts.join(", ");
  }

  // Explicit field list (no *)
  const parts: string[] = [];
  for (const expr of exprs) {
    if (typeof expr === "string") {
      const resolved = resolveField(state, expr);
      state.outputTypes.set(expr, resolved.type);
      parts.push(`${resolved.sql} AS ${quoteAlias(expr)}`);
    } else if (typeof expr === "object") {
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
// ORDER BY Compilation
// ---------------------------------------------------------------------------

function compileOrderBy(state: CompilerState, queryState: QueryState): string {
  let orderExprs = queryState.orderExpressions;

  if (orderExprs.length === 0) {
    const tableDef = state.schema[state.table];
    if (tableDef?.defaultOrder) orderExprs = tableDef.defaultOrder;
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

  const view = views[queryState.table];
  const alias = view?.alias ?? queryState.table;

  const state: CompilerState = {
    schema,
    table: queryState.table,
    alias,
    view,
    params: [],
    dependencies: new Set([queryState.table]),
    outputTypes: new Map(),
    addedVirtualJoins: new Set(),
    extraJoins: [],
  };

  // Compile SELECT
  const selectSql = compileSelect(state, queryState);

  // Compile WHERE
  const whereClauses: string[] = [];

  // View baseWhere (e.g., date IS NOT NULL for transactions)
  if (view?.baseWhere) {
    whereClauses.push(view.baseWhere);
  }

  // User filters
  for (const filterExpr of queryState.filterExpressions) {
    whereClauses.push(compileFilterExpr(state, filterExpr));
  }

  // Alive filter (tombstone + split handling)
  if (!queryState.withDead) {
    if (view?.aliveFilter) {
      // Use view's alive filter which includes tombstone + split
      const splitType = (queryState.tableOptions?.splits as string) ?? "inline";
      const splitFilter = view.splitFilters?.[splitType];

      // Add tombstone filter
      if (tableDef.fields.tombstone) {
        whereClauses.push(`${alias}.tombstone = 0`);
      }

      // Add split-specific filter
      if (splitFilter) {
        whereClauses.push(splitFilter);
      }
    } else {
      // Simple tombstone filter for non-view tables
      if (tableDef.fields.tombstone) {
        whereClauses.push(`${alias}.tombstone = 0`);
      }
    }
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  // Compile JOINs: view joins + virtual field joins
  const allJoins: string[] = [];
  if (view?.joins) {
    allJoins.push(...view.joins);
  }
  allJoins.push(...state.extraJoins);

  const joinsSql = allJoins.join("\n");

  // Compile GROUP BY and ORDER BY
  const groupBySql = compileGroupBy(state, queryState);
  const orderBySql = compileOrderBy(state, queryState);

  // LIMIT / OFFSET
  const limitSql = queryState.limit != null ? `LIMIT ${queryState.limit}` : "";
  const offsetSql = queryState.offset != null ? `OFFSET ${queryState.offset}` : "";

  // Assemble SQL
  const parts = [
    `SELECT ${selectSql}`,
    `FROM ${queryState.table} ${alias}`,
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
export function convertOutputRow(
  row: Record<string, unknown>,
  outputTypes: Map<string, FieldType>,
): Record<string, unknown> {
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
