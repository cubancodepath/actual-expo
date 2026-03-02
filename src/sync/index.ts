/**
 * CRDT sync engine for actual-expo.
 *
 * Equivalent to loot-core/src/server/sync/index.ts adapted for:
 *   - Expo SQLite (raw SQL via src/db/index.ts)
 *   - No Redux — stores refreshed via refreshAllStores()
 *   - encoder.ts already adapted (protobufjs, @noble/ciphers)
 */

import { randomUUID } from 'expo-crypto';
import {
  getClock,
  makeClock,
  merkle,
  serializeClock,
  deserializeClock,
  Timestamp,
} from '../crdt';
import { encode, decode, type SyncMessage } from './encoder';
import { postBinary } from '../post';
import { run, runQuery, first, transaction } from '../db';
import type { MessagesCrdtRow } from '../db/types';

// ---------------------------------------------------------------------------
// Value serialization — identical to loot-core
// ---------------------------------------------------------------------------

export function serializeValue(value: string | number | null): string {
  if (value === null) return '0:';
  if (typeof value === 'number') return 'N:' + value;
  return 'S:' + value;
}

export function deserializeValue(value: string): string | number | null {
  if (value === '0:') return null;
  if (value.startsWith('N:')) return parseFloat(value.slice(2));
  if (value.startsWith('S:')) return value.slice(2);
  return value;
}

// ---------------------------------------------------------------------------
// Scheduled full sync — mirrors loot-core's scheduleFullSync()
// Debounced: rapid mutations collapse into one network request.
// ---------------------------------------------------------------------------

const FULL_SYNC_DELAY = 1000; // ms
let _syncTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleFullSync(): void {
  if (_syncTimeout) clearTimeout(_syncTimeout);
  _syncTimeout = setTimeout(async () => {
    _syncTimeout = null;
    try {
      const { usePrefsStore } = await import('../stores/prefsStore');
      if (!usePrefsStore.getState().isConfigured) return;
      await fullSync();
    } catch {
      // fullSync already writes the error into syncStore — nothing to do here
    }
  }, FULL_SYNC_DELAY);
}

export function clearSyncTimeout(): void {
  if (_syncTimeout) {
    clearTimeout(_syncTimeout);
    _syncTimeout = null;
  }
}

// ---------------------------------------------------------------------------
// Message batching
// ---------------------------------------------------------------------------

let _isBatching = false;
let _batched: SyncMessage[] = [];

export async function batchMessages(fn: () => Promise<void>): Promise<void> {
  _isBatching = true;
  try {
    await fn();
  } finally {
    _isBatching = false;
    const batched = _batched;
    _batched = [];
    if (batched.length > 0) {
      await _applyAndRecord(batched);
    }
  }
}

// ---------------------------------------------------------------------------
// Clock persistence
// ---------------------------------------------------------------------------

export async function loadClock(): Promise<void> {
  const row = await first<{ clock: string }>(
    'SELECT clock FROM messages_clock WHERE id = 1',
  );
  if (row) {
    const clock = deserializeClock(row.clock);
    const { setClock } = await import('../crdt');
    setClock(clock);
  } else {
    // Initialize fresh clock with a new node ID
    const { makeClientId, setClock } = await import('../crdt');
    const clientId = makeClientId();
    Timestamp.init({ node: clientId });
    setClock(makeClock(new Timestamp(0, 0, clientId)));
  }
}

export async function saveClock(): Promise<void> {
  const serialized = serializeClock(getClock());
  await run(
    'INSERT OR REPLACE INTO messages_clock (id, clock) VALUES (1, ?)',
    [serialized],
  );
}

// ---------------------------------------------------------------------------
// Core: sendMessages / applyMessages
// ---------------------------------------------------------------------------

export async function sendMessages(messages: SyncMessage[]): Promise<void> {
  if (_isBatching) {
    _batched = _batched.concat(messages);
    return;
  }
  await _applyAndRecord(messages);
}

async function _applyAndRecord(messages: SyncMessage[]): Promise<void> {
  await applyMessages(messages);
  scheduleFullSync(); // upload local changes to server after every mutation
}

// Allowed tables — guard against arbitrary SQL injection via dataset name
const ALLOWED_TABLES = new Set([
  'accounts',
  'transactions',
  'categories',
  'category_groups',
  'category_mapping',
  'payees',
  'payee_mapping',
  'zero_budgets',
  'zero_budget_months',
]);

