/**
 * Full sync protocol — syncs local CRDT messages with the Actual Budget server.
 *
 * Encodes local messages → POST /sync/sync → decodes response → applies
 * server messages → checks Merkle divergence → retries if needed.
 *
 * Aligned with upstream Actual Budget (loot-core/src/server/sync/index.ts).
 */

import { getClock, merkle, Timestamp } from "@/core/crdt";
import { encode, decode } from "./encoder";
import type { SyncMessage } from "./encoder";
import { postBinary } from "@/core/post";
import { ActualError, SyncError, toAppError } from "@/core/errors";
import { applyMessages, getMessagesSince } from "./apply";
import { emit } from "./syncEvents";
import { getSyncGeneration, isSwitchingBudget, setActiveSyncPromise } from "./lifecycle";
import { checkSyncingMode, setSyncingMode } from "./syncMode";

/** Normalize table names for event emission (upstream pattern) */
function normalizeTables(datasets: string[]): string[] {
  return [...new Set(datasets.map((d) => (d === "schedules_next_date" ? "schedules" : d)))];
}

// Set when a sync fails with decrypt-failure, so the *next* attempt can
// proactively check whether the key actually changed server-side (a peer
// rotated it) before retrying — turns a recurring cryptic decrypt error
// into a clear "re-enter your password" prompt. Cleared on any successful
// sync. Deliberately not checked on every sync (that would add a network
// round-trip to the hot path) — only after a real decrypt failure.
let _lastSyncHadDecryptFailure = false;

