import { useEffect, useState } from 'react';
import { Alert, Keyboard, Pressable, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import { useAccountsStore } from '../../../src/stores/accountsStore';
import { useTransactionsStore } from '../../../src/stores/transactionsStore';
import { useCategoriesStore } from '../../../src/stores/categoriesStore';
import { usePickerStore } from '../../../src/stores/pickerStore';
import { findOrCreatePayee } from '../../../src/payees';
import { addTransaction, getTransactionById, getChildTransactions, deleteTransaction as deleteTransactionById } from '../../../src/transactions';
import { batchMessages } from '../../../src/sync';
import { extractTagsFromNotes } from '../../../src/tags';
import { todayStr, todayInt, strToInt, intToStr } from '../../../src/lib/date';
import { useTheme, useThemedStyles } from '../../../src/presentation/providers/ThemeProvider';
import { useKeyboardHeight } from '../../../src/presentation/hooks/useKeyboardHeight';
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
  const { height: keyboardHeight, visible: keyboardVisible } = useKeyboardHeight();
  const doneButtonStyle = useAnimatedStyle(() => ({ bottom: keyboardHeight.value }));
  const { accounts, load: loadAccounts } = useAccountsStore();
  const { add, update, delete_ } = useTransactionsStore();
  const { groups, load: loadCategories } = useCategoriesStore();

  // Picker store subscriptions
  const selectedPayee = usePickerStore((s) => s.selectedPayee);
  const selectedCategory = usePickerStore((s) => s.selectedCategory);
  const selectedAccount = usePickerStore((s) => s.selectedAccount);
  const selectedTags = usePickerStore((s) => s.selectedTags);
  const splitCategories = usePickerStore((s) => s.splitCategories);
  const setSplitCategories = usePickerStore((s) => s.setSplitCategories);
  const clearPicker = usePickerStore((s) => s.clear);

  const isSplit = splitCategories !== null && splitCategories.length > 1;

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
      getTransactionById(transactionId).then(async (txn) => {
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

        // Load split children for parent transactions
        if (txn.isParent) {
          const children = await getChildTransactions(transactionId);
          if (children.length > 0) {
            setSplitCategories(
              children.map((c) => ({
                id: c.id,
                categoryId: c.category,
                categoryName: c.categoryName ?? '',
                amount: Math.abs(c.amount),
              })),
            );
          }
        }
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
      // If user picks a single category, clear any split
      usePickerStore.getState().setSplitCategories(null);
    }
  }, [selectedCategory]);

  useEffect(() => {
    if (!splitCategories || splitCategories.length === 0) return;

    const splitTotal = splitCategories.reduce((sum, l) => sum + l.amount, 0);

    if (splitCategories.length === 1) {
      // Single line — treat as normal single-category transaction
      setCategoryId(splitCategories[0].categoryId);
      setCategoryName(splitCategories[0].categoryName);
      if (cents === 0 && splitTotal > 0) setCents(splitTotal);
      usePickerStore.getState().setSplitCategories(null);
    } else {
      // Multiple lines — update amount from split total if not set
      if (cents === 0 && splitTotal > 0) setCents(splitTotal);
    }
  }, [splitCategories]);

  useEffect(() => {
    if (selectedAccount) {
      setAcctId(selectedAccount.id);
      setAcctName(selectedAccount.name);
    }
  }, [selectedAccount]);

  useEffect(() => {
    if (selectedTags) {
      const plainNotes = notes.replace(/\s?(?<!#)#([^#\s]+)/g, '').trim();
      const tagSuffix = selectedTags.map((t) => `#${t}`).join(' ');
      setNotes(plainNotes ? `${plainNotes} ${tagSuffix}` : tagSuffix);
    }
  }, [selectedTags]);

  async function performSave() {
    const date = strToInt(dateStr) ?? dateInt;
    const finalAmount = type === 'expense' ? -cents : cents;
    const sign = type === 'expense' ? -1 : 1;

    setError(null);
    setLoading(true);
    try {
      const resolvedPayeeId = payeeId ?? (await findOrCreatePayee(payeeName));

      if (isSplit && isEdit) {
        // Editing a split transaction — update parent, delete old children, create new children
        await batchMessages(async () => {
          await update(transactionId, {
            date,
            amount: finalAmount,
            description: resolvedPayeeId,
            category: null,
            notes: notes.trim() || null,
            cleared,
            isParent: true,
          });

          // Delete old children
          const oldChildren = await getChildTransactions(transactionId);
          for (const child of oldChildren) {
            await deleteTransactionById(child.id);
          }

          // Create new children
          for (const line of splitCategories!) {
            await addTransaction({
              acct: acctId!,
              date,
              amount: sign * line.amount,
              description: resolvedPayeeId,
              category: line.categoryId,
              notes: null,
              cleared,
              isChild: true,
              parent_id: transactionId,
            });
          }
        });
      } else if (isSplit) {
        // New split transaction — create parent + children in a single batch
        await batchMessages(async () => {
          const parentId = await addTransaction({
            acct: acctId!,
            date,
            amount: finalAmount,
            description: resolvedPayeeId,
            category: null,
            notes: notes.trim() || null,
            cleared,
            isParent: true,
          });

          for (const line of splitCategories!) {
            await addTransaction({
              acct: acctId!,
              date,
              amount: sign * line.amount,
              description: resolvedPayeeId,
              category: line.categoryId,
              notes: null,
              cleared,
              isChild: true,
              parent_id: parentId,
            });
          }
        });
      } else if (isEdit) {
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
            icon={isSplit ? 'git-branch-outline' : 'pricetag-outline'}
            label={isSplit ? `Split (${splitCategories!.length} categories)` : (categoryId ? categoryName : '')}
            placeholder="Category"
            onPress={() => {
              if (isSplit) {
                router.push({
                  pathname: './split',
                  params: {
                    amount: String(cents),
                    payeeId: payeeId ?? '',
                    payeeName,
                    transactionId: transactionId ?? '',
                  },
                });
              } else {
                const month = dateStr.slice(0, 7);
                router.push({
                  pathname: './category-picker',
                  params: {
                    month,
                    selectedId: categoryId ?? '',
                    amount: String(cents),
                    payeeId: payeeId ?? '',
                    payeeName,
                    transactionId: transactionId ?? '',
                  },
                });
              }
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

          <DetailRow
            icon="pricetags-outline"
            label={
              extractTagsFromNotes(notes).length > 0
                ? extractTagsFromNotes(notes).map((t) => `#${t}`).join(', ')
                : ''
            }
            placeholder="Tags"
            onPress={() => {
              router.push({
                pathname: './tags',
                params: { mode: 'picker', currentNotes: notes },
              });
            }}
          />
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

      {keyboardVisible && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              right: theme.spacing.lg,
              zIndex: 10,
              marginBottom: theme.spacing.sm,
            },
            doneButtonStyle,
          ]}
        >
          <Pressable onPress={() => Keyboard.dismiss()}>
            {isLiquidGlassAvailable() ? (
              <GlassView
                isInteractive
                style={{
                  borderRadius: theme.borderRadius.full,
                  paddingHorizontal: theme.spacing.lg,
                  paddingVertical: theme.spacing.sm,
                }}
              >
                <Ionicons name="checkmark" size={18} color={theme.colors.textPrimary} />
              </GlassView>
            ) : (
              <BlurView
                tint="systemChromeMaterial"
                intensity={100}
                style={{
                  borderRadius: theme.borderRadius.full,
                  paddingHorizontal: theme.spacing.lg,
                  paddingVertical: theme.spacing.sm,
                  overflow: 'hidden',
                }}
              >
                <Ionicons name="checkmark" size={18} color={theme.colors.textPrimary} />
              </BlurView>
            )}
          </Pressable>
        </Animated.View>
      )}
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
