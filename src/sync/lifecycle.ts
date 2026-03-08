/**
 * Budget-switch lifecycle guards and sync scheduling state.
 *
 * The generation counter invalidates in-flight fullSync() calls when the
 * user switches budgets. scheduleFullSync timeout is also managed here.
 */

import { clearUndo } from './undo';

let _syncGeneration = 0;
let _switchingBudget = false;
let _syncTimeout: ReturnType<typeof setTimeout> | null = null;

export function getSyncGeneration(): number {
  return _syncGeneration;
}

export function isSwitchingBudget(): boolean {
  return _switchingBudget;
}

export function clearSwitchingFlag(): void {
  _switchingBudget = false;
}

export function clearSyncTimeout(): void {
  if (_syncTimeout) {
    clearTimeout(_syncTimeout);
    _syncTimeout = null;
  }
}

export function setSyncTimeout(timeout: ReturnType<typeof setTimeout>): void {
  _syncTimeout = timeout;
}

export function getSyncTimeout(): ReturnType<typeof setTimeout> | null {
  return _syncTimeout;
}

/**
 * Reset all module-level sync state. Call during budget switch or disconnect
 * BEFORE opening a new database. Increments the generation counter so any
 * in-flight fullSync() silently discards its results.
 */
export function resetSyncState(resetBatchState: () => void): void {
  _syncGeneration++;
  clearSyncTimeout();
  clearUndo();
  resetBatchState();
  _switchingBudget = true;
}
