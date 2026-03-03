import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useAccountsStore } from '../../../src/stores/accountsStore';
import {
  addTransaction,
  deleteTransaction,
  getClearedBalance,
  getTransactionsForAccount,
  lockTransactions,
  toggleCleared,
  type TransactionDisplay,
} from '../../../src/transactions';

import { formatDate, todayInt } from '../../../src/lib/date';
import { formatAmount, formatBalance } from '../../../src/lib/format';

// ---------------------------------------------------------------------------
// ReconcileEntryModal — step 1: user enters their bank balance
// ---------------------------------------------------------------------------

function ReconcileEntryModal({
  visible,
  clearedBalance,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  clearedBalance: number;
  onCancel: () => void;
  /** Called with null if user confirms balance matches, or with cents if they enter a different amount */
  onConfirm: (bankBalanceCents: number | null) => void;
}) {
  const [showInput, setShowInput] = useState(false);
  const [input, setInput] = useState('');

  function reset() {
    setShowInput(false);
    setInput('');
  }

  function handleNo() {
    setShowInput(true);
  }

  function handleYes() {
    reset();
    onConfirm(null); // cleared balance matches → lock directly
  }

  function handleStart() {
    const parsed = parseFloat(input.replace(/[^0-9.]/g, ''));
    const cents = isNaN(parsed) ? 0 : Math.round(parsed * 100);
    reset();
    onConfirm(cents);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { reset(); onCancel(); }}>
      <KeyboardAvoidingView
        style={recon.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={recon.modal}>
          <Text style={recon.modalTitle}>Reconcile Account</Text>

          <View style={recon.infoRow}>
            <Text style={recon.infoLabel}>Cleared balance</Text>
            <Text style={recon.infoValue}>{formatBalance(clearedBalance)}</Text>
          </View>

          {!showInput ? (
            <>
              <Text style={recon.modalQuestion}>
                Does this match your bank statement?
              </Text>
              <View style={recon.modalActions}>
                <Pressable style={recon.noBtn} onPress={handleNo}>
                  <Text style={recon.noText}>No</Text>
                </Pressable>
                <Pressable style={recon.yesBtn} onPress={handleYes}>
                  <Text style={recon.yesText}>Yes, lock it ✓</Text>
                </Pressable>
              </View>
              <Pressable style={recon.cancelLink} onPress={() => { reset(); onCancel(); }}>
                <Text style={recon.cancelLinkText}>Cancel</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={recon.inputLabel}>Enter your bank statement balance</Text>
              <TextInput
                style={recon.input}
                placeholder="0.00"
                placeholderTextColor="#475569"
                value={input}
                onChangeText={setInput}
                keyboardType="decimal-pad"
                autoFocus
                selectTextOnFocus
              />
              <View style={recon.modalActions}>
                <Pressable style={recon.cancelBtn} onPress={() => { reset(); onCancel(); }}>
                  <Text style={recon.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable style={recon.startBtn} onPress={handleStart}>
                  <Text style={recon.startText}>Start Reconciling</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// ReconciliationBanner — shown during reconciliation
// ---------------------------------------------------------------------------

function ReconciliationBanner({
  clearedBalance,
  bankBalance,
  onCreateAdjustment,
  onLock,
  onExit,
}: {
  clearedBalance: number;
  bankBalance: number;
  onCreateAdjustment: () => void;
  onLock: () => void;
  onExit: () => void;
}) {
  const diff = bankBalance - clearedBalance;
  const balanced = diff === 0;

  return (
    <View style={recon.banner}>
      <View style={recon.bannerHeader}>
        <Text style={recon.bannerTitle}>Reconciling</Text>
        <Pressable onPress={onExit} hitSlop={12}>
          <Text style={recon.exitText}>✕ Exit</Text>
        </Pressable>
      </View>

      <View style={recon.bannerRow}>
        <Text style={recon.bannerLabel}>Cleared balance</Text>
        <Text style={recon.bannerValue}>{formatBalance(clearedBalance)}</Text>
      </View>
      <View style={recon.bannerRow}>
        <Text style={recon.bannerLabel}>Bank balance</Text>
        <Text style={recon.bannerValue}>{formatBalance(bankBalance)}</Text>
      </View>
      <View style={[recon.bannerRow, recon.bannerDivider]}>
        <Text style={recon.bannerLabel}>Difference</Text>
        <Text style={[recon.bannerValue, !balanced && recon.bannerDiff]}>
          {formatBalance(diff)}
        </Text>
      </View>

      {balanced ? (
        <View style={recon.bannerHint}>
          <Text style={recon.bannerHintText}>✓ Balances match!</Text>
        </View>
      ) : (
        <Pressable style={recon.adjustBtn} onPress={onCreateAdjustment}>
          <Text style={recon.adjustText}>Create Adjustment Transaction</Text>
        </Pressable>
      )}

      <Pressable
        style={[recon.lockBtn, !balanced && recon.lockBtnDisabled]}
        onPress={balanced ? onLock : undefined}
        disabled={!balanced}
      >
        <Text style={[recon.lockText, !balanced && recon.lockTextDisabled]}>
          🔒 Lock Transactions
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// TransactionRow
// ---------------------------------------------------------------------------

function TransactionRow({
  item,
  onPress,
  onDelete,
  onToggleCleared,
}: {
  item: TransactionDisplay;
  onPress: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleCleared: (id: string) => void;
}) {
  const statusIcon = item.reconciled ? '🔒' : item.cleared ? '✓' : '○';

  return (
    <Pressable
      style={styles.txRow}
      onPress={() => onPress(item.id)}
      onLongPress={() => onDelete(item.id)}
      android_ripple={{ color: '#334155' }}
    >
      <View style={styles.txDate}>
        <Text style={styles.txDateText}>{formatDate(item.date)}</Text>
      </View>
      <View style={styles.txMid}>
        <View style={styles.txPayeeRow}>
          {item.transferred_id != null && (
            <Text style={styles.txTransferIcon}>⇄</Text>
          )}
          <Text style={styles.txPayee} numberOfLines={1}>
            {item.payeeName ?? '—'}
          </Text>
        </View>
        {item.categoryName ? (
          <Text style={styles.txCategory} numberOfLines={1}>
            {item.categoryName}
          </Text>
        ) : null}
        {item.notes ? (
          <Text style={styles.txNotes} numberOfLines={1}>
            {item.notes}
          </Text>
        ) : null}
      </View>
      <View style={styles.txRight}>
        <Text style={[styles.txAmount, item.amount < 0 ? styles.expense : styles.income]}>
          {formatAmount(item.amount)}
        </Text>
        <Pressable
          onPress={() => { if (!item.reconciled) onToggleCleared(item.id); }}
          hitSlop={10}
          style={styles.statusBtn}
        >
          <Text style={[
            styles.statusIcon,
            item.reconciled ? styles.statusReconciled :
            item.cleared    ? styles.statusCleared    :
                              styles.statusUncleared,
          ]}>
            {statusIcon}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function AccountTransactionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { accounts, load: loadAccounts } = useAccountsStore();
  const account = accounts.find(a => a.id === id);

  const [transactions, setTransactions] = useState<TransactionDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);

  const [hideReconciled, setHideReconciled] = useState(false);

  // Reconciliation state
  const [reconciling, setReconciling] = useState(false);
  const [bankBalance, setBankBalance] = useState(0);
  const [clearedBalance, setClearedBalance] = useState(0);
  const [reconcileEntryVisible, setReconcileEntryVisible] = useState(false);

  const PAGE_SIZE = 50;

  const loadTransactions = useCallback(async (hide = hideReconciled) => {
    setLoading(true);
    offsetRef.current = 0;
    try {
      const [txns, cleared] = await Promise.all([
        getTransactionsForAccount(id, { limit: PAGE_SIZE, offset: 0, hideReconciled: hide }),
        getClearedBalance(id),
      ]);
      setTransactions(txns);
      setClearedBalance(cleared);
      setHasMore(txns.length === PAGE_SIZE);
      offsetRef.current = txns.length;
    } finally {
      setLoading(false);
    }
  }, [id, hideReconciled]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const txns = await getTransactionsForAccount(id, { limit: PAGE_SIZE, offset: offsetRef.current, hideReconciled });
      if (txns.length === 0) { setHasMore(false); return; }
      setTransactions(prev => [...prev, ...txns]);
      setHasMore(txns.length === PAGE_SIZE);
      offsetRef.current += txns.length;
    } finally {
      setLoadingMore(false);
    }
  }, [id, loadingMore, hasMore, hideReconciled]);

  useFocusEffect(useCallback(() => { loadTransactions(); }, [loadTransactions]));

  useLayoutEffect(() => {
    navigation.setOptions({
      title: account?.name ?? 'Account',
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Pressable
            onPress={() => {
              const next = !hideReconciled;
              setHideReconciled(next);
              loadTransactions(next);
            }}
            hitSlop={12}
            style={{ paddingHorizontal: 6 }}
          >
            <Text style={[styles.lockToggleIcon, hideReconciled && styles.lockToggleIconActive]}>
              🔒
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setReconcileEntryVisible(true)}
            hitSlop={12}
            style={{ paddingHorizontal: 6 }}
          >
            <Text style={styles.reconcileIcon}>⚖</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              router.push({ pathname: '/(auth)/account/settings', params: { id } })
            }
            hitSlop={12}
            style={{ paddingHorizontal: 4 }}
          >
            <Text style={styles.settingsIcon}>⚙</Text>
          </Pressable>
        </View>
      ),
    });
  }, [account?.name, id]);

  function handleDelete(txnId: string) {
    Alert.alert('Delete Transaction', 'Delete this transaction?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTransaction(txnId);
          await Promise.all([loadAccounts(), loadTransactions()]);
        },
      },
    ]);
  }

  async function handleToggleCleared(txnId: string) {
    await toggleCleared(txnId);
    const [txns, cleared] = await Promise.all([
      getTransactionsForAccount(id),
      getClearedBalance(id),
    ]);
    setTransactions(txns);
    setClearedBalance(cleared);
    await loadAccounts(); // update account balance display
  }

  async function handleStartReconcile(bankBalanceCents: number | null) {
    const cleared = await getClearedBalance(id);
    setClearedBalance(cleared);
    setReconcileEntryVisible(false);

    if (bankBalanceCents === null) {
      // User confirmed balance matches → lock immediately
      await lockTransactions(id);
      await Promise.all([loadAccounts(), loadTransactions()]);
    } else {
      setBankBalance(bankBalanceCents);
      setReconciling(true);
    }
  }

  async function handleCreateAdjustment() {
    const diff = bankBalance - clearedBalance;
    if (diff === 0) return;

    await addTransaction({
      acct: id,
      date: todayInt(),
      amount: diff,
      description: null,
      category: null,
      notes: 'Reconciliation balance adjustment',
      cleared: true,
    });

    const [txns, cleared] = await Promise.all([
      getTransactionsForAccount(id),
      getClearedBalance(id),
    ]);
    setTransactions(txns);
    setClearedBalance(cleared);
    await loadAccounts();
  }

  function handleEditTransaction(txnId: string) {
    const txn = transactions.find(t => t.id === txnId);
    if (txn?.reconciled) {
      Alert.alert(
        'Reconciled Transaction',
        'This transaction has been locked after reconciliation. Editing it may throw your reconciliation out of balance.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Edit Anyway',
            style: 'destructive',
            onPress: () =>
              router.push({ pathname: '/(auth)/transaction/new', params: { transactionId: txnId } }),
          },
        ],
      );
    } else {
      router.push({ pathname: '/(auth)/transaction/new', params: { transactionId: txnId } });
    }
  }

  async function handleLockTransactions() {
    await lockTransactions(id);
    setReconciling(false);
    setBankBalance(0);
    await Promise.all([loadAccounts(), loadTransactions()]);
  }

  function handleExitReconcile() {
    setReconciling(false);
    setBankBalance(0);
    setReconcileEntryVisible(false);
  }

  return (
    <View style={styles.container}>
      {/* Balance card */}
      <View style={styles.balanceCard}>
        <View style={styles.balanceTop}>
          <Text style={styles.balanceLabel}>Current Balance</Text>
          <Text style={[styles.balance, (account?.balance ?? 0) < 0 && styles.negative]}>
            {formatBalance(account?.balance ?? 0)}
          </Text>
        </View>
        {(account?.balance ?? 0) !== clearedBalance && (
          <View style={styles.balanceBreakdown}>
            <View style={styles.balanceStat}>
              <Text style={styles.balanceStatIcon}>✓</Text>
              <Text style={styles.balanceStatLabel}>Cleared</Text>
              <Text style={[styles.balanceStatValue, clearedBalance < 0 && styles.negative]}>
                {formatBalance(clearedBalance)}
              </Text>
            </View>
            <View style={styles.balanceStatDivider} />
            <View style={styles.balanceStat}>
              <Text style={[styles.balanceStatIcon, styles.balanceStatIconUncleared]}>○</Text>
              <Text style={styles.balanceStatLabel}>Uncleared</Text>
              <Text style={[styles.balanceStatValue, ((account?.balance ?? 0) - clearedBalance) < 0 && styles.negative]}>
                {formatBalance((account?.balance ?? 0) - clearedBalance)}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Reconciliation banner */}
      {reconciling && (
        <ReconciliationBanner
          clearedBalance={clearedBalance}
          bankBalance={bankBalance}
          onCreateAdjustment={handleCreateAdjustment}
          onLock={handleLockTransactions}
          onExit={handleExitReconcile}
        />
      )}

      {loading ? (
        <ActivityIndicator color="#3b82f6" style={{ marginTop: 40 }} />
      ) : (
        <FlashList
          data={transactions}
          keyExtractor={t => t.id}
          estimatedItemSize={62}
          renderItem={({ item }) => (
            <TransactionRow
              item={item}
              onPress={handleEditTransaction}
              onDelete={handleDelete}
              onToggleCleared={handleToggleCleared}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore
              ? <ActivityIndicator color="#3b82f6" style={{ paddingVertical: 20 }} />
              : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No transactions yet</Text>
              <Text style={styles.emptyHint}>Tap + to add one</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}

      {/* FAB */}
      <Pressable
        style={styles.fab}
        onPress={() =>
          router.push({ pathname: '/(auth)/transaction/new', params: { accountId: id } })
        }
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      {/* Reconcile entry modal */}
      <ReconcileEntryModal
        visible={reconcileEntryVisible}
        clearedBalance={clearedBalance}
        onCancel={() => setReconcileEntryVisible(false)}
        onConfirm={handleStartReconcile}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },

  balanceCard: {
    backgroundColor: '#1e293b', marginHorizontal: 16, marginTop: 12,
    marginBottom: 8, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#334155',
  },
  balanceTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  balanceLabel: { color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  balance: { color: '#4ade80', fontSize: 22, fontWeight: '700' },
  negative: { color: '#f87171' },
  balanceBreakdown: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#334155',
    gap: 0,
  },
  balanceStat: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  balanceStatDivider: {
    width: 1, height: 16, backgroundColor: '#334155', marginHorizontal: 8,
  },
  balanceStatIcon: { color: '#4ade80', fontSize: 11, fontWeight: '700', width: 12 },
  balanceStatIconUncleared: { color: '#64748b' },
  balanceStatLabel: { color: '#64748b', fontSize: 12, flex: 1 },
  balanceStatValue: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },

  lockToggleIcon: { fontSize: 16, opacity: 0.3 },
  lockToggleIconActive: { opacity: 1 },
  reconcileIcon: { color: '#818cf8', fontSize: 20 },
  settingsIcon: { color: '#94a3b8', fontSize: 20 },

  txRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#0f172a',
  },
  txDate: { width: 44, marginRight: 12 },
  txDateText: { color: '#64748b', fontSize: 12, lineHeight: 16 },
  txMid: { flex: 1, marginRight: 12 },
  txPayeeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  txTransferIcon: { color: '#818cf8', fontSize: 13, fontWeight: '700' },
  txPayee: { color: '#f1f5f9', fontSize: 15, fontWeight: '500', flexShrink: 1 },
  txCategory: { color: '#64748b', fontSize: 12, marginTop: 2 },
  txNotes: { color: '#475569', fontSize: 12, marginTop: 1, fontStyle: 'italic' },
  txRight: { alignItems: 'flex-end', minWidth: 80 },
  txAmount: { fontSize: 15, fontWeight: '600' },
  income: { color: '#4ade80' },
  expense: { color: '#f87171' },

  statusBtn: { marginTop: 4 },
  statusIcon: { fontSize: 13, fontWeight: '600' },
  statusReconciled: { color: '#818cf8' },
  statusCleared: { color: '#4ade80' },
  statusUncleared: { color: '#475569' },

  separator: { height: 1, backgroundColor: '#1e293b', marginLeft: 16 },

  empty: { alignItems: 'center', marginTop: 80, gap: 8 },
  emptyText: { color: '#94a3b8', fontSize: 16, fontWeight: '600' },
  emptyHint: { color: '#475569', fontSize: 13 },

  fab: {
    position: 'absolute', bottom: 28, right: 24,
    backgroundColor: '#3b82f6', width: 56, height: 56,
    borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 32, fontWeight: '300' },
});

