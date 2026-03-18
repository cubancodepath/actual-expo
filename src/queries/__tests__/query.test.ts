import { describe, it, expect } from "vitest";
import { q, Query } from "../query";

describe("q() factory", () => {
  it("creates a query with the given table", () => {
    const query = q("transactions");
    expect(query.serialize().table).toBe("transactions");
  });

  it("initializes with empty expressions and defaults", () => {
    const state = q("accounts").serialize();
    expect(state.filterExpressions).toEqual([]);
    expect(state.selectExpressions).toEqual([]);
    expect(state.orderExpressions).toEqual([]);
    expect(state.groupExpressions).toEqual([]);
    expect(state.limit).toBeNull();
    expect(state.offset).toBeNull();
    expect(state.withDead).toBe(false);
    expect(state.calculation).toBe(false);
  });
});

describe("Query immutability", () => {
  it("filter() returns a new instance without mutating the original", () => {
    const original = q("categories");
    const filtered = original.filter({ hidden: false });

    expect(original.serialize().filterExpressions).toEqual([]);
    expect(filtered.serialize().filterExpressions).toEqual([{ hidden: false }]);
    expect(original).not.toBe(filtered);
  });

  it("select() returns a new instance", () => {
    const original = q("transactions");
    const selected = original.select(["id", "amount"]);

    expect(original.serialize().selectExpressions).toEqual([]);
    expect(selected.serialize().selectExpressions).toEqual(["id", "amount"]);
  });
});

describe("filter()", () => {
  it("accumulates multiple filters", () => {
    const query = q("transactions")
      .filter({ amount: { $gt: 0 } })
      .filter({ date: { $gte: "2024-01-01" } });

    const filters = query.serialize().filterExpressions;
    expect(filters).toHaveLength(2);
    expect(filters[0]).toEqual({ amount: { $gt: 0 } });
    expect(filters[1]).toEqual({ date: { $gte: "2024-01-01" } });
  });
});

describe("unfilter()", () => {
  it("removes all filters when called without args", () => {
    const query = q("transactions")
      .filter({ amount: { $gt: 0 } })
      .filter({ acct: "abc" })
      .unfilter();

    expect(query.serialize().filterExpressions).toEqual([]);
  });

  it("removes specific filters by key", () => {
    const query = q("transactions")
      .filter({ amount: { $gt: 0 } })
      .filter({ acct: "abc" })
      .unfilter(["acct"]);

    const filters = query.serialize().filterExpressions;
    expect(filters).toHaveLength(1);
    expect(filters[0]).toEqual({ amount: { $gt: 0 } });
  });
});

describe("select()", () => {
  it("accepts a string", () => {
    expect(q("t").select("id").serialize().selectExpressions).toEqual(["id"]);
  });

  it("accepts an array", () => {
    expect(q("t").select(["id", "name"]).serialize().selectExpressions).toEqual(["id", "name"]);
  });

  it("accepts wildcard", () => {
    expect(q("t").select("*").serialize().selectExpressions).toEqual(["*"]);
  });

  it("accepts object expressions", () => {
    const expr = { total: { $sum: "$amount" } };
    expect(q("t").select([expr]).serialize().selectExpressions).toEqual([expr]);
  });
});

describe("orderBy()", () => {
  it("accumulates order expressions", () => {
    const query = q("transactions")
      .orderBy({ date: "desc" })
      .orderBy("id");

    const orders = query.serialize().orderExpressions;
    expect(orders).toEqual([{ date: "desc" }, "id"]);
  });
});

describe("limit() and offset()", () => {
  it("sets limit and offset", () => {
    const state = q("transactions").limit(25).offset(50).serialize();
    expect(state.limit).toBe(25);
    expect(state.offset).toBe(50);
  });
});

describe("withDead()", () => {
  it("sets withDead flag", () => {
    expect(q("t").serialize().withDead).toBe(false);
    expect(q("t").withDead().serialize().withDead).toBe(true);
  });
});

describe("calculate()", () => {
  it("sets calculation mode with wrapped expression", () => {
    const state = q("transactions").calculate({ $sum: "$amount" }).serialize();
    expect(state.calculation).toBe(true);
    expect(state.selectExpressions).toEqual([{ result: { $sum: "$amount" } }]);
  });
});

describe("chaining", () => {
  it("produces correct state from a complex chain", () => {
    const state = q("transactions")
      .filter({ acct: "abc" })
      .filter({ amount: { $lt: 0 } })
      .select(["id", "amount", "date"])
      .orderBy({ date: "desc" })
      .limit(25)
      .offset(50)
      .serialize();

    expect(state.table).toBe("transactions");
    expect(state.filterExpressions).toHaveLength(2);
    expect(state.selectExpressions).toEqual(["id", "amount", "date"]);
    expect(state.orderExpressions).toEqual([{ date: "desc" }]);
    expect(state.limit).toBe(25);
    expect(state.offset).toBe(50);
  });
});

describe("reset()", () => {
  it("returns a clean query with only the table", () => {
    const state = q("transactions")
      .filter({ acct: "abc" })
      .limit(10)
      .reset()
      .serialize();

    expect(state.table).toBe("transactions");
    expect(state.filterExpressions).toEqual([]);
    expect(state.limit).toBeNull();
  });
});
