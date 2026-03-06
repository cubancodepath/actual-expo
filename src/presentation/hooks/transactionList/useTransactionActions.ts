import { useRef } from 'react';
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

interface UseTransactionActionsOptions {
  transactions: TransactionDisplay[];
  setTransactions: React.Dispatch<React.SetStateAction<TransactionDisplay[]>>;
  refreshIdRef: React.MutableRefObject<number>;
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

  function handleDelete(txnId: string) {
    Alert.alert('Delete Transaction', 'Delete this transaction?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          refreshIdRef.current++;
          const txn = transactionsRef.current.find(t => t.id === txnId);
          if (txn && !txn.cleared && !txn.reconciled) {
            setUnclearedCount(c => Math.max(0, c - 1));
          }
          setTransactions(prev => prev.filter(t => t.id !== txnId));
          await deleteTransaction(txnId);
          loadAccountsRef.current();
        },
      },
    ]);
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

  async function handleMove(txnId: string, targetAccountId: string) {
    refreshIdRef.current++;
    if (moveMode === 'remap') {
      const targetName = accountsRef.current.find(a => a.id === targetAccountId)?.name;
      setTransactions(prev => prev.map(t =>
        t.id === txnId ? { ...t, acct: targetAccountId, accountName: targetName } : t
      ));
    } else {
      setTransactions(prev => prev.filter(t => t.id !== txnId));
    }
    await updateTransaction(txnId, { acct: targetAccountId });
    loadAccountsRef.current();
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
    handleAddTag,
  };
}
