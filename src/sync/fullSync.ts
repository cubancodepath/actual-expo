/**
 * Full sync protocol — syncs local CRDT messages with the Actual Budget server.
 *
 * Encodes local messages → POST /sync/sync → decodes response → applies
 * server messages → checks Merkle divergence → retries if needed.
 *
 * Aligned with upstream Actual Budget (loot-core/src/server/sync/index.ts).
 */

import { getClock, merkle, Timestamp } from "../crdt";
import { encode, decode } from "./encoder";
import type { SyncMessage } from "./encoder";
import { postBinary } from "../post";
import { PostError, SyncError, toAppError } from "../errors";
import { applyMessages, getMessagesSince } from "./apply";
import { saveClock } from "./clock";
import { emit } from "./syncEvents";
import { getSyncGeneration, isSwitchingBudget, setActiveSyncPromise } from "./lifecycle";

/** Normalize table names for event emission (upstream pattern) */
function normalizeTables(datasets: string[]): string[] {
  return [...new Set(datasets.map((d) => (d === "schedules_next_date" ? "schedules" : d)))];
}

const BUDGET_TABLES = new Set(["zero_budgets", "zero_budget_months", "transactions"]);

/**
 * Inner sync function — may be called recursively on merkle divergence.
 * Matches upstream _fullSync(sinceTimestamp, count, prevDiffTime) pattern.
 *
 * Returns all received messages across retries (for triggerBudgetChanges).
 */
async function _fullSync(
  sinceTimestamp: string | null,
  count: number,
  prevDiffTime: number | null,
  gen: number,
  prefs: any,
  useSyncStore: any,
): Promise<SyncMessage[]> {
  if (isSwitchingBudget()) return [];
  if (gen !== getSyncGeneration()) return [];

  // Snapshot local clock before network request (upstream pattern)
  const currentTime = getClock().timestamp.toString();

  // Match upstream exactly (sync/index.ts line 674-678):
  // sinceTimestamp (from retry) || lastSyncedTimestamp || 5-minutes-ago
  const since = Timestamp.since(
    sinceTimestamp ||
      prefs.lastSyncedTimestamp ||
      new Timestamp(Date.now() - 5 * 60 * 1000, 0, "0").toString(),
  );

  const localMessages = await getMessagesSince(since);

  if (__DEV__) {
    console.log(`[fullSync] attempt ${count}, sending ${localMessages.length} local messages`);
  }

  if (gen !== getSyncGeneration()) return [];

  const requestBytes = await encode(
    prefs.groupId,
    prefs.fileId,
    since,
    localMessages,
    prefs.encryptKeyId,
  );

  const responseBytes = await postBinary(`${prefs.serverUrl}/sync/sync`, requestBytes, {
    "x-actual-token": prefs.token,
    "x-actual-file-id": prefs.fileId,
  });

  if (gen !== getSyncGeneration()) return [];

  const { messages: serverMessages, merkle: serverMerkle } = await decode(
    responseBytes,
    prefs.encryptKeyId,
  );

  if (__DEV__) {
    console.log(`[fullSync] received ${serverMessages.length} messages from server`);
  }

  const localTimeChanged = getClock().timestamp.toString() !== currentTime;

  // Advance local clock with server timestamps (upstream: receiveMessages → Timestamp.recv)
  let receivedMessages: SyncMessage[] = [];
  let merkleChanged = false;
  if (serverMessages.length > 0) {
    try {
      for (const msg of serverMessages) {
        Timestamp.recv(msg.timestamp);
      }
    } catch (e) {
      if (e instanceof Timestamp.ClockDriftError) {
        throw new SyncError("clock-drift");
      }
      throw e;
    }

    if (gen !== getSyncGeneration()) return [];
    const merkleBefore = getClock().merkle.hash;
    await applyMessages(serverMessages);
    merkleChanged = getClock().merkle.hash !== merkleBefore;
    receivedMessages = serverMessages;
  }

  // Check merkle divergence (upstream pattern: lines 728-806)
  const diffTime = merkle.diff(serverMerkle as any, getClock().merkle);

  if (diffTime !== null) {
    // If server sent messages but our merkle didn't change (all duplicates),
    // the local merkle trie is corrupted. Rebuild from CRDT log.
    // Upstream uses rebuildMerkleHash() in repair.ts for this exact case.
    if (!merkleChanged && count > 0) {
      if (__DEV__) console.log("[fullSync] merkle corrupted — rebuilding from CRDT log");
      const { rebuildMerkleHash } = await import("./repair");
      const rebuilt = rebuildMerkleHash();
      getClock().merkle = rebuilt.trie;
      await saveClock();
      // Re-check with rebuilt merkle
      const newDiff = merkle.diff(serverMerkle as any, getClock().merkle);
      if (newDiff === null) {
        if (__DEV__) console.log("[fullSync] merkle repaired — trees now match");
        return receivedMessages;
      }
    }

    // Retry — upstream retries up to 10× for same diffTime, 100× total
    if ((count >= 10 && diffTime === prevDiffTime) || count >= 100) {
      throw new SyncError("out-of-sync");
    }

    // Recurse with diff time as since (upstream line 795-805)
    const retryMessages = await _fullSync(
      new Timestamp(diffTime, 0, "0").toString(),
      localTimeChanged ? 0 : count + 1,
      diffTime,
      gen,
      prefs,
      useSyncStore,
    );

    return receivedMessages.concat(retryMessages);
  }

  // Merkle converged — save timestamp (upstream line 807-816)
  // Only save when fully synced, NOT during retries
  const requiresUpdate = getClock().timestamp.toString() !== prefs.lastSyncedTimestamp;
  if (requiresUpdate) {
    const syncTimestamp = getClock().timestamp.toString();
    prefs.setPrefs({ lastSyncedTimestamp: syncTimestamp });

    const activeBudgetId = prefs.activeBudgetId;
    if (activeBudgetId) {
      import("../services/budgetMetadata").then(({ updateMetadata }) =>
        updateMetadata(activeBudgetId, { lastSyncedTimestamp: syncTimestamp }).catch(() => {}),
      );
    }
  }

  return receivedMessages;
}

