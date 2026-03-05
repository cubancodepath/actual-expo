import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAccountsStore } from '../../../src/stores/accountsStore';
import { useTransactionsStore } from '../../../src/stores/transactionsStore';
import { useCategoriesStore } from '../../../src/stores/categoriesStore';
import { usePickerStore } from '../../../src/stores/pickerStore';
import { findOrCreatePayee } from '../../../src/payees';
import { getTransactionById } from '../../../src/transactions';
import { todayStr, todayInt, strToInt, intToStr } from '../../../src/lib/date';
import { useTheme, useThemedStyles } from '../../../src/presentation/providers/ThemeProvider';
import { Button } from '../../../src/presentation/components/atoms/Button';
import { Banner } from '../../../src/presentation/components/molecules/Banner';
import { CurrencyInput } from '../../../src/presentation/components/atoms/CurrencyInput';
import { TypeToggle, type TransactionType } from '../../../src/presentation/components/transaction/TypeToggle';
import { DetailRow } from '../../../src/presentation/components/transaction/DetailRow';
import { DatePickerField } from '../../../src/presentation/components/transaction/DatePickerField';
import { NotesField } from '../../../src/presentation/components/transaction/NotesField';
import { ClearedToggle } from '../../../src/presentation/components/transaction/ClearedToggle';
import type { Theme } from '../../../src/theme';

