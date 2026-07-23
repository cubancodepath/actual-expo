import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { createCategoryGroup, createCategory } from "@/core/server/budget";
import { runQuery } from "@/core/db";
import { setGoalTemplates } from "../goal-template";
import type { Template } from "@/core/types/models";

const SIMPLE: Template = { type: "simple", monthly: 200, priority: 0, directive: "template" };

describe("setGoalTemplates — writes goal_def only, never the note (upstream alignment)", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("persists goal_def + source=ui and touches no note", async () => {
    await openTestDb();
    const group = await createCategoryGroup({ name: "Bills" });
    const cat = await createCategory({ name: "Rent", cat_group: group });

    await setGoalTemplates(cat, [SIMPLE]);

    const rows = await runQuery<{ goal_def: string | null; template_settings: string | null }>(
      "SELECT goal_def, template_settings FROM categories WHERE id = ?",
      [cat],
    );
    expect(JSON.parse(rows[0].goal_def!)).toEqual([SIMPLE]);
    expect(JSON.parse(rows[0].template_settings!)).toMatchObject({ source: "ui" });

    // No note was written for this category.
    const notes = await runQuery("SELECT id FROM notes WHERE id = ?", [cat]);
    expect(notes).toHaveLength(0);
    const noteMsgs = await runQuery(
      "SELECT id FROM messages_crdt WHERE dataset = 'notes' AND row = ?",
      [cat],
    );
    expect(noteMsgs).toHaveLength(0);
  });

  it("clears goal_def when passed no templates, still without a note", async () => {
    await openTestDb();
    const group = await createCategoryGroup({ name: "Bills" });
    const cat = await createCategory({ name: "Rent", cat_group: group });

    await setGoalTemplates(cat, []);

    const rows = await runQuery<{ goal_def: string | null }>(
      "SELECT goal_def FROM categories WHERE id = ?",
      [cat],
    );
    expect(rows[0].goal_def).toBeNull();
    const noteMsgs = await runQuery(
      "SELECT id FROM messages_crdt WHERE dataset = 'notes' AND row = ?",
      [cat],
    );
    expect(noteMsgs).toHaveLength(0);
  });
});
