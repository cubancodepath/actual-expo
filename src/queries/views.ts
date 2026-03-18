/**
 * View definitions for AQL tables.
 *
 * Ported from Actual Budget's schemaConfig.views. Instead of creating real
 * SQL views, the compiler inlines these definitions when generating queries.
 *
 * Each view definition specifies:
 * - fieldOverrides: how schema fields map to actual SQL expressions (mapping resolution)
 * - joins: extra JOINs always applied when querying this table
 * - baseWhere: WHERE conditions always applied
 * - virtualFields: computed fields available via SELECT (e.g., payeeName, categoryName)
 * - aliveFilter: tombstone + split filtering (applied unless withDead)
 * - splitFilters: per-split-type WHERE additions
 */

import type { FieldType } from "./schema";

export type VirtualFieldDef = {
  sql: string;
  type: FieldType;
  joins: string[];
  /** Tables added to dependencies when this field is used */
  dependencies?: string[];
};

export type ViewDef = {
  /** Table alias used in SQL (e.g., "t" for transactions) */
  alias: string;
  /** Schema field → SQL expression overrides (mapping table resolution) */
  fieldOverrides?: Record<string, string>;
  /** Extra JOINs always added when querying this table */
  joins?: string[];
  /** Extra WHERE conditions always applied */
  baseWhere?: string;
  /** Computed fields available in SELECT (require extra JOINs) */
  virtualFields?: Record<string, VirtualFieldDef>;
  /** Default alive filter (tombstone + split). Applied unless withDead. */
  aliveFilter?: string;
  /** Split-type specific filters. Key = splits option value. */
  splitFilters?: Record<string, string>;
};

export const views: Record<string, ViewDef> = {
  transactions: {
    alias: "t",
    fieldOverrides: {
      payee: "COALESCE(pm.targetId, t.description)",
      category: "CASE WHEN t.isParent = 1 THEN NULL ELSE COALESCE(cm.transferId, t.category) END",
      amount: "IFNULL(t.amount, 0)",
      parent_id: "CASE WHEN t.isChild = 0 THEN NULL ELSE t.parent_id END",
    },
    joins: [
      "LEFT JOIN category_mapping cm ON cm.id = t.category",
      "LEFT JOIN payee_mapping pm ON pm.id = t.description",
    ],
    baseWhere:
      "t.date IS NOT NULL AND t.acct IS NOT NULL AND (t.isChild = 0 OR t.parent_id IS NOT NULL)",
    virtualFields: {
      payeeName: {
        sql: "COALESCE(tr_acc.name, p.name)",
        type: "string",
        joins: [
          "LEFT JOIN payees p ON COALESCE(pm.targetId, t.description) = p.id AND p.tombstone = 0",
          "LEFT JOIN accounts tr_acc ON p.transfer_acct = tr_acc.id AND tr_acc.tombstone = 0",
        ],
        dependencies: ["payees", "accounts"],
      },
      categoryName: {
        sql: "c.name",
        type: "string",
        joins: [
          "LEFT JOIN categories c ON COALESCE(cm.transferId, t.category) = c.id AND c.tombstone = 0",
        ],
        dependencies: ["categories"],
      },
      accountName: {
        sql: "acc.name",
        type: "string",
        joins: [
          "JOIN accounts acc ON acc.id = t.acct AND acc.tombstone = 0",
        ],
        dependencies: ["accounts"],
      },
    },
    aliveFilter: "t.tombstone = 0 AND t.isParent = 0",
    splitFilters: {
      inline: "t.isParent = 0", // default — only non-parent rows
      none: "t.parent_id IS NULL", // top-level only
      all: "", // everything
    },
  },

  payees: {
    alias: "p",
    fieldOverrides: {
      name: "COALESCE(tr_acc.name, p.name)",
    },
    joins: [
      "LEFT JOIN accounts tr_acc ON p.transfer_acct = tr_acc.id AND tr_acc.tombstone = 0",
    ],
    baseWhere: "(p.transfer_acct IS NULL OR tr_acc.id IS NOT NULL)",
  },

  categories: {
    alias: "c",
    fieldOverrides: {
      group: "c.cat_group",
    },
  },
};
