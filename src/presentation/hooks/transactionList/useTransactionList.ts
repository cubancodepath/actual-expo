import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  deleteTransaction,
  duplicateTransaction,
  toggleCleared,
  updateTransaction,
  setClearedBulk,
  type TransactionDisplay,
} from '../../../transactions';
import { batchMessages } from '../../../sync';
import { undoable } from '../../../sync/undo';
import { useUndoStore } from '../../../stores/undoStore';
import { usePickerStore } from '../../../stores/pickerStore';
import { useRefreshControl } from '../useRefreshControl';
import { buildListData, type ListItem } from './types';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface UseTransactionListOptions {
  fetchTransactions: (limit: number, offset: number) => Promise<TransactionDisplay[]>;
  /** 'remap' keeps txn in list with new account (spending), 'remove' filters it out (account) */
  moveMode: 'remap' | 'remove';
  pageSize?: number;
  /** Called after a single txn is deleted — receives the deleted txn for screen-specific side effects */
  onDelete?: (txn: TransactionDisplay) => void;
  /** Called after a single txn is duplicated — receives the clone for screen-specific side effects */
  onDuplicate?: (clone: TransactionDisplay) => void;
  onToggleCleared?: (txn: TransactionDisplay) => void;
  onBulkToggleCleared?: (ids: Set<string>, targetVal: boolean, txns: TransactionDisplay[]) => void;
  optimisticBulkMove?: (
    prev: TransactionDisplay[],
    ids: Set<string>,
    targetAccountId: string,
    targetAccountName?: string,
  ) => TransactionDisplay[];
  onEnterSelectMode?: () => void;
  onExitSelectMode?: () => void;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

type State = {
  transactions: TransactionDisplay[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  selectedIds: Set<string>;
  isSelectMode: boolean;
};

type Action =
  | { type: 'SET_DATA'; transactions: TransactionDisplay[]; hasMore: boolean }
  | { type: 'APPEND_DATA'; transactions: TransactionDisplay[]; hasMore: boolean }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_LOADING_MORE'; loadingMore: boolean }
  | { type: 'REMOVE'; txnId: string }
  | { type: 'UPDATE'; txnId: string; fields: Partial<TransactionDisplay> }
  | { type: 'INSERT_AFTER'; txnId: string; newTxn: TransactionDisplay }
  | { type: 'RESTORE'; txn: TransactionDisplay; index: number }
  | { type: 'BULK_REMOVE'; ids: Set<string> }
  | { type: 'BULK_UPDATE'; ids: Set<string>; fields: Partial<TransactionDisplay> }
  | { type: 'BULK_RESTORE'; items: Array<{ txn: TransactionDisplay; index: number }> }
  | { type: 'TOGGLE_SELECT'; txnId: string }
  | { type: 'SELECT_ALL' }
  | { type: 'ENTER_SELECT_MODE' }
  | { type: 'EXIT_SELECT_MODE' };

const EMPTY_SET = new Set<string>();

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_DATA':
      return { ...state, transactions: action.transactions, hasMore: action.hasMore, loading: false };
    case 'APPEND_DATA':
      return { ...state, transactions: [...state.transactions, ...action.transactions], hasMore: action.hasMore, loadingMore: false };
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'SET_LOADING_MORE':
      return { ...state, loadingMore: action.loadingMore };
    case 'REMOVE':
      return { ...state, transactions: state.transactions.filter(t => t.id !== action.txnId) };
    case 'UPDATE':
      return {
        ...state,
        transactions: state.transactions.map(t =>
          t.id === action.txnId ? { ...t, ...action.fields } : t,
        ),
      };
    case 'INSERT_AFTER': {
      const idx = state.transactions.findIndex(t => t.id === action.txnId);
      const next = [...state.transactions];
      next.splice(idx + 1, 0, action.newTxn);
      return { ...state, transactions: next };
    }
    case 'RESTORE': {
      if (state.transactions.some(t => t.id === action.txn.id)) return state;
      const next = [...state.transactions];
      next.splice(Math.min(action.index, next.length), 0, action.txn);
      return { ...state, transactions: next };
    }
    case 'BULK_REMOVE':
      return { ...state, transactions: state.transactions.filter(t => !action.ids.has(t.id)) };
    case 'BULK_UPDATE':
      return {
        ...state,
        transactions: state.transactions.map(t =>
          action.ids.has(t.id) ? { ...t, ...action.fields } : t,
        ),
      };
    case 'BULK_RESTORE': {
      const existingIds = new Set(state.transactions.map(t => t.id));
      const toRestore = action.items.filter(d => !existingIds.has(d.txn.id));
      if (toRestore.length === 0) return state;
      const next = [...state.transactions];
      for (let i = toRestore.length - 1; i >= 0; i--) {
        next.splice(Math.min(toRestore[i].index, next.length), 0, toRestore[i].txn);
      }
      return { ...state, transactions: next };
    }
    case 'TOGGLE_SELECT': {
      const next = new Set(state.selectedIds);
      if (next.has(action.txnId)) next.delete(action.txnId);
      else next.add(action.txnId);
      return { ...state, isSelectMode: true, selectedIds: next };
    }
    case 'SELECT_ALL': {
      const allIds = new Set(state.transactions.filter(t => !t.reconciled).map(t => t.id));
      return { ...state, selectedIds: allIds };
    }
    case 'ENTER_SELECT_MODE':
      return { ...state, isSelectMode: true };
    case 'EXIT_SELECT_MODE':
      return { ...state, isSelectMode: false, selectedIds: EMPTY_SET };
    default:
      return state;
  }
}

