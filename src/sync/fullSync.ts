/**
 * Full sync protocol — syncs local CRDT messages with the Actual Budget server.
 *
 * Encodes local messages → POST /sync/sync → decodes response → applies
 * server messages → checks Merkle divergence → retries if needed.
 */

import { getClock, merkle, Timestamp } from '../crdt';
import { encode, decode } from './encoder';
import { postBinary } from '../post';
import { applyMessages, getMessagesSince } from './apply';
import { refreshStoresForDatasets } from '../stores/storeRegistry';
import { getSyncGeneration, isSwitchingBudget } from './lifecycle';

export async function fullSync(attempt = 0): Promise<void> {
  if (isSwitchingBudget()) return;

  const gen = getSyncGeneration();

  // Avoid circular import — import store lazily
  const { usePrefsStore } = await import('../stores/prefsStore');
  const { useSyncStore } = await import('../stores/syncStore');

  const prefs = usePrefsStore.getState();
  if (prefs.isLocalOnly) return;
  if (!prefs.isConfigured) {
    throw new Error('Server not configured — set serverUrl, token, fileId, groupId first');
  }

  useSyncStore.getState()._setStatus('syncing');

  try {
    const sinceStr = prefs.lastSyncedTimestamp ?? '1970-01-01T00:00:00.000Z';
    const since = Timestamp.since(sinceStr);

    const localMessages = await getMessagesSince(since);

    if (__DEV__) {
      const scheduleTables = new Set(['rules', 'schedules', 'schedules_next_date']);
      const relevant = localMessages.filter(m => scheduleTables.has(m.dataset));
      console.log(`[fullSync] sending ${localMessages.length} local messages (${relevant.length} schedule-related)`);
      if (relevant.length > 0) {
        console.log('[fullSync] schedule messages to sync:', relevant.map(m => ({
          dataset: m.dataset, row: m.row.slice(0, 8), column: m.column,
        })));
      }
    }

    if (gen !== getSyncGeneration()) return;

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
    if (gen !== getSyncGeneration()) {
      if (__DEV__) console.log('[fullSync] generation changed during network request — discarding results');
      return;
    }

    const { messages: serverMessages, merkle: serverMerkle } = await decode(
      responseBytes,
      prefs.encryptKeyId,
    );

    if (__DEV__) console.log(`[fullSync] received ${serverMessages.length} messages from server (attempt ${attempt})`);

    if (serverMessages.length > 0) {
      if (gen !== getSyncGeneration()) return;
      await applyMessages(serverMessages);
      if (gen !== getSyncGeneration()) return;
      const affectedDatasets = new Set(serverMessages.map(m => m.dataset));
      await refreshStoresForDatasets(affectedDatasets);
    }

    if (gen !== getSyncGeneration()) return;

    // Persist last synced timestamp — persist middleware auto-saves to MMKV
    prefs.setPrefs({ lastSyncedTimestamp: new Date().toISOString() });

    // Check merkle divergence — only retry if server actually sent messages
    // (otherwise we'd loop 5 times with 0 messages, achieving nothing)
    const diffTime = merkle.diff(serverMerkle as any, getClock().merkle);
    if (diffTime !== null && serverMessages.length > 0 && attempt < 5) {
      return fullSync(attempt + 1);
    }

    useSyncStore.getState()._setStatus('success');

    // Advance schedules after successful sync (auto-post due transactions)
    try {
      const { advanceSchedules } = await import('../schedules');
      await advanceSchedules(true);
    } catch (e) {
      if (__DEV__) console.warn('[fullSync] advanceSchedules failed:', e);
    }
  } catch (e: unknown) {
    if (gen !== getSyncGeneration()) return;
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
