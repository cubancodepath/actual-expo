import type { Timestamp } from "./timestamp";

/**
 * Represents a node within a trinary radix trie.
 */
export type TrieNode = {
  "0"?: TrieNode;
  "1"?: TrieNode;
  "2"?: TrieNode;
  hash?: number;
};

type NumberTrieNodeKey = keyof Omit<TrieNode, "hash">;

export function emptyTrie(): TrieNode {
  return { hash: 0 };
}

function isNumberTrieNodeKey(input: string): input is NumberTrieNodeKey {
  return ["0", "1", "2"].includes(input);
}

export function getKeys(trie: TrieNode): NumberTrieNodeKey[] {
  return Object.keys(trie).filter(isNumberTrieNodeKey);
}

export function keyToTimestamp(key: string): number {
  const fullkey = key + "0".repeat(16 - key.length);
  return parseInt(fullkey, 3) * 1000 * 60;
}

export function insert(trie: TrieNode, timestamp: Timestamp) {
  const hash = timestamp.hash();
  const key = Number(Math.floor(timestamp.millis() / 1000 / 60)).toString(3);

  trie = Object.assign({}, trie, { hash: (trie.hash || 0) ^ hash });
  return insertKey(trie, key, hash);
}

function insertKey(trie: TrieNode, key: string, hash: number): TrieNode {
  if (key.length === 0) {
    return trie;
  }
  const c = key[0];
  const t = isNumberTrieNodeKey(c) ? trie[c] : undefined;
  const n = t || {};
  return Object.assign({}, trie, {
    [c]: Object.assign({}, n, insertKey(n, key.slice(1), hash), {
      hash: (n.hash || 0) ^ hash,
    }),
  });
}

export function build(timestamps: Timestamp[]) {
  const trie = emptyTrie();
  for (const timestamp of timestamps) {
    insert(trie, timestamp);
  }
  return trie;
}

export function diff(trie1: TrieNode, trie2: TrieNode): number | null {
  if (trie1.hash === trie2.hash) {
    return null;
  }

  let node1 = trie1;
  let node2 = trie2;
  let k = "";

  while (true) {
    const keyset = new Set([...getKeys(node1), ...getKeys(node2)]);
    const keys = [...keyset.values()];
    keys.sort((a, b) => a.localeCompare(b));

    let diffkey: null | "0" | "1" | "2" = null;

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];

      const next1 = node1[key];
      const next2 = node2[key];

      if (!next1 || !next2) {
        break;
      }

      if (next1.hash !== next2.hash) {
        diffkey = key;
        break;
      }
    }

    if (!diffkey) {
      return keyToTimestamp(k);
    }

    k += diffkey;
    node1 = node1[diffkey] || emptyTrie();
    node2 = node2[diffkey] || emptyTrie();
  }

  return null;
}

export function prune(trie: TrieNode, n = 2): TrieNode {
  if (!trie.hash) {
    return trie;
  }

  const keys = getKeys(trie);
  keys.sort((a, b) => a.localeCompare(b));

  const next: TrieNode = { hash: trie.hash };

  for (const k of keys.slice(-n)) {
    const node = trie[k];

    if (!node) {
      throw new Error(`TrieNode for key ${k} could not be found`);
    }

    next[k] = prune(node, n);
  }

  return next;
}

export function debug(trie: TrieNode, k = "", indent = 0): string {
  const str =
    " ".repeat(indent) + (k !== "" ? `k: ${k} ` : "") + `hash: ${trie.hash || "(empty)"}\n`;
  return (
    str +
    getKeys(trie)
      .map((key) => {
        const node = trie[key];
        if (!node) return "";
        return debug(node, key, indent + 2);
      })
      .join("")
  );
}
