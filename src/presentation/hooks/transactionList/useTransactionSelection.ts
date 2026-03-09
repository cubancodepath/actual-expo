import { useCallback, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import type { TransactionDisplay } from '../../../transactions';

interface UseTransactionSelectionOptions {
  transactions: TransactionDisplay[];
  onEnterSelectMode?: () => void;
  onExitSelectMode?: () => void;
}

export function useTransactionSelection({
  transactions,
  onEnterSelectMode,
  onExitSelectMode,
}: UseTransactionSelectionOptions) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);

  // Refs to avoid callback identity changes causing re-render loops
  const onEnterRef = useRef(onEnterSelectMode);
  onEnterRef.current = onEnterSelectMode;
  const onExitRef = useRef(onExitSelectMode);
  onExitRef.current = onExitSelectMode;
  const transactionsRef = useRef(transactions);
  transactionsRef.current = transactions;

  const selectedTransactions = useMemo(
    () => transactions.filter(t => selectedIds.has(t.id)),
    [selectedIds, transactions],
  );

  const allCleared = useMemo(() => {
    const nonReconciled = selectedTransactions.filter(t => !t.reconciled);
    return nonReconciled.length > 0 && nonReconciled.every(t => t.cleared);
  }, [selectedTransactions]);

  const selectedTotal = useMemo(
    () => selectedTransactions.reduce((sum, t) => sum + t.amount, 0),
    [selectedTransactions],
  );

  const handleLongPress = useCallback((txnId: string) => {
    setIsSelectMode(prev => {
      if (!prev) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onEnterRef.current?.();
      }
      return true;
    });
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(txnId)) next.delete(txnId);
      else next.add(txnId);
      return next;
    });
  }, []);

  const enterSelectMode = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsSelectMode(true);
    onEnterRef.current?.();
  }, []);

  const handleSelectAll = useCallback(() => {
    const allIds = transactionsRef.current.map(t => t.id);
    setSelectedIds(new Set(allIds));
  }, []);

  const handleDoneSelection = useCallback(() => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
    onExitRef.current?.();
  }, []);

  const resetSelection = useCallback(() => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
    onExitRef.current?.();
  }, []);

  return {
    selectedIds,
    isSelectMode,
    selectedTransactions,
    allCleared,
    selectedTotal,
    handleLongPress,
    enterSelectMode,
    handleSelectAll,
    handleDoneSelection,
    resetSelection,
  };
}
