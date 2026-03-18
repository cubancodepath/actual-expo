/**
 * AQL Query Builder — ported from Actual Budget loot-core.
 *
 * Immutable fluent API for building database queries.
 * Each method returns a new Query instance with updated state.
 *
 * @example
 * q("transactions")
 *   .filter({ date: { $gte: "2024-01-01" }, amount: { $lt: 0 } })
 *   .select(["id", "amount", "date"])
 *   .orderBy({ date: "desc" })
 *   .limit(25)
 *   .serialize()
 */

export type ObjectExpression = {
  [key: string]: ObjectExpression | unknown;
};

export type QueryState = {
  table: string;
  tableOptions: Readonly<Record<string, unknown>>;
  filterExpressions: ReadonlyArray<ObjectExpression>;
  selectExpressions: ReadonlyArray<ObjectExpression | string | "*">;
  groupExpressions: ReadonlyArray<ObjectExpression | string>;
  orderExpressions: ReadonlyArray<ObjectExpression | string>;
  calculation: boolean;
  rawMode: boolean;
  withDead: boolean;
  validateRefs: boolean;
  limit: number | null;
  offset: number | null;
};

export class Query {
  state: QueryState;

  constructor(state: Partial<QueryState> & { table: string }) {
    this.state = {
      tableOptions: state.tableOptions || {},
      filterExpressions: state.filterExpressions || [],
      selectExpressions: state.selectExpressions || [],
      groupExpressions: state.groupExpressions || [],
      orderExpressions: state.orderExpressions || [],
      calculation: false,
      rawMode: false,
      withDead: false,
      validateRefs: true,
      limit: null,
      offset: null,
      ...state,
    };
  }

  filter(expr: ObjectExpression): Query {
    return new Query({
      ...this.state,
      filterExpressions: [...this.state.filterExpressions, expr],
    });
  }

  unfilter(exprs?: string[]): Query {
    if (!exprs) {
      return new Query({ ...this.state, filterExpressions: [] });
    }
    const exprSet = new Set(exprs);
    return new Query({
      ...this.state,
      filterExpressions: this.state.filterExpressions.filter(
        (expr) => !exprSet.has(Object.keys(expr)[0]),
      ),
    });
  }

  select(
    exprs: Array<ObjectExpression | string> | ObjectExpression | string | "*" | ["*"] = [],
  ): Query {
    if (!Array.isArray(exprs)) {
      exprs = [exprs];
    }
    return new Query({
      ...this.state,
      selectExpressions: exprs,
      calculation: false,
    });
  }

  calculate(expr: ObjectExpression | string): Query {
    return new Query({
      ...this.state,
      selectExpressions: [{ result: expr }],
      calculation: true,
    });
  }

  groupBy(exprs: ObjectExpression | string | Array<ObjectExpression | string>): Query {
    if (!Array.isArray(exprs)) {
      exprs = [exprs];
    }
    return new Query({
      ...this.state,
      groupExpressions: [...this.state.groupExpressions, ...exprs],
    });
  }

  orderBy(exprs: ObjectExpression | string | Array<ObjectExpression | string>): Query {
    if (!Array.isArray(exprs)) {
      exprs = [exprs];
    }
    return new Query({
      ...this.state,
      orderExpressions: [...this.state.orderExpressions, ...exprs],
    });
  }

  limit(num: number): Query {
    return new Query({ ...this.state, limit: num });
  }

  offset(num: number): Query {
    return new Query({ ...this.state, offset: num });
  }

  raw(): Query {
    return new Query({ ...this.state, rawMode: true });
  }

  withDead(): Query {
    return new Query({ ...this.state, withDead: true });
  }

  withoutValidatedRefs(): Query {
    return new Query({ ...this.state, validateRefs: false });
  }

  options(opts: Record<string, unknown>): Query {
    return new Query({ ...this.state, tableOptions: opts });
  }

  reset(): Query {
    return q(this.state.table);
  }

  serialize(): QueryState {
    return this.state;
  }

  serializeAsString(): string {
    return JSON.stringify(this.serialize());
  }
}

export function getPrimaryOrderBy(
  query: Query,
  defaultOrderBy: ObjectExpression | null,
): { field: string; order: string } | null {
  const orderExprs = query.serialize().orderExpressions;
  if (orderExprs.length === 0) {
    if (defaultOrderBy) {
      const [field] = Object.keys(defaultOrderBy);
      return { field, order: (defaultOrderBy[field] as string) ?? "asc" };
    }
    return null;
  }
  const firstOrder = orderExprs[0];
  if (typeof firstOrder === "string") {
    return { field: firstOrder, order: "asc" };
  }
  const [field] = Object.keys(firstOrder);
  return { field, order: firstOrder[field] as string };
}

export function q(table: string): Query {
  return new Query({ table });
}
