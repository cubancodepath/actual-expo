import { describe, it, expect } from "vitest";
import { compile, convertOutputRow } from "../compiler";
import { q } from "../query";
import type { FieldType } from "../schema";

/** Helper: compile a query and return sql + params */
function c(query: ReturnType<typeof q>) {
  return compile(query.serialize());
}

// ---------------------------------------------------------------------------
// Basic SELECT
// ---------------------------------------------------------------------------

describe("compile — basic SELECT", () => {
  it("compiles SELECT * for categories with tombstone filter", () => {
    const result = c(q("categories"));
    expect(result.sql).toContain("SELECT");
    expect(result.sql).toContain("FROM categories");
    expect(result.sql).toContain("c.tombstone = 0");
    expect(result.params).toEqual([]);
  });

  it("compiles specific fields for categories", () => {
    const result = c(q("categories").select(["id", "name"]));
    expect(result.sql).toContain('"id"');
    expect(result.sql).toContain('"name"');
  });

  it("omits tombstone filter with withDead()", () => {
    const result = c(q("categories").withDead());
    expect(result.sql).not.toContain("tombstone = 0");
  });
});

// ---------------------------------------------------------------------------
// Filter operators
// ---------------------------------------------------------------------------

describe("compile — filter operators", () => {
  it("$eq with boolean value", () => {
    const result = c(q("categories").filter({ hidden: false }));
    expect(result.sql).toContain("c.hidden = ?");
    expect(result.params).toContain(0);
  });

  it("$eq with null → IS NULL", () => {
    const result = c(q("transactions").filter({ notes: null }));
    expect(result.sql).toContain("t.notes IS NULL");
  });

  it("$ne", () => {
    const result = c(q("categories").filter({ name: { $ne: "Food" } }));
    expect(result.sql).toContain("c.name != ?");
    expect(result.params).toContain("Food");
  });

  it("$gt and $lt", () => {
    const result = c(q("transactions").filter({ amount: { $gt: 0, $lt: 10000 } }));
    expect(result.sql).toContain("IFNULL(t.amount, 0) > ?");
    expect(result.sql).toContain("IFNULL(t.amount, 0) < ?");
    expect(result.params).toEqual([0, 10000]);
  });

  it("$gte", () => {
    const result = c(q("transactions").filter({ amount: { $gte: 100 } }));
    expect(result.sql).toContain(">= ?");
  });

  it("$like", () => {
    const result = c(q("payees").filter({ name: { $like: "%amazon%" } }));
    expect(result.sql).toContain("LIKE ?");
    expect(result.params).toContain("%amazon%");
  });

  it("$oneof", () => {
    const result = c(q("transactions").filter({ acct: { $oneof: ["a1", "a2", "a3"] } }));
    expect(result.sql).toContain("t.acct IN (?, ?, ?)");
    expect(result.params).toEqual(["a1", "a2", "a3"]);
  });

  it("$oneof with empty array → always false", () => {
    const result = c(q("transactions").filter({ acct: { $oneof: [] } }));
    expect(result.sql).toContain("0");
  });
});

// ---------------------------------------------------------------------------
// Logical operators
// ---------------------------------------------------------------------------

describe("compile — logical operators", () => {
  it("$and", () => {
    const result = c(
      q("transactions").filter({ $and: [{ amount: { $gt: 0 } }, { cleared: true }] }),
    );
    expect(result.sql).toContain("IFNULL(t.amount, 0) > ?");
    expect(result.sql).toContain("t.cleared = ?");
    expect(result.sql).toMatch(/\(.*AND.*\)/);
  });

  it("$or", () => {
    const result = c(
      q("transactions").filter({ $or: [{ amount: { $gt: 1000 } }, { amount: { $lt: -1000 } }] }),
    );
    expect(result.sql).toMatch(/\(.*OR.*\)/);
  });
});

// ---------------------------------------------------------------------------
// ORDER BY
// ---------------------------------------------------------------------------