export async function applyMessages(messages: SyncMessage[]): Promise<void> {
  if (messages.length === 0) return;

  // Sort by timestamp for deterministic application
  const sorted = [...messages].sort((a, b) =>
    a.timestamp.toString() < b.timestamp.toString() ? -1 : 1,
  );

  await transaction(async () => {
    for (const msg of sorted) {
      const { dataset, row, column } = msg;
      const serialized = serializeValue(msg.value as string | number | null);
      const value = deserializeValue(serialized);

      if (!ALLOWED_TABLES.has(dataset)) {
        console.warn(`applyMessages: ignoring unknown dataset "${dataset}"`);
        continue;
      }

      // Check if row exists
      const existing = await first<{ id: string }>(
        `SELECT id FROM ${dataset} WHERE id = ?`,
        [row],
      );

      if (existing) {
        await run(`UPDATE ${dataset} SET ${column} = ? WHERE id = ?`, [value, row]);
      } else {
        await run(
          `INSERT INTO ${dataset} (id, ${column}) VALUES (?, ?)`,
          [row, value],
        );
      }

      // Record in CRDT log
      await run(
        'INSERT OR IGNORE INTO messages_crdt (timestamp, dataset, row, column, value) VALUES (?, ?, ?, ?, ?)',
        [msg.timestamp.toString(), dataset, row, column, serialized],
      );

      // Update in-memory merkle trie
      const clock = getClock();
      const newMerkle = merkle.insert(clock.merkle, msg.timestamp);
      getClock().merkle = merkle.prune(newMerkle);
    }
  });

  await saveClock();

  // Notify all Zustand stores
  await refreshAllStores();
}

// ---------------------------------------------------------------------------
// Helpers for fullSync
// ---------------------------------------------------------------------------

export async function getMessagesSince(since: string): Promise<SyncMessage[]> {
  const rows = await runQuery<MessagesCrdtRow>(
    'SELECT * FROM messages_crdt WHERE timestamp > ? ORDER BY timestamp',
    [since],
  );
  return rows.map(r => ({
    timestamp: Timestamp.parse(r.timestamp)!,
    dataset: r.dataset,
    row: r.row,
    column: r.column,
    value: deserializeValue(r.value),
  }));
}

// ---------------------------------------------------------------------------
// Full sync against actual-budget server
// ---------------------------------------------------------------------------

export async function fullSync(attempt = 0): Promise<void> {
  // Avoid circular import — import store lazily
  const { usePrefsStore } = await import('../stores/prefsStore');
  const { useSyncStore } = await import('../stores/syncStore');

  const prefs = usePrefsStore.getState();
  if (!prefs.isConfigured) {
    throw new Error('Server not configured — set serverUrl, token, fileId, groupId first');
  }

  useSyncStore.getState()._setStatus('syncing');

  try {
    const sinceStr = prefs.lastSyncedTimestamp ?? '1970-01-01T00:00:00.000Z';
    const since = Timestamp.since(sinceStr);

    const localMessages = await getMessagesSince(since);

    const requestBytes = await encode(
      prefs.groupId,
      prefs.fileId,
      since,
      localMessages,
      prefs.encryptKeyId,
    );

    const responseBytes = await postBinary(
      `${prefs.serverUrl}/sync/sync`,
      requestBytes,
      {
        'x-actual-token': prefs.token,
        'x-actual-file-id': prefs.fileId,
      },
    );

    const { messages: serverMessages, merkle: serverMerkle } = await decode(
      responseBytes,
      prefs.encryptKeyId,
    );

    console.log(`[fullSync] received ${serverMessages.length} messages from server (attempt ${attempt})`);

    if (serverMessages.length > 0) {
      await applyMessages(serverMessages);
    }

    // Persist last synced timestamp — persist middleware auto-saves to MMKV
    prefs.setPrefs({ lastSyncedTimestamp: new Date().toISOString() });

    // Check merkle divergence — retry up to 5 times
    const diffTime = merkle.diff(serverMerkle as any, getClock().merkle);
    if (diffTime !== null && attempt < 5) {
      return fullSync(attempt + 1);
    }

    useSyncStore.getState()._setStatus('success');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    useSyncStore.getState()._setError(msg);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Store refresh — called after applyMessages()
// ---------------------------------------------------------------------------

async function refreshAllStores(): Promise<void> {
  // Lazy import to avoid circular dependencies
  const [
    { useAccountsStore },
    { useTransactionsStore },
    { useCategoriesStore },
    { useBudgetStore },
  ] = await Promise.all([
    import('../stores/accountsStore'),
    import('../stores/transactionsStore'),
    import('../stores/categoriesStore'),
    import('../stores/budgetStore'),
  ]);

  // Use allSettled so one failure doesn't block the others
  const results = await Promise.allSettled([
    useAccountsStore.getState().load(),
    useTransactionsStore
      .getState()
      .load(useTransactionsStore.getState().accountId ?? undefined),
    useCategoriesStore.getState().load(),
    useBudgetStore.getState().load(),
  ]);

  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('[refreshAllStores] store load failed:', result.reason);
    }
  }
}