const BUDGET_TABLES = new Set([
  "zero_budgets",
  "reflect_budgets",
  "zero_budget_months",
  "transactions",
  "accounts",
  "category_mapping",
  "preferences", // watched for the budgetType row — see triggerBudgetChanges
]);

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
  force?: boolean,
): Promise<SyncMessage[]> {
  if (!force && isSwitchingBudget()) return [];
  if (gen !== getSyncGeneration()) return [];

  // Snapshot local clock before network request (upstream pattern)
  const currentTime = getClock().timestamp.toString();

  // Match upstream exactly (sync/index.ts line 674-678):
  // sinceTimestamp (from retry) || lastSyncedTimestamp || 5-minutes-ago
  // Do NOT wrap in Timestamp.since() — that adds a second counter+node suffix
  // to strings that already have one from Timestamp.toString().
  const since =
    sinceTimestamp ||
    prefs.lastSyncedTimestamp ||
    new Timestamp(Date.now() - 5 * 60 * 1000, 0, "0").toString();

  const localMessages = await getMessagesSince(since);

  if (__DEV__) {
    console.log(
      `[fullSync] attempt ${count}, since=${since.slice(0, 23)}, sending ${localMessages.length} local messages`,
    );
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
    await applyMessages(serverMessages);
    receivedMessages = serverMessages;
  }

  // Check merkle divergence (upstream pattern: lines 728-806)
  const diffTime = merkle.diff(serverMerkle as any, getClock().merkle);

  if (diffTime !== null) {
    // No mid-loop merkle rebuild here — upstream never repairs automatically
    // mid-sync; it only rebuilds at the retry-cap for diagnostic logging.
    // An automatic rebuild here can silently paper over genuine corruption
    // instead of surfacing it. Repair is available as an explicit,
    // user-triggered action (see repairSync() in ./repair).

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
      force,
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
      import("@/services/budgetMetadata").then(({ updateMetadata }) =>
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
let _activeSyncPromise: Promise<number> | null = null;

/** Called by resetSyncState to cancel the once() guard for budget switches. */
export function clearActiveSyncPromise(): void {
  _activeSyncPromise = null;
}

export function fullSync(opts?: { force?: boolean }): Promise<number> {
  // If sync is already running, return the existing promise (upstream once() pattern)
  if (_activeSyncPromise) return _activeSyncPromise;

  const force = opts?.force ?? false;

  const p = (async (): Promise<number> => {
    if (!force && isSwitchingBudget()) return 0;
    // Upstream sync/index.ts:687-691 — disabled/offline modes skip syncing
    // entirely, except when explicitly forced (e.g. a manual retry).
    if (!force && (checkSyncingMode("disabled") || checkSyncingMode("offline"))) return 0;

    const gen = getSyncGeneration();

    const { usePrefsStore } = await import("@/stores/prefsStore");
    const { useSyncStore } = await import("@/stores/syncStore");

    const prefs = usePrefsStore.getState();
    if (prefs.isLocalOnly) return 0;
    if (!force && !prefs.isConfigured) {
      throw new Error("Server not configured — set serverUrl, token, fileId, groupId first");
    }

    // Proactively verify the key after a prior decrypt-failure — see
    // _lastSyncHadDecryptFailure's comment.
    if (_lastSyncHadDecryptFailure && prefs.encryptKeyId && prefs.fileId) {
      const { checkKey } = await import("@/services/encryptionService");
      const result = await checkKey({
        serverUrl: prefs.serverUrl,
        token: prefs.token,
        cloudFileId: prefs.fileId,
        encryptKeyId: prefs.encryptKeyId,
      });
      if (!result.valid && result.error.reason === "key-mismatch") {
        emit({ type: "error", tables: [], subtype: "decrypt-failure" });
        useSyncStore
          .getState()
          ._setError(
            toAppError(new SyncError("decrypt-failure", { isMissingKey: true, keyRotated: true })),
          );
        return 0;
      }
      // Either confirmed valid, or the check itself failed (e.g. network) —
      // don't block the sync attempt on checkKey's own failure, just retry
      // normally and let the real sync surface whatever actually happens.
      _lastSyncHadDecryptFailure = false;
    }

    useSyncStore.getState()._setStatus("syncing");
    emit({ type: "start", tables: [] });

    try {
      // Run the sync loop (may recurse on merkle divergence)
      const allMessages = await _fullSync(null, 0, null, gen, prefs, useSyncStore, force);

      if (gen !== getSyncGeneration()) return 0;

      // Post-sync: emit success, trigger budget changes, advance schedules
      // These only run ONCE after the full sync completes (not per retry)
      const tables = normalizeTables(allMessages.map((m) => m.dataset));
      emit({ type: "success", tables });

      if (allMessages.length > 0 && allMessages.some((m) => BUDGET_TABLES.has(m.dataset))) {
        const { triggerBudgetChanges } = await import("@/core/domain/spreadsheet/sync");
        triggerBudgetChanges(allMessages);
      }

      useSyncStore.getState()._setStatus("success");
      setSyncingMode("enabled"); // clears any prior "offline" from a network failure
      _lastSyncHadDecryptFailure = false;

      // Advance schedules after successful sync
      try {
        const { advanceSchedules } = await import("@/core/domain/schedules");
        await advanceSchedules(true);
      } catch (e) {
        if (__DEV__) console.warn("[fullSync] advanceSchedules failed:", e);
      }

      return allMessages.length;
    } catch (e: unknown) {
      if (gen !== getSyncGeneration()) return 0;

      if (e instanceof ActualError && e.code === "auth/token-expired") {
        emit({ type: "error", tables: [], subtype: "unauthorized" });
        const { closeBudget } = await import("@/services/budgetfiles");
        await closeBudget().catch(() => {});
        usePrefsStore.getState().clearAll();
        return 0;
      }

      if (e instanceof SyncError && (e.meta as { isMissingKey?: boolean })?.isMissingKey) {
        emit({ type: "error", tables: [], subtype: "decrypt-failure" });
        useSyncStore.getState()._setError(toAppError(e));
        _lastSyncHadDecryptFailure = true;
        return 0;
      }

      if (e instanceof SyncError && e.type === "clock-drift") {
        emit({ type: "error", tables: [], subtype: "clock-drift" });
        useSyncStore.getState()._setError(toAppError(e));
        return 0;
      }

      if (e instanceof SyncError && e.type === "out-of-sync") {
        emit({ type: "error", tables: [], subtype: "out-of-sync" });
        useSyncStore.getState()._setError(toAppError(e));
        return 0;
      }

      if (e instanceof ActualError && e.code === "network/offline") {
        emit({ type: "error", tables: [], subtype: "network" });
        useSyncStore.getState()._setStatus("idle");
        // Pause scheduled syncs until the next foreground/manual retry
        // (app/_layout.tsx resets this back to "enabled" on foreground) —
        // avoids hammering scheduleFullSync's 1s-debounced retry on every
        // local mutation while there's no connectivity.
        setSyncingMode("offline");
        return 0;
      }

      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("closed resource") || msg.includes("not initialized")) {
        useSyncStore.getState()._setStatus("idle");
        return 0;
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