const DEFAULT_PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTransactionList({
  fetchTransactions,
  moveMode,
  pageSize = DEFAULT_PAGE_SIZE,
  onDelete: onDeleteCb,
  onDuplicate: onDuplicateCb,
  onToggleCleared: onToggleClearedCb,
  onBulkToggleCleared: onBulkToggleClearedCb,
  optimisticBulkMove: optimisticBulkMoveFn,
  onEnterSelectMode: onEnterCb,
  onExitSelectMode: onExitCb,
}: UseTransactionListOptions) {
  const router = useRouter();

  const [state, dispatch] = useReducer(reducer, {
    transactions: [],
    loading: true,
    loadingMore: false,
    hasMore: true,
    selectedIds: EMPTY_SET,
    isSelectMode: false,
  });

  // Refs for latest values (avoid stale closures in Alert callbacks)
  const stateRef = useRef(state);
  stateRef.current = state;
  const fetchRef = useRef(fetchTransactions);
  fetchRef.current = fetchTransactions;
  const onDeleteRef = useRef(onDeleteCb);
  onDeleteRef.current = onDeleteCb;
  const onDuplicateRef = useRef(onDuplicateCb);
  onDuplicateRef.current = onDuplicateCb;
  const onToggleClearedRef = useRef(onToggleClearedCb);
  onToggleClearedRef.current = onToggleClearedCb;
  const onBulkToggleClearedRef = useRef(onBulkToggleClearedCb);
  onBulkToggleClearedRef.current = onBulkToggleClearedCb;
  const optimisticBulkMoveRef = useRef(optimisticBulkMoveFn);
  optimisticBulkMoveRef.current = optimisticBulkMoveFn;
  const onEnterRef = useRef(onEnterCb);
  onEnterRef.current = onEnterCb;
  const onExitRef = useRef(onExitCb);
  onExitRef.current = onExitCb;

  // Pagination refs
  const offsetRef = useRef(0);
  const refreshIdRef = useRef(0);
  const skipNextRefreshRef = useRef(false);
  const hasLoaded = useRef(false);

  // Undo refs
  const lastDeletedRef = useRef<{ txn: TransactionDisplay; index: number } | null>(null);
  const lastBulkDeletedRef = useRef<Array<{ txn: TransactionDisplay; index: number }>>([]);

  // Picker refs
  const pendingMoveRef = useRef<string | null>(null);
  const pendingCategoryRef = useRef<string | null>(null);
  const bulkMovePendingRef = useRef(false);
  const bulkCategoryPendingRef = useRef(false);

  // Picker store subscriptions
  const selectedAccount = usePickerStore((s) => s.selectedAccount);
  const selectedCategory = usePickerStore((s) => s.selectedCategory);
  const clearPicker = usePickerStore((s) => s.clear);

  // ---- Derived state ----

  const selectedTransactions = useMemo(
    () => state.transactions.filter(t => state.selectedIds.has(t.id)),
    [state.selectedIds, state.transactions],
  );

  const allCleared = useMemo(() => {
    const nonReconciled = selectedTransactions.filter(t => !t.reconciled);
    return nonReconciled.length > 0 && nonReconciled.every(t => t.cleared);
  }, [selectedTransactions]);

  const selectedTotal = useMemo(
    () => selectedTransactions.reduce((sum, t) => sum + t.amount, 0),
    [selectedTransactions],
  );

  const listData: ListItem[] = useMemo(
    () => buildListData(state.transactions),
    [state.transactions],
  );

  // ---- Pagination ----

  const loadAll = useCallback(async () => {
    const id = ++refreshIdRef.current;
    dispatch({ type: 'SET_LOADING', loading: true });
    offsetRef.current = 0;
    const txns = await fetchRef.current(pageSize, 0);
    if (refreshIdRef.current !== id) return;
    dispatch({ type: 'SET_DATA', transactions: txns, hasMore: txns.length === pageSize });
    offsetRef.current = txns.length;
  }, [pageSize]);

  const silentRefresh = useCallback(async () => {
    if (skipNextRefreshRef.current) {
      skipNextRefreshRef.current = false;
      return;
    }
    const id = ++refreshIdRef.current;
    const count = Math.max(offsetRef.current, pageSize);
    const txns = await fetchRef.current(count, 0);
    if (refreshIdRef.current !== id) return;
    dispatch({ type: 'SET_DATA', transactions: txns, hasMore: txns.length === count });
    offsetRef.current = txns.length;
  }, [pageSize]);

  const loadMore = useCallback(async () => {
    if (stateRef.current.loading || stateRef.current.loadingMore || !stateRef.current.hasMore) return;
    dispatch({ type: 'SET_LOADING_MORE', loadingMore: true });
    const txns = await fetchRef.current(pageSize, offsetRef.current);
    if (txns.length === 0) {
      dispatch({ type: 'SET_LOADING_MORE', loadingMore: false });
      return;
    }
    dispatch({ type: 'APPEND_DATA', transactions: txns, hasMore: txns.length === pageSize });
    offsetRef.current += txns.length;
  }, [pageSize]);

  const { refreshControlProps } = useRefreshControl({
    onRefresh: async () => {
      const id = ++refreshIdRef.current;
      const count = Math.max(offsetRef.current, pageSize);
      const txns = await fetchRef.current(count, 0);
      if (refreshIdRef.current !== id) return;
      dispatch({ type: 'SET_DATA', transactions: txns, hasMore: txns.length === count });
      offsetRef.current = txns.length;
    },
  });

  // ---- Selection ----

  const handleLongPress = useCallback((txnId: string) => {
    if (!stateRef.current.isSelectMode) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onEnterRef.current?.();
    }
    dispatch({ type: 'TOGGLE_SELECT', txnId });
  }, []);

  const enterSelectMode = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dispatch({ type: 'ENTER_SELECT_MODE' });
    onEnterRef.current?.();
  }, []);

  const handleSelectAll = useCallback(() => {
    dispatch({ type: 'SELECT_ALL' });
  }, []);

  const handleDoneSelection = useCallback(() => {
    dispatch({ type: 'EXIT_SELECT_MODE' });
    onExitRef.current?.();
  }, []);

  const resetSelection = useCallback(() => {
    dispatch({ type: 'EXIT_SELECT_MODE' });
    onExitRef.current?.();
  }, []);

  // ---- Single-item actions ----

  function handleEditTransaction(txnId: string) {
    router.push({ pathname: '/(auth)/transaction/new', params: { transactionId: txnId } });
  }

  function handleDelete(txnId: string) {
    Alert.alert('Delete Transaction', 'Delete this transaction?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          refreshIdRef.current++;
          const txns = stateRef.current.transactions;
          const idx = txns.findIndex(t => t.id === txnId);
          const txn = idx >= 0 ? txns[idx] : undefined;
          if (txn && idx >= 0) {
            lastDeletedRef.current = { txn, index: idx };
            onDeleteRef.current?.(txn);
          }
          dispatch({ type: 'REMOVE', txnId });
          await deleteTransaction(txnId);
          queueMicrotask(() => useUndoStore.getState().showUndo('Transaction deleted'));
        },
      },
    ]);
  }

  function handleToggleCleared(txnId: string) {
    refreshIdRef.current++;
    const txn = stateRef.current.transactions.find(t => t.id === txnId);
    if (txn) {
      onToggleClearedRef.current?.(txn);
      dispatch({ type: 'UPDATE', txnId, fields: { cleared: !txn.cleared } });
    }
    toggleCleared(txnId);
  }

  async function handleDuplicate(txnId: string) {
    refreshIdRef.current++;
    const original = stateRef.current.transactions.find(t => t.id === txnId);
    if (!original) return;
    const newId = await duplicateTransaction(txnId);
    if (newId) {
      const clone: TransactionDisplay = { ...original, id: newId, cleared: false, reconciled: false };
      dispatch({ type: 'INSERT_AFTER', txnId, newTxn: clone });
      onDuplicateRef.current?.(clone);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }

  function handleMove(txnId: string) {
    pendingMoveRef.current = txnId;
    skipNextRefreshRef.current = true;
    router.push({ pathname: '/(auth)/transaction/account-picker', params: { selectedId: '' } });
  }

  function handleSetCategory(txnId: string) {
    pendingCategoryRef.current = txnId;
    skipNextRefreshRef.current = true;
    router.push({ pathname: '/(auth)/transaction/category-picker', params: { hideSplit: '1' } });
  }

  function handleAddTag(txnId: string) {
    router.push({ pathname: '/(auth)/transaction/tags', params: { transactionId: txnId, mode: 'direct' } });
  }

  // ---- Bulk actions ----

  const handleBulkDelete = useCallback(() => {
    const count = stateRef.current.selectedIds.size;
    Alert.alert('Delete Transactions', `Delete ${count} transaction${count === 1 ? '' : 's'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          refreshIdRef.current++;
          const ids = new Set(stateRef.current.selectedIds);
          const snapshot: Array<{ txn: TransactionDisplay; index: number }> = [];
          stateRef.current.transactions.forEach((t, i) => {
            if (ids.has(t.id)) snapshot.push({ txn: t, index: i });
          });
          lastBulkDeletedRef.current = snapshot;
          dispatch({ type: 'BULK_REMOVE', ids });
          dispatch({ type: 'EXIT_SELECT_MODE' });
          onExitRef.current?.();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await undoable(async () => {
            await batchMessages(async () => {
              for (const txnId of ids) await deleteTransaction(txnId);
            });
          })();
          queueMicrotask(() =>
            useUndoStore.getState().showUndo(`${ids.size} transaction${ids.size === 1 ? '' : 's'} deleted`),
          );
        },
      },
    ]);
  }, []);

  const handleBulkMove = useCallback((targetAccountId: string, targetAccountName?: string) => {
    const count = stateRef.current.selectedIds.size;
    Alert.alert('Move Transactions', `Move ${count} transaction${count === 1 ? '' : 's'} to ${targetAccountName ?? 'account'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Move',
        onPress: async () => {
          refreshIdRef.current++;
          const ids = new Set(stateRef.current.selectedIds);
          if (optimisticBulkMoveRef.current) {
            const updated = optimisticBulkMoveRef.current(stateRef.current.transactions, ids, targetAccountId, targetAccountName);
            dispatch({ type: 'SET_DATA', transactions: updated, hasMore: stateRef.current.hasMore });
          } else {
            dispatch({ type: 'BULK_REMOVE', ids });
          }
          dispatch({ type: 'EXIT_SELECT_MODE' });
          onExitRef.current?.();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await undoable(async () => {
            await batchMessages(async () => {
              for (const txnId of ids) await updateTransaction(txnId, { acct: targetAccountId });
            });
          })();
        },
      },
    ]);
  }, []);

  const handleBulkToggleCleared = useCallback(async () => {
    const selected = stateRef.current.transactions.filter(
      t => stateRef.current.selectedIds.has(t.id) && !t.reconciled,
    );
    if (selected.length === 0) return;

    refreshIdRef.current++;
    const anyUncleared = selected.some(t => !t.cleared);
    const ids = new Set(selected.map(t => t.id));

    dispatch({ type: 'BULK_UPDATE', ids, fields: { cleared: anyUncleared } });
    onBulkToggleClearedRef.current?.(ids, anyUncleared, selected);
    dispatch({ type: 'EXIT_SELECT_MODE' });
    onExitRef.current?.();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    await setClearedBulk(selected.map(t => t.id), anyUncleared);
  }, []);

  const handleBulkChangeCategory = useCallback(async (categoryId: string | null) => {
    const ids = new Set(stateRef.current.selectedIds);
    if (ids.size === 0) return;

    refreshIdRef.current++;
    dispatch({ type: 'BULK_UPDATE', ids, fields: { category: categoryId } });
    dispatch({ type: 'EXIT_SELECT_MODE' });
    onExitRef.current?.();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    await undoable(async () => {
      await batchMessages(async () => {
        for (const txnId of ids) await updateTransaction(txnId, { category: categoryId });
      });
    })();
  }, []);

  // ---- Picker effects (unified: single + bulk) ----

  useEffect(() => {
    if (!selectedAccount) return;

    if (pendingMoveRef.current) {
      const txnId = pendingMoveRef.current;
      pendingMoveRef.current = null;
      refreshIdRef.current++;
      if (moveMode === 'remove') {
        dispatch({ type: 'REMOVE', txnId });
      } else {
        dispatch({ type: 'UPDATE', txnId, fields: { acct: selectedAccount.id, accountName: selectedAccount.name } });
      }
      updateTransaction(txnId, { acct: selectedAccount.id });
      clearPicker();
    } else if (bulkMovePendingRef.current) {
      bulkMovePendingRef.current = false;
      handleBulkMove(selectedAccount.id, selectedAccount.name);
      clearPicker();
    }
  }, [selectedAccount, moveMode, clearPicker, handleBulkMove]);

  useEffect(() => {
    if (!selectedCategory) return;

    if (pendingCategoryRef.current) {
      const txnId = pendingCategoryRef.current;
      pendingCategoryRef.current = null;
      refreshIdRef.current++;
      dispatch({ type: 'UPDATE', txnId, fields: { category: selectedCategory.id } });
      updateTransaction(txnId, { category: selectedCategory.id });
      clearPicker();
    } else if (bulkCategoryPendingRef.current) {
      bulkCategoryPendingRef.current = false;
      handleBulkChangeCategory(selectedCategory.id);
      clearPicker();
    }
  }, [selectedCategory, clearPicker, handleBulkChangeCategory]);

  // ---- Picker triggers ----

  const triggerAccountPicker = useCallback(() => {
    bulkMovePendingRef.current = true;
    skipNextRefreshRef.current = true;
    router.push({ pathname: '/(auth)/transaction/account-picker', params: { selectedId: '' } });
  }, [router]);

  const triggerCategoryPicker = useCallback(() => {
    bulkCategoryPendingRef.current = true;
    skipNextRefreshRef.current = true;
    router.push({ pathname: '/(auth)/transaction/category-picker', params: { hideSplit: '1' } });
  }, [router]);

  // ---- Undo restore ----

  const restoreDeleted = useCallback(() => {
    const deleted = lastDeletedRef.current;
    if (!deleted) return;
    lastDeletedRef.current = null;
    dispatch({ type: 'RESTORE', txn: deleted.txn, index: deleted.index });
  }, []);

  const restoreBulkDeleted = useCallback(() => {
    const deleted = lastBulkDeletedRef.current;
    if (deleted.length === 0) return;
    lastBulkDeletedRef.current = [];
    dispatch({ type: 'BULK_RESTORE', items: deleted });
  }, []);

  return {
    // State
    transactions: state.transactions,
    listData,
    loading: state.loading,
    loadingMore: state.loadingMore,
    selectedIds: state.selectedIds,
    isSelectMode: state.isSelectMode,
    allCleared,
    selectedTotal,

    // Pagination
    loadAll,
    silentRefresh,
    loadMore,
    hasLoaded,
    refreshControlProps,

    // Single actions
    handleEditTransaction,
    handleDelete,
    handleToggleCleared,
    handleDuplicate,
    handleMove,
    handleSetCategory,
    handleAddTag,

    // Bulk actions
    handleBulkDelete,
    handleBulkToggleCleared,
    triggerCategoryPicker,
    triggerAccountPicker,

    // Selection
    handleLongPress,
    enterSelectMode,
    handleSelectAll,
    handleDoneSelection,
    resetSelection,

    // Undo
    restoreDeleted,
    restoreBulkDeleted,
  };
}
