/**
 * Sync repair — rebuild merkle hash from CRDT log.
 * Ported from upstream Actual Budget (loot-core/src/server/sync/repair.ts).
 *
 * Used when the in-memory merkle trie diverges from what the messages
 * in the DB should produce. This can happen if the trie was pruned
 * differently, or if messages were applied without updating the trie.
 */

import { runQuerySync } from "../db";
import { merkle, Timestamp, getClock } from "../crdt";
import { saveClock } from "./clock";

export function rebuildMerkleHash(): { numMessages: number; trie: merkle.TrieNode } {
  const rows = runQuerySync<{ timestamp: string }>("SELECT timestamp FROM messages_crdt");
  let trie = merkle.emptyTrie();

  for (const row of rows) {
    const ts = Timestamp.parse(row.timestamp);
    if (ts) {
      trie = merkle.insert(trie, ts);
    }
  }

  return { numMessages: rows.length, trie };
}

export async function repairSync(): Promise<void> {
  const rebuilt = rebuildMerkleHash();
  getClock().merkle = rebuilt.trie;
  await saveClock();
}
