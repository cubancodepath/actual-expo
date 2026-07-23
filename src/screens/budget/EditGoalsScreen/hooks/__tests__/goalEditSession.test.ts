import { describe, it, expect } from "vitest";
import { createDefaultTemplate } from "@/core/server/budget/goals";
import type { AutomationEntry } from "@/core/server/budget/goals";
import type { GoalFormValues } from "../../validation/goalForm.schema";
import { computeGoalEditSeed, computeNextEntries } from "../goalEditSession.logic";

const savedFixed: AutomationEntry = {
  id: "entry-1",
  displayType: "fixed",
  template: { ...createDefaultTemplate("fixed"), amount: 50 } as AutomationEntry["template"],
};
const savedHistorical: AutomationEntry = {
  id: "entry-2",
  displayType: "historical",
  template: createDefaultTemplate("historical"),
};

describe("computeGoalEditSeed", () => {
  it("seeds an edit session from the matching saved entry", () => {
    const seed = computeGoalEditSeed({
      entryId: "entry-1",
      savedEntries: [savedFixed, savedHistorical],
    });
    expect(seed.key).toBe("entry-1");
    expect(seed.values).toEqual({
      entryId: "entry-1",
      displayType: "fixed",
      template: savedFixed.template,
    });
  });

  it("seeds a fresh draft when newType is given and no entryId matches", () => {
    const seed = computeGoalEditSeed({ newType: "percentage", savedEntries: [savedFixed] });
    expect(seed.key).toBe("new-percentage");
    expect(seed.values.entryId).toBeNull();
    expect(seed.values.displayType).toBe("percentage");
    expect(seed.values.template).toEqual(createDefaultTemplate("percentage"));
  });

  it("defaults to a fixed draft when neither entryId nor newType is given", () => {
    const seed = computeGoalEditSeed({ savedEntries: [] });
    expect(seed.key).toBe("new-fixed");
    expect(seed.values.displayType).toBe("fixed");
  });

  it("falls back to a fresh draft when entryId doesn't match any saved entry", () => {
    const seed = computeGoalEditSeed({
      entryId: "ghost",
      newType: "limit",
      savedEntries: [savedFixed],
    });
    expect(seed.key).toBe("new-limit");
    expect(seed.values.entryId).toBeNull();
  });

  it("round-trips: seeding from a saved entry then saving with no edits reproduces it", () => {
    const seed = computeGoalEditSeed({
      entryId: "entry-1",
      savedEntries: [savedFixed, savedHistorical],
    });
    const next = computeNextEntries(seed.values, [savedFixed, savedHistorical]);
    expect(next).toHaveLength(2);
    expect(next.find((e) => e.id === "entry-1")).toEqual(savedFixed);
  });
});

describe("computeNextEntries", () => {
  it("replaces the saved entry in place when entryId matches (edit session)", () => {
    const values: GoalFormValues = {
      entryId: "entry-1",
      displayType: "fixed",
      template: { ...createDefaultTemplate("fixed"), amount: 999 } as GoalFormValues["template"],
    };
    const next = computeNextEntries(values, [savedFixed, savedHistorical]);
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual({ id: "entry-1", displayType: "fixed", template: values.template });
    expect(next[1]).toBe(savedHistorical);
  });

  it("appends a new persisted entry when entryId is null (create session)", () => {
    const values: GoalFormValues = {
      entryId: null,
      displayType: "limit",
      template: createDefaultTemplate("limit"),
    };
    const next = computeNextEntries(values, [savedFixed]);
    expect(next).toHaveLength(2);
    expect(next[0]).toBe(savedFixed);
    expect(next[1].displayType).toBe("limit");
    expect(next[1].template).toEqual(createDefaultTemplate("limit"));
    // Appended entries get a real, persisted id distinct from the draft placeholder.
    expect(next[1].id).not.toBe("__draft__");
  });

  it("appends (does not replace) when entryId doesn't match any saved entry", () => {
    const values: GoalFormValues = {
      entryId: "ghost",
      displayType: "fixed",
      template: createDefaultTemplate("fixed"),
    };
    const next = computeNextEntries(values, [savedFixed]);
    expect(next).toHaveLength(2);
    expect(next[0]).toBe(savedFixed);
  });

  it("a no-op edit (unchanged values) produces an entry set equal in content to the original", () => {
    const values: GoalFormValues = {
      entryId: savedFixed.id,
      displayType: savedFixed.displayType,
      template: savedFixed.template,
    };
    const next = computeNextEntries(values, [savedFixed, savedHistorical]);
    expect(next).toEqual([savedFixed, savedHistorical]);
  });

  it("leaves unrelated saved entries untouched by identity", () => {
    const values: GoalFormValues = {
      entryId: "entry-1",
      displayType: "fixed",
      template: { ...createDefaultTemplate("fixed"), amount: 1 } as GoalFormValues["template"],
    };
    const next = computeNextEntries(values, [savedFixed, savedHistorical]);
    expect(next[1]).toBe(savedHistorical);
  });
});
