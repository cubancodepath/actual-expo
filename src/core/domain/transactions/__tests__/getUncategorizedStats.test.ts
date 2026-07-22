import { describe, it, expect, afterEach, vi } from "vitest";

// save.ts (pulled in via ../save) imports @/core/platform/location →
// expo-location, which has no vitest alias. Stub it — same rationale as
// save.test.ts.
vi.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: vi.fn(),
  getForegroundPermissionsAsync: vi.fn(),
  getCurrentPositionAsync: vi.fn(),
}));

import { setupFixtures, closeTestDb } from "./helpers";
import { saveTransaction } from "../save";
import { getUncategorizedStats } from "../index";

/**
 * Characterization pin for getUncategorizedStats (plan: rules/mappings parity).
 * Protects the normal uncategorized case while its payee join is rerouted
 * through payee_mapping. Must hold before and after that change.
 */
describe("getUncategorizedStats — characterization", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("counts an uncategorized expense on an on-budget account", async () => {
    const { accountA, payeeId } = await setupFixtures();
    await saveTransaction({
      account: accountA,
      date: 20260101,
      amount: 1500,
      type: "expense",
      payeeId,
      payeeName: "",
      categoryId: null,
      notes: null,
      cleared: false,
      splitCategories: null,
    });

    const stats = await getUncategorizedStats();
    expect(stats.count).toBe(1);
    expect(stats.total).toBe(-1500);
  });

  it("does not count a categorized transaction", async () => {
    const { accountA, categoryId, payeeId } = await setupFixtures();
    await saveTransaction({
      account: accountA,
      date: 20260101,
      amount: 1500,
      type: "expense",
      payeeId,
      payeeName: "",
      categoryId,
      notes: null,
      cleared: false,
      splitCategories: null,
    });

    const stats = await getUncategorizedStats();
    expect(stats.count).toBe(0);
  });
});