export default function NewTransactionScreen() {
  const { accountId, transactionId } = useLocalSearchParams<{
    accountId: string;
    transactionId?: string;
  }>();
  const isEdit = !!transactionId;
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { accounts, load: loadAccounts } = useAccountsStore();
  const { add, update, delete_ } = useTransactionsStore();
  const { groups, load: loadCategories } = useCategoriesStore();

  // Picker store subscriptions
  const selectedPayee = usePickerStore((s) => s.selectedPayee);
  const selectedCategory = usePickerStore((s) => s.selectedCategory);
  const selectedAccount = usePickerStore((s) => s.selectedAccount);
  const clearPicker = usePickerStore((s) => s.clear);

  // Resolve initial account from param
  const initialAccount = accounts.find((a) => a.id === accountId);

  const [type, setType] = useState<TransactionType>('expense');
  const [cents, setCents] = useState(0);
  const [acctId, setAcctId] = useState<string | null>(accountId ?? null);
  const [acctName, setAcctName] = useState(initialAccount?.name ?? '');
  const [payeeId, setPayeeId] = useState<string | null>(null);
  const [payeeName, setPayeeName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [dateInt, setDateInt] = useState(todayInt());
  const [dateStr, setDateStr] = useState(todayStr());
  const [notes, setNotes] = useState('');
  const [cleared, setCleared] = useState(false);
  const [reconciled, setReconciled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear picker on mount, load categories if needed
  useEffect(() => {
    clearPicker();
    if (groups.length === 0) loadCategories();
    if (isEdit) {
      getTransactionById(transactionId).then((txn) => {
        if (!txn) return;
        setType(txn.amount < 0 ? 'expense' : 'income');
        setCents(Math.abs(txn.amount));
        setAcctId(txn.acct);
        const txnAccount = accounts.find((a) => a.id === txn.acct);
        setAcctName(txnAccount?.name ?? '');
        setPayeeId(txn.description);
        setPayeeName(txn.payeeName ?? '');
        setCategoryId(txn.category ?? null);
        setCategoryName(txn.categoryName ?? '');
        setDateInt(txn.date);
        setDateStr(intToStr(txn.date));
        setNotes(txn.notes ?? '');
        setCleared(txn.cleared);
        setReconciled(txn.reconciled);
      });
    }
  }, []);

  // React to picker selections
  useEffect(() => {
    if (selectedPayee) {
      setPayeeId(selectedPayee.id);
      setPayeeName(selectedPayee.name);
    }
  }, [selectedPayee]);

  useEffect(() => {
    if (selectedCategory) {
      setCategoryId(selectedCategory.id);
      setCategoryName(selectedCategory.name);
    }
  }, [selectedCategory]);

  useEffect(() => {
    if (selectedAccount) {
      setAcctId(selectedAccount.id);
      setAcctName(selectedAccount.name);
    }
  }, [selectedAccount]);

  async function performSave() {
    const date = strToInt(dateStr) ?? dateInt;
    const finalAmount = type === 'expense' ? -cents : cents;

    setError(null);
    setLoading(true);
    try {
      const resolvedPayeeId = payeeId ?? (await findOrCreatePayee(payeeName));

      if (isEdit) {
        await update(transactionId, {
          date,
          amount: finalAmount,
          description: resolvedPayeeId,
          category: categoryId,
          notes: notes.trim() || null,
          cleared,
        });
      } else {
        await add({
          acct: acctId!,
          date,
          amount: finalAmount,
          description: resolvedPayeeId,
          category: categoryId,
          notes: notes.trim() || null,
          cleared,
        });
      }
      await loadAccounts();
      router.dismiss();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleSave() {
    if (cents === 0) {
      setError('Enter an amount');
      return;
    }
    if (!isEdit && !acctId) {
      setError('Select an account');
      return;
    }

    if (reconciled) {
      Alert.alert(
        'Edit Reconciled Transaction',
        'Saving your changes to this reconciled transaction may bring your reconciliation out of balance.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save Anyway', style: 'destructive', onPress: performSave },
        ],
      );
      return;
    }

    performSave();
  }

  function handleDelete() {
    const message = reconciled
      ? 'Deleting reconciled transactions may bring your reconciliation out of balance.'
      : 'Delete this transaction?';

    Alert.alert('Delete Transaction', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await delete_(transactionId!);
          await loadAccounts();
          router.dismiss();
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: isEdit ? 'Edit Transaction' : 'New Transaction',
          headerRight: () => (
            <Pressable onPress={() => router.dismiss()} hitSlop={8}>
              <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <TypeToggle type={type} onChangeType={setType} />

        <CurrencyInput
          value={cents}
          onChangeValue={(v) => { setCents(v); setError(null); }}
          type={type}
          autoFocus={!isEdit}
        />

        {/* Details card */}
        <View style={styles.card}>
          <DetailRow
            icon="wallet-outline"
            label={acctName}
            placeholder="Account"
            onPress={() => router.push({ pathname: './account-picker', params: { selectedId: acctId ?? '' } })}
          />
          <View style={styles.cardDivider} />

          <DetailRow
            icon="person-outline"
            label={payeeName}
            placeholder="Payee"
            onPress={() => router.push({ pathname: './payee-picker', params: { selectedId: payeeId ?? '', accountId: acctId ?? '' } })}
          />
          <View style={styles.cardDivider} />

          <DetailRow
            icon="pricetag-outline"
            label={categoryId ? categoryName : ''}
            placeholder="Category"
            onPress={() => {
              const month = dateStr.slice(0, 7);
              router.push({ pathname: './category-picker', params: { month, selectedId: categoryId ?? '' } });
            }}
          />
          <View style={styles.cardDivider} />

          <DatePickerField
            dateInt={dateInt}
            dateStr={dateStr}
            onDateChange={(newInt, newStr) => { setDateInt(newInt); setDateStr(newStr); }}
          />
          <View style={styles.cardDivider} />

          <NotesField value={notes} onChangeText={setNotes} />
          <View style={styles.cardDivider} />

          <ClearedToggle value={cleared} onValueChange={setCleared} />
        </View>

        {error && (
          <Banner message={error} variant="error" onDismiss={() => setError(null)} />
        )}

        <Button
          title={isEdit ? 'Save Changes' : 'Add Transaction'}
          onPress={handleSave}
          size="lg"
          loading={loading}
          disabled={cents === 0 || (!isEdit && !acctId)}
          style={styles.submitButton}
        />

        {isEdit && (
          <Button
            title="Delete Transaction"
            icon="trash-outline"
            variant="danger"
            size="lg"
            onPress={handleDelete}
            style={styles.deleteButton}
          />
        )}
      </ScrollView>
    </>
  );
}

const createStyles = (theme: Theme) => ({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
  },
  container: {
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  card: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth.default,
    borderColor: theme.colors.cardBorder,
    overflow: 'hidden' as const,
  },
  cardDivider: {
    height: theme.borderWidth.default,
    backgroundColor: theme.colors.divider,
    marginHorizontal: theme.spacing.lg,
  },
  submitButton: {
    marginTop: theme.spacing.lg,
  },
  deleteButton: {
    marginTop: theme.spacing.xl,
  },
});
