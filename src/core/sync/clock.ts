/**
 * CRDT clock persistence — reads/writes the HLC clock to SQLite.
 */

import { getClock, makeClock, serializeClock, deserializeClock, Timestamp } from "@/core/crdt";
import type { TrieNode } from "@/core/crdt/merkle";
import { run, first } from "@/core/db";

export async function loadClock(): Promise<void> {
  const row = await first<{ clock: string }>("SELECT clock FROM messages_clock WHERE id = 1");
  if (__DEV__) {
    console.log(
      `[loadClock] row exists: ${!!row}, clock preview: ${row?.clock?.slice(0, 60) ?? "NONE"}`,
    );
  }
  if (row) {
    const clock = deserializeClock(row.clock);
    const { setClock } = await import("@/core/crdt");
    setClock(clock);
  } else {
    // Initialize fresh clock with a new node ID
    const { makeClientId, setClock } = await import("@/core/crdt");
    const clientId = makeClientId();
    Timestamp.init({ node: clientId });
    setClock(makeClock(new Timestamp(0, 0, clientId)));
  }
}

export async function saveClock(): Promise<void> {
  const serialized = serializeClock(getClock());
  await run("INSERT OR REPLACE INTO messages_clock (id, clock) VALUES (1, ?)", [serialized]);
}

/**
 * Persist the clock with a given merkle trie, WITHOUT mutating the
 * in-memory clock returned by getClock(). Used while applying a batch of
 * sync messages so the persisted state and the in-memory state only ever
 * advance together, after the enclosing DB transaction has committed —
 * a mid-transaction throw must never leave getClock() ahead of what's on
 * disk. Callers assign `getClock().merkle = merkleTrie` themselves once
 * the transaction has resolved.
 */
export async function saveClockWith(merkleTrie: TrieNode): Promise<void> {
  const serialized = serializeClock({ ...getClock(), merkle: merkleTrie });
  await run("INSERT OR REPLACE INTO messages_clock (id, clock) VALUES (1, ?)", [serialized]);
}
