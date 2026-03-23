/**
 * CRDT clock persistence — reads/writes the HLC clock to SQLite.
 */

import { getClock, makeClock, serializeClock, deserializeClock, Timestamp } from "../crdt";
import { run, first } from "../db";

export async function loadClock(): Promise<void> {
  const row = await first<{ clock: string }>("SELECT clock FROM messages_clock WHERE id = 1");
  if (__DEV__) {
    console.log(
      `[loadClock] row exists: ${!!row}, clock preview: ${row?.clock?.slice(0, 60) ?? "NONE"}`,
    );
  }
  if (row) {
    const clock = deserializeClock(row.clock);
    const { setClock } = await import("../crdt");
    setClock(clock);
  } else {
    // Initialize fresh clock with a new node ID
    const { makeClientId, setClock } = await import("../crdt");
    const clientId = makeClientId();
    Timestamp.init({ node: clientId });
    setClock(makeClock(new Timestamp(0, 0, clientId)));
  }
}

export async function saveClock(): Promise<void> {
  const serialized = serializeClock(getClock());
  await run("INSERT OR REPLACE INTO messages_clock (id, clock) VALUES (1, ?)", [serialized]);
}
