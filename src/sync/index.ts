/**
 * CRDT sync engine for actual-expo — barrel re-exports.
 *
 * All existing imports from '../sync' continue to work.
 * Implementation split into focused modules:
 *   - values.ts:     serializeValue / deserializeValue
 *   - clock.ts:      loadClock / saveClock
 *   - lifecycle.ts:  resetSyncState / clearSwitchingFlag / isSwitchingBudget / clearSyncTimeout
 *   - apply.ts:      applyMessages / getMessagesSince
 *   - batch.ts:      sendMessages / batchMessages
 *   - fullSync.ts:   fullSync
 *   - encoder.ts:    protobuf encode/decode
 *   - undo.ts:       undo system
 */

export { serializeValue, deserializeValue } from "./values";
export { loadClock, saveClock } from "./clock";
export { applyMessages, getMessagesSince } from "./apply";
export { sendMessages, batchMessages } from "./batch";
export { fullSync } from "./fullSync";
export {
  clearSyncTimeout,
  clearSwitchingFlag,
  isSwitchingBudget,
  waitForSyncToSettle,
} from "./lifecycle";
export { refreshAllRegisteredStores as refreshAllStores } from "../stores/storeRegistry";

// resetSyncState needs to reset batch state, so we wire the two modules together
import { resetBatchState } from "./batch";
import { resetSyncState as _resetSyncState } from "./lifecycle";

export function resetSyncState(): void {
  _resetSyncState(resetBatchState);
}
