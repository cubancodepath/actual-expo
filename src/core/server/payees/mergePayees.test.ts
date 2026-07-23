import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { runQuery, first } from "@/core/db";
import { sendMessages } from "@/core/sync";
import { Timestamp } from "@/core/crdt";
import { createPayee, mergePayees } from "./index";

/**
 * Characterization tests for the payee_mapping write flow (plan: rules/mappings
 * parity). These pin CURRENT behavior of mergePayees so the migrateIds wiring
 * built on top of it has a stable foundation. They must pass on the unmodified
 * branch.
 */
describe("mergePayees — payee_mapping writes", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  async function targetIdOf(id: string): Promise<string | null> {
    const row = await first<{ targetId: string }>(
      "SELECT targetId FROM payee_mapping WHERE id = ?",
      [id],
    );
    return row?.targetId ?? null;
  }

  it("creates a self-mapping on payee creation", async () => {
    await openTestDb();
    const a = await createPayee({ name: "A" });
    expect(await targetIdOf(a)).toBe(a);
  });

  it("redirects the merged payee's mapping to the target and tombstones it", async () => {
    await openTestDb();
    const target = await createPayee({ name: "Target" });
    const merged = await createPayee({ name: "Merged" });

    await mergePayees(target, [merged]);

    expect(await targetIdOf(merged)).toBe(target);
    const row = await first<{ tombstone: number }>("SELECT tombstone FROM payees WHERE id = ?", [
      merged,
    ]);
    expect(row?.tombstone).toBe(1);
    // Target itself stays a live self-mapping.
    expect(await targetIdOf(target)).toBe(target);
  });

  it("flattens an existing chain: C -> A becomes C -> B after merging A into B", async () => {
    await openTestDb();
    const b = await createPayee({ name: "B (target)" });
    const a = await createPayee({ name: "A" });
    const c = await createPayee({ name: "C" });

    // Hand-build a pre-existing redirect C -> A (as if C had been merged into A
    // earlier). This is exactly the state mergePayees must flatten.
    await sendMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "payee_mapping",
        row: c,
        column: "targetId",
        value: a,
      },
    ]);
    expect(await targetIdOf(c)).toBe(a);

    await mergePayees(b, [a]);

    // Both A's own mapping and the pre-existing C -> A redirect collapse onto B
    // (single hop, no chains).
    expect(await targetIdOf(a)).toBe(b);
    expect(await targetIdOf(c)).toBe(b);
  });

  it("refuses to merge into a transfer payee (no-op)", async () => {
    await openTestDb();
    // A transfer payee has transfer_acct set; build one directly.
    const transferId = "transfer-payee";
    await sendMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "payees",
        row: transferId,
        column: "name",
        value: "Xfer",
      },
      {
        timestamp: Timestamp.send()!,
        dataset: "payees",
        row: transferId,
        column: "transfer_acct",
        value: "some-acct",
      },
      {
        timestamp: Timestamp.send()!,
        dataset: "payee_mapping",
        row: transferId,
        column: "targetId",
        value: transferId,
      },
    ]);
    const merged = await createPayee({ name: "Merged" });

    await mergePayees(transferId, [merged]);

    // Nothing happened: merged still self-maps, not tombstoned.
    expect(await targetIdOf(merged)).toBe(merged);
    const rows = await runQuery<{ tombstone: number }>(
      "SELECT tombstone FROM payees WHERE id = ?",
      [merged],
    );
    expect(rows[0].tombstone).toBe(0);
  });
});