describe("compile — ORDER BY", () => {
  it("uses default order when none specified", () => {
    const result = c(q("categories"));
    expect(result.sql).toContain("ORDER BY");
    expect(result.sql).toContain("sort_order");
  });

  it("uses custom order", () => {
    const result = c(q("transactions").orderBy({ date: "desc" }));
    expect(result.sql).toContain("ORDER BY");
    expect(result.sql).toContain("DESC");
  });
});

// ---------------------------------------------------------------------------
// LIMIT and OFFSET
// ---------------------------------------------------------------------------

describe("compile — LIMIT and OFFSET", () => {
  it("includes LIMIT", () => {
    const result = c(q("transactions").limit(25));
    expect(result.sql).toContain("LIMIT 25");
  });

  it("includes OFFSET", () => {
    const result = c(q("transactions").limit(25).offset(50));
    expect(result.sql).toContain("LIMIT 25");
    expect(result.sql).toContain("OFFSET 50");
  });

  it("omits LIMIT/OFFSET when not set", () => {
    const result = c(q("transactions"));
    expect(result.sql).not.toContain("LIMIT");
    expect(result.sql).not.toContain("OFFSET");
  });
});

// ---------------------------------------------------------------------------
// Views & Mapping Tables
// ---------------------------------------------------------------------------

describe("compile — views & mapping tables", () => {
  it("transactions SELECT * includes mapping JOINs", () => {
    const result = c(q("transactions"));
    expect(result.sql).toContain("LEFT JOIN category_mapping cm ON cm.id = t.category");
    expect(result.sql).toContain("LEFT JOIN payee_mapping pm ON pm.id = t.description");
  });

  it("transactions SELECT * includes payeeName and categoryName", () => {
    const result = c(q("transactions"));
    expect(result.sql).toContain('"payeeName"');
    expect(result.sql).toContain('"categoryName"');
  });

  it("transactions SELECT * includes payee/category JOINs", () => {
    const result = c(q("transactions"));
    expect(result.sql).toContain("LEFT JOIN payees p ON");
    expect(result.sql).toContain("LEFT JOIN categories c ON");
  });

  it("transactions SELECT with accountName adds account JOIN", () => {
    const result = c(q("transactions").select(["*", "accountName"]));
    expect(result.sql).toContain("JOIN accounts acc ON");
    expect(result.sql).toContain('"accountName"');
  });

  it("field overrides: amount uses IFNULL", () => {
    const result = c(q("transactions").select(["amount"]));
    expect(result.sql).toContain("IFNULL(t.amount, 0)");
  });

  it("field overrides: payee uses COALESCE with mapping", () => {
    const result = c(q("transactions").select(["payee"]));
    expect(result.sql).toContain("COALESCE(pm.targetId, t.description)");
  });

  it("baseWhere applied for transactions", () => {
    const result = c(q("transactions"));
    expect(result.sql).toContain("t.date IS NOT NULL");
    expect(result.sql).toContain("t.acct IS NOT NULL");
  });

  it("payees view includes transfer account JOIN", () => {
    const result = c(q("payees"));
    expect(result.sql).toContain("LEFT JOIN accounts tr_acc");
  });
});

// ---------------------------------------------------------------------------
// Virtual Fields
// ---------------------------------------------------------------------------

describe("compile — virtual fields", () => {
  it("selecting payeeName only adds payee JOINs, not category", () => {
    const result = c(q("transactions").select(["id", "payeeName"]));
    expect(result.sql).toContain("LEFT JOIN payees p ON");
    expect(result.sql).not.toContain("LEFT JOIN categories c ON");
  });

  it("selecting categoryName only adds category JOINs, not payee", () => {
    const result = c(q("transactions").select(["id", "categoryName"]));
    expect(result.sql).toContain("LEFT JOIN categories c ON");
    expect(result.sql).not.toContain("LEFT JOIN payees p ON");
  });

  it("accountName is NOT included in default * select", () => {
    const result = c(q("transactions"));
    expect(result.sql).not.toContain('"accountName"');
    expect(result.sql).not.toContain("JOIN accounts acc ON");
  });
});

