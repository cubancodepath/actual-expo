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
import { postBinary } from "../post";
import { PostError, SyncError, toAppError } from "../errors";
import { applyMessages, getMessagesSince } from "./apply";
import { emit } from "./syncEvents";
import { getSyncGeneration, isSwitchingBudget, setActiveSyncPromise } from "./lifecycle";

/** Normalize table names for event emission (upstream pattern) */
function normalizeTables(datasets: string[]): string[] {
  return [...new Set(datasets.map((d) => (d === "schedules_next_date" ? "schedules" : d)))];
}

const BUDGET_TABLES = new Set(["zero_budgets", "zero_budget_months", "transactions"]);

async function _fullSync(
  attempt = 0,
  sinceDiffTime?: number,
  prevDiffTime?: number | null,
): Promise<void> {
  if (isSwitchingBudget()) return;

  const gen = getSyncGeneration();

  // Avoid circular import — import store lazily
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
    // On retry, use merkle diff time as since (upstream pattern).
    // Default to 5 minutes ago on first sync (not epoch — upstream pattern).
    const defaultSince = new Timestamp(Date.now() - 5 * 60 * 1000, 0, "0").toString();
    const sinceStr =
      sinceDiffTime != null
        ? new Timestamp(sinceDiffTime, 0, "0").toString()
        : (prefs.lastSyncedTimestamp ?? defaultSince);
    const since = Timestamp.since(sinceStr);

    const localMessages = await getMessagesSince(since);

    if (__DEV__) {
      console.log(`[fullSync] attempt ${attempt}, sending ${localMessages.length} local messages`);
    }

    if (gen !== getSyncGeneration()) return;

    // Record clock before network request to detect local changes during sync
    const clockBefore = getClock().timestamp.toString();

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

    // Critical guard: discard results if budget changed during network request
    if (gen !== getSyncGeneration()) {
      if (__DEV__) console.log("[fullSync] generation changed during network — discarding");
      return;
    }

    const { messages: serverMessages, merkle: serverMerkle } = await decode(
      responseBytes,
      prefs.encryptKeyId,
    );

    if (__DEV__) {
      console.log(`[fullSync] received ${serverMessages.length} messages from server`);
    }

    // Advance local clock with server timestamps (CRITICAL — maintains HLC invariants)
    // Upstream: receiveMessages() calls Timestamp.recv() for every message
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

    if (serverMessages.length > 0) {
      if (gen !== getSyncGeneration()) return;
      await applyMessages(serverMessages);

      // Recompute budget cells for server messages (upstream calls triggerBudgetChanges
      // inside applyMessages — we call it after, same effect)
      if (serverMessages.some((m) => BUDGET_TABLES.has(m.dataset))) {
        const { triggerBudgetChanges } = await import("../spreadsheet/sync");
        triggerBudgetChanges(serverMessages);
      }
    }

    if (gen !== getSyncGeneration()) return;

    // Always emit success with affected tables so liveQuery/pagedQuery re-run
    const tables = normalizeTables(serverMessages.map((m) => m.dataset));
    emit({ type: "success", tables });

    // Persist last synced timestamp using HLC clock (matches upstream behavior)
    const syncTimestamp = getClock().timestamp.toString();
    prefs.setPrefs({ lastSyncedTimestamp: syncTimestamp });

    // Also persist to budget's metadata.json for offline access
    const activeBudgetId = prefs.activeBudgetId;
    if (activeBudgetId) {
      import("../services/budgetMetadata").then(({ updateMetadata }) =>
        updateMetadata(activeBudgetId, { lastSyncedTimestamp: syncTimestamp }).catch(() => {}),
      );
    }

    // Check merkle divergence — retry until trees match (upstream pattern)
    const diffTime = merkle.diff(serverMerkle as any, getClock().merkle);
    if (diffTime !== null) {
      // Detect if local clock changed during sync (user made mutations) — reset counter
      const localTimeChanged = getClock().timestamp.toString() !== clockBefore;
      const nextAttempt = localTimeChanged ? 0 : attempt + 1;

      // Stop if stuck on same diff for 10+ attempts, or hard cap at 100
      if ((nextAttempt >= 10 && diffTime === prevDiffTime) || nextAttempt >= 100) {
        throw new SyncError("out-of-sync");
      }
      return fullSync(nextAttempt, diffTime, diffTime);
    }

    useSyncStore.getState()._setStatus("success");

    // Advance schedules after successful sync (auto-post due transactions)
    try {
      const { advanceSchedules } = await import("../schedules");
      await advanceSchedules(true);
    } catch (e) {
      if (__DEV__) console.warn("[fullSync] advanceSchedules failed:", e);
    }
  } catch (e: unknown) {
    if (gen !== getSyncGeneration()) return;

    // Auth error — clear everything and let router redirect to login
    if (e instanceof PostError && (e.type === "unauthorized" || e.type === "token-expired")) {
      emit({ type: "error", tables: [], subtype: "unauthorized" });
      const { closeBudget } = await import("../services/budgetfiles");
      await closeBudget().catch(() => {});
      usePrefsStore.getState().clearAll();
      return;
    }

    // Handle missing encryption key gracefully
    if (e instanceof SyncError && (e.meta as { isMissingKey?: boolean })?.isMissingKey) {
      emit({ type: "error", tables: [], subtype: "decrypt-failure" });
      useSyncStore.getState()._setError(toAppError(e));
      return;
    }

    // Clock drift
    if (e instanceof SyncError && e.type === "clock-drift") {
      emit({ type: "error", tables: [], subtype: "clock-drift" });
      useSyncStore.getState()._setError(toAppError(e));
      return;
    }

    // Out of sync
    if (e instanceof SyncError && e.type === "out-of-sync") {
      emit({ type: "error", tables: [], subtype: "out-of-sync" });
      useSyncStore.getState()._setError(toAppError(e));
      return;
    }

    // Network errors → silent (local-first: user keeps working, sync retries on foreground)
    if (e instanceof PostError && e.type === "network-failure") {
      emit({ type: "error", tables: [], subtype: "network" });
      useSyncStore.getState()._setStatus("idle");
      return;
    }

    const msg = e instanceof Error ? e.message : String(e);
    // Silently ignore errors from DB closing during budget switch
    if (msg.includes("closed resource") || msg.includes("not initialized")) {
      useSyncStore.getState()._setStatus("idle");
      return;
    }

    // Sync integrity errors → show to user
    emit({ type: "error", tables: [], subtype: "unknown" });
    useSyncStore.getState()._setError(toAppError(e));
    throw e;
  }
}

/**
 * Public wrapper that tracks the active sync promise so budget-switch
 * can wait for it to settle before closing the database.
 */
export function fullSync(
  attempt = 0,
  sinceDiffTime?: number,
  prevDiffTime?: number | null,
): Promise<void> {
  const p = _fullSync(attempt, sinceDiffTime, prevDiffTime).finally(() =>
    setActiveSyncPromise(null),
  );
  setActiveSyncPromise(p);
  return p;
}