/**
 * Public fullSync — wraps _fullSync with setup, teardown, and post-sync work.
 * Matches upstream fullSync() wrapper (lines 573-647).
 *
 * Uses once() pattern: if a sync is already running, returns the existing
 * promise instead of starting a concurrent one. Prevents overlapping syncs
 * from 60s polling, scheduleFullSync, and foreground triggers.
 */
let _activeSyncPromise: Promise<void> | null = null;

export function fullSync(): Promise<void> {
  // If sync is already running, return the existing promise (upstream once() pattern)
  if (_activeSyncPromise) return _activeSyncPromise;

  const p = (async () => {
    if (isSwitchingBudget()) return;

    const gen = getSyncGeneration();

    const { usePrefsStore } = await import("../stores/prefsStore");
    const { useSyncStore } = await import("../stores/syncStore");

    const prefs = usePrefsStore.getState();
    if (prefs.isLocalOnly) return;
    if (!prefs.isConfigured) {
      throw new Error("Server not configured — set serverUrl, token, fileId, groupId first");
    }

    useSyncStore.getState()._setStatus("syncing");
    emit({ type: "start", tables: [] });

    try {
      // Run the sync loop (may recurse on merkle divergence)
      const allMessages = await _fullSync(null, 0, null, gen, prefs, useSyncStore);

      if (gen !== getSyncGeneration()) return;

      // Post-sync: emit success, trigger budget changes, advance schedules
      // These only run ONCE after the full sync completes (not per retry)
      const tables = normalizeTables(allMessages.map((m) => m.dataset));
      emit({ type: "success", tables });

      if (allMessages.length > 0 && allMessages.some((m) => BUDGET_TABLES.has(m.dataset))) {
        const { triggerBudgetChanges } = await import("../spreadsheet/sync");
        triggerBudgetChanges(allMessages);
      }

      useSyncStore.getState()._setStatus("success");

      // Advance schedules after successful sync
      try {
        const { advanceSchedules } = await import("../schedules");
        await advanceSchedules(true);
      } catch (e) {
        if (__DEV__) console.warn("[fullSync] advanceSchedules failed:", e);
      }
    } catch (e: unknown) {
      if (gen !== getSyncGeneration()) return;

      if (e instanceof PostError && (e.type === "unauthorized" || e.type === "token-expired")) {
        emit({ type: "error", tables: [], subtype: "unauthorized" });
        const { closeBudget } = await import("../services/budgetfiles");
        await closeBudget().catch(() => {});
        usePrefsStore.getState().clearAll();
        return;
      }

      if (e instanceof SyncError && (e.meta as { isMissingKey?: boolean })?.isMissingKey) {
        emit({ type: "error", tables: [], subtype: "decrypt-failure" });
        useSyncStore.getState()._setError(toAppError(e));
        return;
      }

      if (e instanceof SyncError && e.type === "clock-drift") {
        emit({ type: "error", tables: [], subtype: "clock-drift" });
        useSyncStore.getState()._setError(toAppError(e));
        return;
      }

      if (e instanceof SyncError && e.type === "out-of-sync") {
        emit({ type: "error", tables: [], subtype: "out-of-sync" });
        useSyncStore.getState()._setError(toAppError(e));
        return;
      }

      if (e instanceof PostError && e.type === "network-failure") {
        emit({ type: "error", tables: [], subtype: "network" });
        useSyncStore.getState()._setStatus("idle");
        return;
      }

      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("closed resource") || msg.includes("not initialized")) {
        useSyncStore.getState()._setStatus("idle");
        return;
      }

      emit({ type: "error", tables: [], subtype: "unknown" });
      useSyncStore.getState()._setError(toAppError(e));
      throw e;
    }
  })().finally(() => {
    _activeSyncPromise = null;
    setActiveSyncPromise(null);
  });

  _activeSyncPromise = p;
  setActiveSyncPromise(p);
  return p;
}