const recon = StyleSheet.create({
  // Entry modal
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modal: {
    backgroundColor: '#1e293b', borderRadius: 16, padding: 24,
    width: '100%', borderWidth: 1, borderColor: '#334155',
  },
  modalTitle: { color: '#f1f5f9', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  modalQuestion: { color: '#cbd5e1', fontSize: 15, marginBottom: 20, lineHeight: 22, textAlign: 'center' },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#0f172a', borderRadius: 8, padding: 12, marginBottom: 16,
  },
  infoLabel: { color: '#64748b', fontSize: 13 },
  infoValue: { color: '#4ade80', fontSize: 15, fontWeight: '600' },
  inputLabel: { color: '#94a3b8', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: {
    backgroundColor: '#0f172a', color: '#f1f5f9', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 14, fontSize: 20, fontWeight: '600',
    borderWidth: 1, borderColor: '#334155', marginBottom: 20, textAlign: 'right',
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  // Yes/No buttons (step 1)
  noBtn: {
    flex: 1, backgroundColor: '#0f172a', borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#334155',
  },
  noText: { color: '#f87171', fontSize: 15, fontWeight: '600' },
  yesBtn: {
    flex: 1, backgroundColor: '#166534', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
  },
  yesText: { color: '#4ade80', fontSize: 15, fontWeight: '700' },
  cancelLink: { alignItems: 'center', marginTop: 14 },
  cancelLinkText: { color: '#475569', fontSize: 14 },
  // Input path buttons (step 2)
  cancelBtn: {
    flex: 1, backgroundColor: '#0f172a', borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#334155',
  },
  cancelText: { color: '#94a3b8', fontSize: 15, fontWeight: '600' },
  startBtn: {
    flex: 1, backgroundColor: '#3b82f6', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
  },
  startText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Banner
  banner: {
    backgroundColor: '#1e293b', marginHorizontal: 16, marginBottom: 8,
    borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#818cf8',
  },
  bannerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12,
  },
  bannerTitle: { color: '#818cf8', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  exitText: { color: '#64748b', fontSize: 13 },
  bannerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  bannerDivider: { borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 8, marginTop: 4, marginBottom: 12 },
  bannerLabel: { color: '#94a3b8', fontSize: 14 },
  bannerValue: { color: '#f1f5f9', fontSize: 14, fontWeight: '600' },
  bannerDiff: { color: '#f87171' },
  bannerHint: { alignItems: 'center', marginBottom: 10 },
  bannerHintText: { color: '#4ade80', fontSize: 14, fontWeight: '600' },
  adjustBtn: {
    backgroundColor: '#451a03', borderRadius: 8, paddingVertical: 12,
    alignItems: 'center', marginBottom: 8,
    borderWidth: 1, borderColor: '#92400e',
  },
  adjustText: { color: '#fbbf24', fontSize: 14, fontWeight: '600' },
  lockBtn: {
    backgroundColor: '#1d4ed8', borderRadius: 8, paddingVertical: 12,
    alignItems: 'center',
  },
  lockBtnDisabled: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  lockText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  lockTextDisabled: { color: '#475569' },
});
