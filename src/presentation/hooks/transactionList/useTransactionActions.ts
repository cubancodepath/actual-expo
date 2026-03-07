import { useCallback, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  deleteTransaction,
  duplicateTransaction,
  toggleCleared,
  updateTransaction,
  type TransactionDisplay,
} from '../../../transactions';
import { useUndoStore } from '../../../stores/undoStore';
import { usePickerStore } from '../../../stores/pickerStore';

interface UseTransactionActionsOptions {
  transactions: TransactionDisplay[];
  setTransactions: React.Dispatch<React.SetStateAction<TransactionDisplay[]>>;
  refreshIdRef: React.MutableRefObject<number>;
  /** Set before navigating to a picker to prevent silentRefresh from overwriting optimistic updates */
  skipNextRefreshRef?: React.MutableRefObject<boolean>;
  loadAccounts: () => void;
  setUnclearedCount: React.Dispatch<React.SetStateAction<number>>;
  /** Called during toggleCleared for screen-specific side effects (e.g. clearedBalance) */
  onToggleCleared?: (txn: TransactionDisplay) => void;
  /** 'remap' keeps txn in list with new account (spending), 'remove' filters it out (account) */
  moveMode: 'remap' | 'remove';
  accounts: Array<{ id: string; name: string }>;
}

export function useTransactionActions({
  transactions,
  setTransactions,
  refreshIdRef,
  skipNextRefreshRef,
  loadAccounts,
  setUnclearedCount,
  onToggleCleared: onToggleClearedCb,
  moveMode,
  accounts,
}: UseTransactionActionsOptions) {
  const router = useRouter();

  // Refs to avoid stale closures in Alert callbacks
  const transactionsRef = useRef(transactions);
  transactionsRef.current = transactions;
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;
  const onToggleClearedRef = useRef(onToggleClearedCb);
  onToggleClearedRef.current = onToggleClearedCb;
  const loadAccountsRef = useRef(loadAccounts);
  loadAccountsRef.current = loadAccounts;

  // Track last deleted item so undo can restore it optimistically
  const lastDeletedRef = useRef<{ txn: TransactionDisplay; index: number } | null>(null);

  // Track pending move transaction id for account picker flow
  const pendingMoveRef = useRef<string | null>(null);
  const selectedAccount = usePickerStore((s) => s.selectedAccount);
  const clearPicker = usePickerStore((s) => s.clear);
  const moveModeRef = useRef(moveMode);
  moveModeRef.current = moveMode;

  useEffect(() => {
    if (selectedAccount && pendingMoveRef.current) {
      const txnId = pendingMoveRef.current;
      pendingMoveRef.current = null;
      const targetAccountId = selectedAccount.id;
      const targetName = selectedAccount.name;
      clearPicker();

      refreshIdRef.current++;
      if (moveModeRef.current === 'remap') {
        setTransactions(prev => prev.map(t =>
          t.id === txnId ? { ...t, acct: targetAccountId, accountName: targetName } : t
        ));
      } else {
        setTransactions(prev => prev.filter(t => t.id !== txnId));
      }
      updateTransaction(txnId, { acct: targetAccountId }).then(() => {
        loadAccountsRef.current();
      });
    }
  }, [selectedAccount, clearPicker, refreshIdRef, setTransactions]);

  // Track pending categorize transaction id for category picker flow
  const pendingCategoryRef = useRef<string | null>(null);
  const selectedCategory = usePickerStore((s) => s.selectedCategory);

  useEffect(() => {
    if (selectedCategory && pendingCategoryRef.current) {
      const txnId = pendingCategoryRef.current;
      pendingCategoryRef.current = null;
      const categoryId = selectedCategory.id;
      clearPicker();

      refreshIdRef.current++;
      setTransactions(prev => prev.map(t =>
        t.id === txnId ? { ...t, category: categoryId } : t
      ));
      updateTransaction(txnId, { category: categoryId });
    }
  }, [selectedCategory, clearPicker, refreshIdRef, setTransactions]);

  function handleDelete(txnId: string) {
    Alert.alert('Delete Transaction', 'Delete this transaction?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          refreshIdRef.current++;
          const idx = transactionsRef.current.findIndex(t => t.id === txnId);
          const txn = idx >= 0 ? transactionsRef.current[idx] : undefined;
          if (txn && !txn.cleared && !txn.reconciled) {
            setUnclearedCount(c => Math.max(0, c - 1));
          }
          if (txn && idx >= 0) {
            lastDeletedRef.current = { txn, index: idx };
          }
          setTransactions(prev => prev.filter(t => t.id !== txnId));
          await deleteTransaction(txnId);
          queueMicrotask(() => useUndoStore.getState().showUndo('Transaction deleted'));
          loadAccountsRef.current();
        },
      },
    ]);
  }

  /** Restore the last deleted item into the local list optimistically. */
  function restoreDeleted() {
    const deleted = lastDeletedRef.current;
    if (!deleted) return;
    lastDeletedRef.current = null;
    setTransactions(prev => {
      // Don't restore if it's already back (e.g. silentRefresh ran first)
      if (prev.some(t => t.id === deleted.txn.id)) return prev;
      const next = [...prev];
      next.splice(Math.min(deleted.index, next.length), 0, deleted.txn);
      return next;
    });
  }

  async function handleToggleCleared(txnId: string) {
    refreshIdRef.current++;
    const txn = transactionsRef.current.find(t => t.id === txnId);
    if (txn && !txn.reconciled) {
      setUnclearedCount(c => Math.max(0, c + (txn.cleared ? 1 : -1)));
      onToggleClearedRef.current?.(txn);
    }
    setTransactions(prev => prev.map(t =>
      t.id === txnId ? { ...t, cleared: !t.cleared } : t
    ));
    await toggleCleared(txnId);
  }

  function handleEditTransaction(txnId: string) {
    router.push({ pathname: '/(auth)/transaction/new', params: { transactionId: txnId } });
  }

  async function handleDuplicate(txnId: string) {
    refreshIdRef.current++;
    const original = transactionsRef.current.find(t => t.id === txnId);
    if (!original) return;
    const newId = await duplicateTransaction(txnId);
    if (newId) {
      const clone: TransactionDisplay = { ...original, id: newId, cleared: false, reconciled: false };
      setTransactions(prev => {
        const idx = prev.findIndex(t => t.id === txnId);
        const next = [...prev];
        next.splice(idx + 1, 0, clone);
        return next;
      });
      setUnclearedCount(c => c + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    loadAccountsRef.current();
  }

  function handleMove(txnId: string) {
    pendingMoveRef.current = txnId;
    if (skipNextRefreshRef) skipNextRefreshRef.current = true;
    router.push({ pathname: '/(auth)/transaction/account-picker', params: { selectedId: '' } });
  }

  function handleSetCategory(txnId: string) {
    pendingCategoryRef.current = txnId;
    if (skipNextRefreshRef) skipNextRefreshRef.current = true;
    router.push({ pathname: '/(auth)/transaction/category-picker', params: { hideSplit: '1' } });
  }

  function handleAddTag(txnId: string) {
    router.push({ pathname: '/(auth)/transaction/tags', params: { transactionId: txnId, mode: 'direct' } });
  }

  return {
    handleDelete,
    handleToggleCleared,
    handleEditTransaction,
    handleDuplicate,
    handleMove,
    handleSetCategory,
    handleAddTag,
    restoreDeleted,
  };
}
