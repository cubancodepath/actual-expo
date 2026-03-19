/**
 * Database schema definition for AQL.
 *
 * Defines tables, field types, foreign key references, and default ordering.
 * Used by the compiler to resolve field paths, generate JOINs, and convert types.
 */

export type FieldType = "id" | "string" | "integer" | "float" | "boolean" | "date" | "json";

export type FieldDef = {
  type: FieldType;
  ref?: string;
};

export type TableDef = {
  fields: Record<string, FieldDef>;
  defaultOrder: Array<Record<string, "asc" | "desc"> | string>;
  /** The actual SQL table or view to query */
  sqlTable?: string;
};

export type Schema = Record<string, TableDef>;

export const schema: Schema = {
  transactions: {
    fields: {
      id: { type: "id" },
      acct: { type: "id", ref: "accounts" },
      category: { type: "id", ref: "categories" },
      description: { type: "id", ref: "payees" },
      amount: { type: "integer" },
      date: { type: "date" },
      notes: { type: "string" },
      cleared: { type: "boolean" },
      reconciled: { type: "boolean" },
      isParent: { type: "boolean" },
      isChild: { type: "boolean" },
      parent_id: { type: "id" },
      sort_order: { type: "float" },
      transferred_id: { type: "id" },
      schedule: { type: "id" },
      starting_balance_flag: { type: "boolean" },
      tombstone: { type: "boolean" },
    },
    defaultOrder: [
      { date: "desc" },
      { starting_balance_flag: "desc" },
      { sort_order: "desc" },
      "id",
    ],
  },

  accounts: {
    fields: {
      id: { type: "id" },
      name: { type: "string" },
      offbudget: { type: "boolean" },
      closed: { type: "boolean" },
      sort_order: { type: "float" },
      tombstone: { type: "boolean" },
    },
    defaultOrder: [{ sort_order: "asc" }, "name"],
  },

  categories: {
    fields: {
      id: { type: "id" },
      name: { type: "string" },
      cat_group: { type: "id", ref: "category_groups" },
      hidden: { type: "boolean" },
      sort_order: { type: "float" },
      goal_def: { type: "json" },
      tombstone: { type: "boolean" },
    },
    defaultOrder: [{ sort_order: "asc" }, "id"],
  },

  category_groups: {
    fields: {
      id: { type: "id" },
      name: { type: "string" },
      is_income: { type: "boolean" },
      hidden: { type: "boolean" },
      sort_order: { type: "float" },
      tombstone: { type: "boolean" },
    },
    defaultOrder: [{ is_income: "asc" }, { sort_order: "asc" }, "id"],
  },

  payees: {
    fields: {
      id: { type: "id" },
      name: { type: "string" },
      transfer_acct: { type: "id", ref: "accounts" },
      tombstone: { type: "boolean" },
    },
    defaultOrder: [{ transfer_acct: "desc" }, "name"],
  },

  tags: {
    fields: {
      id: { type: "id" },
      tag: { type: "string" },
      color: { type: "string" },
      tombstone: { type: "boolean" },
    },
    defaultOrder: ["tag"],
  },

  schedules: {
    fields: {
      id: { type: "id" },
      name: { type: "string" },
      rule: { type: "id" },
      completed: { type: "boolean" },
      posts_transaction: { type: "boolean" },
      tombstone: { type: "boolean" },
    },
    defaultOrder: [{ completed: "asc" }],
  },

  rules: {
    fields: {
      id: { type: "id" },
      stage: { type: "string" },
      conditions: { type: "json" },
      actions: { type: "json" },
      tombstone: { type: "boolean" },
    },
    defaultOrder: ["id"],
  },
};

/** Mapping tables that resolve IDs to target IDs (payee_mapping, category_mapping). */
export const mappingTables: Record<string, string> = {
  description: "payee_mapping",
  category: "category_mapping",
};

/** Get the resolved column for a mapped field (COALESCE(mapping.targetId, original)). */
export function getMappingJoin(field: string): { mappingTable: string; column: string } | null {
  const mt = mappingTables[field];
  if (!mt) return null;
  return { mappingTable: mt, column: "targetId" };
}