// ---------------------------------------------------------------------------
// Split Handling
// ---------------------------------------------------------------------------

describe("compile — split handling", () => {
  it("default (inline) adds isParent = 0 filter", () => {
    const result = c(q("transactions"));
    expect(result.sql).toContain("t.isParent = 0");
  });

  it("splits: 'none' adds parent_id IS NULL filter", () => {
    const result = c(q("transactions").options({ splits: "none" }));
    expect(result.sql).toContain("t.parent_id IS NULL");
    expect(result.sql).not.toContain("t.isParent = 0");
  });

  it("splits: 'all' has no split filter", () => {
    const result = c(q("transactions").options({ splits: "all" }));
    expect(result.sql).not.toContain("t.isParent = 0");
    expect(result.sql).not.toContain("t.parent_id IS NULL");
  });

  it("withDead() removes main table alive filter", () => {
    const result = c(q("transactions").withDead());
    // Main table tombstone + split filter removed
    expect(result.sql).not.toContain("t.tombstone = 0");
    expect(result.sql).not.toContain("t.isParent = 0");
    // But joined tables still filter their own tombstones (correct behavior)
    expect(result.sql).toContain("p.tombstone = 0");
  });
});

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

describe("compile — dependencies", () => {
  it("includes main table", () => {
    const result = c(q("categories"));
    expect(result.dependencies).toContain("categories");
  });

  it("transactions * includes payees and categories in dependencies", () => {
    const result = c(q("transactions"));
    expect(result.dependencies).toContain("transactions");
    expect(result.dependencies).toContain("payees");
    expect(result.dependencies).toContain("categories");
  });

  it("accountName adds accounts to dependencies", () => {
    const result = c(q("transactions").select(["*", "accountName"]));
    expect(result.dependencies).toContain("accounts");
  });
});

// ---------------------------------------------------------------------------
// Aggregate functions
// ---------------------------------------------------------------------------

describe("compile — aggregate functions", () => {
  it("$sum", () => {
    const result = c(q("transactions").select([{ total: { $sum: "$amount" } }]));
    expect(result.sql).toContain("SUM(");
  });

  it("$count", () => {
    const result = c(q("transactions").select([{ count: { $count: "$id" } }]));
    expect(result.sql).toContain("COUNT(");
  });
});

// ---------------------------------------------------------------------------
// Output type conversion
// ---------------------------------------------------------------------------

describe("convertOutputRow", () => {
  it("converts boolean 0/1 to true/false", () => {
    const types = new Map<string, FieldType>([["hidden", "boolean"]]);
    expect(convertOutputRow({ hidden: 1 }, types)).toEqual({ hidden: true });
    expect(convertOutputRow({ hidden: 0 }, types)).toEqual({ hidden: false });
  });

  it("converts date integer to string", () => {
    const types = new Map<string, FieldType>([["date", "date"]]);
    expect(convertOutputRow({ date: 20240319 }, types)).toEqual({ date: "2024-03-19" });
  });

  it("passes through null values", () => {
    const types = new Map<string, FieldType>([["name", "string"]]);
    expect(convertOutputRow({ name: null }, types)).toEqual({ name: null });
  });

  it("parses JSON fields", () => {
    const types = new Map<string, FieldType>([["goal_def", "json"]]);
    expect(convertOutputRow({ goal_def: '{"type":"simple"}' }, types)).toEqual({
      goal_def: { type: "simple" },
    });
  });

  it("handles invalid JSON gracefully", () => {
    const types = new Map<string, FieldType>([["goal_def", "json"]]);
    expect(convertOutputRow({ goal_def: "not json" }, types)).toEqual({ goal_def: null });
  });
});
