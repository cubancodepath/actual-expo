import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "./testDb";
import { applyMessages } from "@/core/server/sync/apply";
import { emit } from "@/core/server/sync/syncEvents";
import { Timestamp } from "@/core/crdt";
import { loadMappings, ensureMappingsLoaded, getMappings, clearMappings } from "../mappings";

/**
 * Writes a payee_mapping redirect straight to the DB via applyMessages, which —
 * unlike sendMessages — does NOT emit a sync event. This lets tests decide
 * exactly which event (if any) reaches the cache listener.
 */
async function writeMapping(id: string, targetId: string): Promise<void> {
  await applyMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: "payee_mapping",
      row: id,
      column: "targetId",
      value: targetId,
    },
  ]);
}

describe("mappings cache", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("loads existing rows into a flat id→target map", async () => {
    await openTestDb();
    await writeMapping("a", "a");
    await writeMapping("b", "target");
    await loadMappings();

    const map = getMappings();
    expect(map.get("a")).toBe("a");
    expect(map.get("b")).toBe("target");
  });

  it("refreshes on a sync event that touches a mapping table", async () => {
    await openTestDb();
    await loadMappings();
    expect(getMappings().get("x")).toBeUndefined();

    await writeMapping("x", "y");
    emit({ type: "applied", tables: ["payee_mapping"] });
    await ensureMappingsLoaded();

    expect(getMappings().get("x")).toBe("y");
  });

  it("ignores sync events that do not touch a mapping table", async () => {
    await openTestDb();
    await loadMappings();

    await writeMapping("p", "q");
    // A transactions-only event must NOT trigger a refresh.
    emit({ type: "applied", tables: ["transactions"] });
    await ensureMappingsLoaded();

    expect(getMappings().get("p")).toBeUndefined();
  });

  it("reacts to the remote 'success' event too", async () => {
    await openTestDb();
    await loadMappings();

    await writeMapping("r", "s");
    emit({ type: "success", tables: ["transactions", "category_mapping"] });
    await ensureMappingsLoaded();

    expect(getMappings().get("r")).toBe("s");
  });

  it("clears on database close with no bleed-through to the next db", async () => {
    await openTestDb();
    await writeMapping("only-in-first", "t");
    await loadMappings();
    expect(getMappings().get("only-in-first")).toBe("t");

    await closeTestDb(); // closeDatabase() → clearMappings()
    expect(getMappings().size).toBe(0);

    await openTestDb();
    await ensureMappingsLoaded();
    expect(getMappings().get("only-in-first")).toBeUndefined();
  });

  it("getMappings returns an empty map before load (migrateIds no-op safe)", async () => {
    await openTestDb();
    clearMappings();
    expect(getMappings().size).toBe(0);
  });
});
