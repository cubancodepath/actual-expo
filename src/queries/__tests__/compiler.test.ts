import { describe, it, expect } from "vitest";
import { compile, convertOutputRow } from "../compiler";
import { q } from "../query";
import type { FieldType } from "../schema";

/** Helper: compile a query and return sql + params */
function c(query: ReturnType<typeof q>) {
  return compile(query.serialize());
}

describe("compile — basic SELECT", () => {
  it("compiles SELECT * with tombstone filter", () => {
    const result = c(q("categories"));
    expect(result.sql).toContain("SELECT");
    expect(result.sql).toContain("FROM categories");
    expect(result.sql).toContain("categories.tombstone = 0");
    expect(result.params).toEqual([]);
  });

  it("compiles specific fields", () => {
    const result = c(q("categories").select(["id", "name"]));
    expect(result.sql).toContain('"id"');
    expect(result.sql).toContain('"name"');
  });

  it("omits tombstone filter with withDead()", () => {
    const result = c(q("categories").withDead());
    expect(result.sql).not.toContain("tombstone = 0");
  });
});

describe("compile — filter operators", () => {
  it("$eq with value", () => {
    const result = c(q("categories").filter({ hidden: false }));
    expect(result.sql).toContain("categories.hidden = ?");
    expect(result.params).toContain(0); // boolean → 0
  });

  it("$eq with null → IS NULL", () => {
    const result = c(q("transactions").filter({ category: null }));
    expect(result.sql).toContain("transactions.category IS NULL");
  });

  it("$ne", () => {
    const result = c(q("categories").filter({ name: { $ne: "Food" } }));
    expect(result.sql).toContain("categories.name != ?");
    expect(result.params).toContain("Food");
  });

  it("$gt and $lt", () => {
    const result = c(q("transactions").filter({ amount: { $gt: 0, $lt: 10000 } }));
    expect(result.sql).toContain("transactions.amount > ?");
    expect(result.sql).toContain("transactions.amount < ?");
    expect(result.params).toEqual([0, 10000]);
  });

  it("$gte and $lte", () => {
    const result = c(q("transactions").filter({ amount: { $gte: 100 } }));
    expect(result.sql).toContain("transactions.amount >= ?");
  });

  it("$like", () => {
    const result = c(q("payees").filter({ name: { $like: "%amazon%" } }));
    expect(result.sql).toContain("payees.name LIKE ?");
    expect(result.params).toContain("%amazon%");
  });

  it("$oneof", () => {
    const result = c(q("transactions").filter({ acct: { $oneof: ["a1", "a2", "a3"] } }));
    expect(result.sql).toContain("transactions.acct IN (?, ?, ?)");
    expect(result.params).toEqual(["a1", "a2", "a3"]);
  });

  it("$oneof with empty array → always false", () => {
    const result = c(q("transactions").filter({ acct: { $oneof: [] } }));
    expect(result.sql).toContain("0");
  });
});

describe("compile — logical operators", () => {
  it("$and", () => {
    const result = c(
      q("transactions").filter({
        $and: [{ amount: { $gt: 0 } }, { cleared: true }],
      }),
    );
    expect(result.sql).toContain("transactions.amount > ?");
    expect(result.sql).toContain("transactions.cleared = ?");
    expect(result.sql).toMatch(/\(.*AND.*\)/);
  });

  it("$or", () => {
    const result = c(
      q("transactions").filter({
        $or: [{ amount: { $gt: 1000 } }, { amount: { $lt: -1000 } }],
      }),
    );
    expect(result.sql).toMatch(/\(.*OR.*\)/);
  });
});

describe("compile — ORDER BY", () => {
  it("uses default order when none specified", () => {
    const result = c(q("categories"));
    // categories defaultOrder: sort_order asc, id
    expect(result.sql).toContain("ORDER BY");
    expect(result.sql).toContain("sort_order");
  });

  it("uses custom order", () => {
    const result = c(q("transactions").orderBy({ date: "desc" }));
    expect(result.sql).toContain("ORDER BY");
    expect(result.sql).toContain("date DESC");
  });

  it("accumulates multiple order fields", () => {
    const result = c(q("transactions").orderBy({ date: "desc" }).orderBy("id"));
    expect(result.sql).toContain("date DESC");
    expect(result.sql).toContain("id ASC");
  });
});

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

describe("compile — JOINs via field paths", () => {
  it("generates LEFT JOIN for dotted field path in filter", () => {
    const result = c(q("transactions").filter({ "acct.name": "Checking" }));
    expect(result.sql).toContain("LEFT JOIN accounts");
    expect(result.sql).toContain(".name = ?");
    expect(result.params).toContain("Checking");
  });

  it("tracks joined table in dependencies", () => {
    const result = c(q("transactions").filter({ "acct.name": "Checking" }));
    expect(result.dependencies).toContain("transactions");
    expect(result.dependencies).toContain("accounts");
  });

  it("adds tombstone filter on joined table", () => {
    const result = c(q("transactions").filter({ "acct.name": "Checking" }));
    expect(result.sql).toMatch(/accounts\d+\.tombstone = 0/);
  });
});

describe("compile — dependencies", () => {
  it("includes main table", () => {
    const result = c(q("categories"));
    expect(result.dependencies).toContain("categories");
  });

  it("includes joined tables", () => {
    const result = c(
      q("transactions")
        .filter({ "acct.name": "Checking" })
        .select(["id", { catName: "$category.name" }]),
    );
    expect(result.dependencies).toContain("transactions");
    expect(result.dependencies).toContain("accounts");
    expect(result.dependencies).toContain("categories");
  });
});

describe("compile — aggregate functions", () => {
  it("$sum", () => {
    const result = c(q("transactions").select([{ total: { $sum: "$amount" } }]));
    expect(result.sql).toContain("SUM(");
    expect(result.sql).toContain("amount");
  });

  it("$count", () => {
    const result = c(q("transactions").select([{ count: { $count: "$id" } }]));
    expect(result.sql).toContain("COUNT(");
  });
});

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
