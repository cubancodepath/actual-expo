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
import { appendMessages as undoAppendMessages, clearUndo, type OldData } from './undo';

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
    if (_switchingBudget) return;
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

// ---------------------------------------------------------------------------
// Budget switch guards — generation counter invalidates in-flight syncs
// ---------------------------------------------------------------------------

let _syncGeneration = 0;
let _switchingBudget = false;

/**
 * Reset all module-level sync state. Call during budget switch or disconnect
 * BEFORE opening a new database. Increments the generation counter so any
 * in-flight fullSync() silently discards its results.
 */
export function resetSyncState(): void {
  _syncGeneration++;
  clearSyncTimeout();
  clearUndo();
  _isBatching = false;
  _batched = [];
  _switchingBudget = true;
}

export function clearSwitchingFlag(): void {
  _switchingBudget = false;
}

export function isSwitchingBudget(): boolean {
  return _switchingBudget;
}

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
  const oldData = await applyMessages(messages);
  undoAppendMessages(messages, oldData);
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
  'notes',
  'zero_budgets',
  'zero_budget_months',
  'preferences',
  'tags',
]);

export async function applyMessages(messages: SyncMessage[]): Promise<OldData> {
  if (messages.length === 0) return {};

  // Sort by timestamp for deterministic application
  const sorted = [...messages].sort((a, b) =>
    a.timestamp.toString() < b.timestamp.toString() ? -1 : 1,
  );

  const prefsToSet: Record<string, string | number | null> = {};

  // Capture current DB state for each affected row BEFORE mutating (needed for undo)
  const oldData: OldData = {};
  const rowsToFetch = new Map<string, Set<string>>(); // dataset → Set<rowId>
  for (const msg of sorted) {
    if (msg.dataset === 'prefs' || !ALLOWED_TABLES.has(msg.dataset)) continue;
    if (!rowsToFetch.has(msg.dataset)) rowsToFetch.set(msg.dataset, new Set());
    rowsToFetch.get(msg.dataset)!.add(msg.row);
  }

  for (const [dataset, rowIds] of rowsToFetch) {
    const ids = [...rowIds];
    // Batch fetch: SELECT ... WHERE id IN (?, ?, ...)
    // SQLite has a limit of ~999 variables — chunk if needed
    const CHUNK_SIZE = 500;
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(',');
      const rows = await runQuery<Record<string, unknown>>(
        `SELECT * FROM ${dataset} WHERE id IN (${placeholders})`,
        chunk,
      );
      if (rows.length > 0) {
        if (!oldData[dataset]) oldData[dataset] = {};
        for (const row of rows) {
          oldData[dataset][row.id as string] = row;
        }
      }
    }
  }

  await transaction(async () => {
    for (const msg of sorted) {
      const { dataset, row, column } = msg;
      const serialized = serializeValue(msg.value as string | number | null);
      const value = deserializeValue(serialized);

      // 'prefs' dataset = budget metadata (e.g. budgetName).
      // Not stored in DB — collected and applied to prefsStore after the loop.
      if (dataset === 'prefs') {
        prefsToSet[row] = value;
        // Still record in CRDT log for merkle consistency
        await run(
          'INSERT OR IGNORE INTO messages_crdt (timestamp, dataset, row, column, value) VALUES (?, ?, ?, ?, ?)',
          [msg.timestamp.toString(), dataset, row, column, serialized],
        );
        const clock = getClock();
        const newMerkle = merkle.insert(clock.merkle, msg.timestamp);
        getClock().merkle = merkle.prune(newMerkle);
        continue;
      }

      if (!ALLOWED_TABLES.has(dataset)) {
        console.warn(`applyMessages: ignoring unknown dataset "${dataset}"`);
        continue;
      }

      // Check if row already existed (use oldData to avoid extra query)
      const existed = oldData[dataset]?.[row] != null;

      if (existed) {
        await run(`UPDATE ${dataset} SET ${column} = ? WHERE id = ?`, [value, row]);
      } else {
        // Row may have been created by a prior message in this batch
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

  // Apply synced metadata prefs (e.g. budgetName) to the prefs store
  if (Object.keys(prefsToSet).length > 0) {
    const { usePrefsStore } = await import('../stores/prefsStore');
    if (typeof prefsToSet.budgetName === 'string') {
      usePrefsStore.getState().setPrefs({ budgetName: prefsToSet.budgetName });
    }
  }

  return oldData;
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
  if (_switchingBudget) return;

  const gen = _syncGeneration;

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

    if (gen !== _syncGeneration) return;

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

    // Critical guard: discard results if budget changed during network request
    if (gen !== _syncGeneration) {
      if (__DEV__) console.log('[fullSync] generation changed during network request — discarding results');
      return;
    }

    const { messages: serverMessages, merkle: serverMerkle } = await decode(
      responseBytes,
      prefs.encryptKeyId,
    );

    if (__DEV__) console.log(`[fullSync] received ${serverMessages.length} messages from server (attempt ${attempt})`);

    if (serverMessages.length > 0) {
      if (gen !== _syncGeneration) return;
      await applyMessages(serverMessages);
      if (gen !== _syncGeneration) return;
      const affectedDatasets = new Set(serverMessages.map(m => m.dataset));
      await refreshAffectedStores(affectedDatasets);
    }

    if (gen !== _syncGeneration) return;

    // Persist last synced timestamp — persist middleware auto-saves to MMKV
    prefs.setPrefs({ lastSyncedTimestamp: new Date().toISOString() });

    // Check merkle divergence — only retry if server actually sent messages
    // (otherwise we'd loop 5 times with 0 messages, achieving nothing)
    const diffTime = merkle.diff(serverMerkle as any, getClock().merkle);
    if (diffTime !== null && serverMessages.length > 0 && attempt < 5) {
      return fullSync(attempt + 1);
    }

    useSyncStore.getState()._setStatus('success');
  } catch (e: unknown) {
    if (gen !== _syncGeneration) return;
    const msg = e instanceof Error ? e.message : String(e);
    // Silently ignore errors from DB closing during budget switch
    if (msg.includes('closed resource') || msg.includes('not initialized')) {
      useSyncStore.getState()._setStatus('idle');
      return;
    }
    useSyncStore.getState()._setError(msg);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Store refresh — called after applyMessages()
// ---------------------------------------------------------------------------

// Map CRDT datasets → which stores need refreshing
const DATASET_STORE_MAP: Record<string, string[]> = {
  accounts: ['accounts'],
  transactions: ['accounts', 'transactions', 'budget'], // transactions affect account balances + budget spent
  categories: ['categories', 'budget'],
  category_groups: ['categories', 'budget'],
  category_mapping: ['categories'],
  payees: ['payees'],
  payee_mapping: ['payees'],
  zero_budgets: ['budget'],
  zero_budget_months: ['budget'],
  preferences: ['preferences'],
  tags: ['tags'],
  notes: [],
  prefs: ['preferences'],
};

async function refreshAffectedStores(datasets: Set<string>): Promise<void> {
  const storesToRefresh = new Set<string>();
  for (const ds of datasets) {
    const stores = DATASET_STORE_MAP[ds];
    if (stores) {
      for (const s of stores) storesToRefresh.add(s);
    } else {
      // Unknown dataset — refresh everything to be safe
      return refreshAllStores();
    }
  }

  if (storesToRefresh.size === 0) return;

  const [
    { useAccountsStore },
    { useTransactionsStore },
    { useCategoriesStore },
    { useBudgetStore },
    { usePreferencesStore },
    { useTagsStore },
  ] = await Promise.all([
    import('../stores/accountsStore'),
    import('../stores/transactionsStore'),
    import('../stores/categoriesStore'),
    import('../stores/budgetStore'),
    import('../stores/preferencesStore'),
    import('../stores/tagsStore'),
  ]);

  const refreshes: Promise<void>[] = [];
  if (storesToRefresh.has('accounts')) refreshes.push(useAccountsStore.getState().load());
  if (storesToRefresh.has('transactions'))
    refreshes.push(useTransactionsStore.getState().load(useTransactionsStore.getState().accountId ?? undefined));
  if (storesToRefresh.has('categories')) refreshes.push(useCategoriesStore.getState().load());
  if (storesToRefresh.has('budget')) refreshes.push(useBudgetStore.getState().load());
  if (storesToRefresh.has('preferences')) refreshes.push(usePreferencesStore.getState().load());
  if (storesToRefresh.has('tags')) refreshes.push(useTagsStore.getState().load());

  const results = await Promise.allSettled(refreshes);
  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('[refreshAffectedStores] store load failed:', result.reason);
    }
  }
}

export async function refreshAllStores(): Promise<void> {
  // Lazy import to avoid circular dependencies
  const [
    { useAccountsStore },
    { useTransactionsStore },
    { useCategoriesStore },
    { useBudgetStore },
    { usePreferencesStore },
    { useTagsStore },
  ] = await Promise.all([
    import('../stores/accountsStore'),
    import('../stores/transactionsStore'),
    import('../stores/categoriesStore'),
    import('../stores/budgetStore'),
    import('../stores/preferencesStore'),
    import('../stores/tagsStore'),
  ]);

  // Use allSettled so one failure doesn't block the others
  const results = await Promise.allSettled([
    useAccountsStore.getState().load(),
    useTransactionsStore
      .getState()
      .load(useTransactionsStore.getState().accountId ?? undefined),
    useCategoriesStore.getState().load(),
    useBudgetStore.getState().load(),
    usePreferencesStore.getState().load(),
    useTagsStore.getState().load(),
  ]);

  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('[refreshAllStores] store load failed:', result.reason);
    }
  }
}
