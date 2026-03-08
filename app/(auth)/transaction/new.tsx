import { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, Pressable, ScrollView, useColorScheme, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useAccountsStore } from '../../../src/stores/accountsStore';
import { useTransactionsStore } from '../../../src/stores/transactionsStore';
import { useCategoriesStore } from '../../../src/stores/categoriesStore';
import { usePickerStore } from '../../../src/stores/pickerStore';
import { getTransactionById, getChildTransactions } from '../../../src/transactions';
import { saveTransaction } from '../../../src/transactions/save';
import { extractTagsFromNotes } from '../../../src/tags';
import { todayStr, todayInt, strToInt, intToStr } from '../../../src/lib/date';
import { withOpacity } from '../../../src/lib/colors';
import { useTheme } from '../../../src/presentation/providers/ThemeProvider';
import { Button } from '../../../src/presentation/components/atoms/Button';
import { KeyboardToolbar } from '../../../src/presentation/components/molecules/KeyboardToolbar';
import { CalculatorToolbar } from '../../../src/presentation/components/atoms/CalculatorToolbar';
import { Banner } from '../../../src/presentation/components/molecules/Banner';
import { CurrencyInput, type CurrencyInputRef } from '../../../src/presentation/components/atoms/CurrencyInput';
import { TypeToggle, type TransactionType } from '../../../src/presentation/components/transaction/TypeToggle';
import { DetailRow } from '../../../src/presentation/components/transaction/DetailRow';
import { DatePickerField } from '../../../src/presentation/components/transaction/DatePickerField';
import { NotesField } from '../../../src/presentation/components/transaction/NotesField';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { GlassButton } from '../../../src/presentation/components/atoms/GlassButton';
import { ClearedToggle } from '../../../src/presentation/components/transaction/ClearedToggle';

export default function NewTransactionScreen() {
  const {
    accountId,
    accountName: accountNameParam,
    categoryId: categoryIdParam,
    categoryName: categoryNameParam,
    amount: amountParam,
    payeeName: payeeNameParam,
    transactionId,
  } = useLocalSearchParams<{
    accountId: string;
    accountName?: string;
    categoryId?: string;
    categoryName?: string;
    amount?: string;
    payeeName?: string;
    transactionId?: string;
  }>();
  const isEdit = !!transactionId;
  const router = useRouter();
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { accounts, load: loadAccounts } = useAccountsStore();
  const { delete_ } = useTransactionsStore();
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
  const [cents, setCents] = useState(amountParam ? Number(amountParam) : 0);
  const [acctId, setAcctId] = useState<string | null>(accountId ?? null);
  const [acctName, setAcctName] = useState(accountNameParam ?? initialAccount?.name ?? '');
  const [payeeId, setPayeeId] = useState<string | null>(null);
  const [payeeName, setPayeeName] = useState(payeeNameParam ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(categoryIdParam ?? null);
  const [categoryName, setCategoryName] = useState(categoryNameParam ?? '');
  const [dateInt, setDateInt] = useState(todayInt());
  const [dateStr, setDateStr] = useState(todayStr());
  const [notes, setNotes] = useState('');
  const [cleared, setCleared] = useState(false);
  const [reconciled, setReconciled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currencyInputRef = useRef<CurrencyInputRef>(null);

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
    setError(null);
    setLoading(true);
    try {
      await saveTransaction({
        transactionId: isEdit ? transactionId : undefined,
        acct: acctId!,
        date: strToInt(dateStr) ?? dateInt,
        amount: cents,
        type,
        payeeId,
        payeeName,
        categoryId,
        notes: notes.trim() || null,
        cleared,
        splitCategories: isSplit ? splitCategories : null,
      });
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

    if (!categoryId && !isSplit) {
      Alert.alert(
        'No Category',
        'This transaction has no category. Save anyway?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save', onPress: performSave },
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

  // ── Header colors based on transaction type ──
  const isExpense = type === 'expense';
  const headerBg = isExpense
    ? (isDark ? withOpacity(colors.negative, 0.18) : colors.errorBackground)
    : (isDark ? withOpacity(colors.positive, 0.18) : colors.successBackground);
  const headerText = isExpense
    ? (isDark ? colors.negative : colors.errorText)
    : (isDark ? colors.positive : colors.successText);

  const cardStyle = {
    backgroundColor: colors.cardBackground,
    borderRadius: br.lg,
    borderWidth: bw.thin,
    borderColor: colors.cardBorder,
    overflow: 'hidden' as const,
  };

  const dividerStyle = {
    height: bw.thin,
    backgroundColor: colors.divider,
    marginHorizontal: spacing.lg,
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.pageBackground }}
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {/* ── Colored header ── */}
        <View
          style={{
            backgroundColor: headerBg,
            paddingTop: 56,
            paddingBottom: spacing.xxxl,
            paddingHorizontal: spacing.lg,
            borderBottomLeftRadius: br.lg,
            borderBottomRightRadius: br.lg,
            alignItems: 'center',
            gap: spacing.md,
          }}
        >
          {/* Close button — top left */}
          <View style={{ position: 'absolute', top: 16, left: spacing.md }}>
            <GlassButton icon="xmark" onPress={() => router.dismiss()} />
          </View>

          {/* Title — centered */}
          <View style={{ position: 'absolute', top: 24, left: 0, right: 0, alignItems: 'center', pointerEvents: 'none' }}>
            <Text variant="body" color={colors.textPrimary} style={{ fontWeight: '600' }}>
              {isEdit ? 'Edit Transaction' : 'Add Transaction'}
            </Text>
          </View>

          <View style={{ alignSelf: 'stretch', marginTop: spacing.lg }}>
            <TypeToggle type={type} onChangeType={setType} />
          </View>

          <CurrencyInput
            ref={currencyInputRef}
            value={cents}
            onChangeValue={(v) => { setCents(v); setError(null); }}
            type={type}
            autoFocus={!isEdit}
            color={headerText}
            style={{ paddingVertical: spacing.sm, alignSelf: 'stretch' }}
          />
        </View>

        {/* ── Main details card (overlaps header) ── */}
        <View style={{ marginTop: -20, zIndex: 1, paddingHorizontal: spacing.lg }}>
          <View style={cardStyle}>
            <DetailRow
              icon="wallet-outline"
              label={acctName}
              placeholder="Account"
              onPress={() => router.push({ pathname: './account-picker', params: { selectedId: acctId ?? '' } })}
            />
            <View style={dividerStyle} />

            <DetailRow
              icon="person-outline"
              label={payeeName}
              placeholder="Payee"
              onPress={() => router.push({ pathname: './payee-picker', params: { selectedId: payeeId ?? '', selectedName: payeeName, accountId: acctId ?? '' } })}
            />
            <View style={dividerStyle} />

            <DetailRow
              icon={isSplit ? 'git-branch-outline' : 'folder-outline'}
              label={isSplit ? `Split (${splitCategories!.length} categories)` : (categoryId ? categoryName : '')}
              placeholder="Category"
              onClear={categoryId && !isSplit ? () => { setCategoryId(null); setCategoryName(''); } : undefined}
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
            <View style={dividerStyle} />

            <DatePickerField
              dateInt={dateInt}
              dateStr={dateStr}
              onDateChange={(newInt, newStr) => { setDateInt(newInt); setDateStr(newStr); }}
            />
          </View>
        </View>

        {/* ── Notes card ── */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
          <View style={cardStyle}>
            <NotesField value={notes} onChangeText={setNotes} />
          </View>
        </View>

        {/* ── Status card (cleared + tags) ── */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
          <View style={cardStyle}>
            <ClearedToggle value={cleared} onValueChange={setCleared} />
            <View style={dividerStyle} />
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
          </View>
        </View>

        {/* ── Error banner ── */}
        {error && (
          <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
            <Banner message={error} variant="error" onDismiss={() => setError(null)} />
          </View>
        )}

        {/* ── Action buttons ── */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xl }}>
          <Button
            title={isEdit ? 'Save Changes' : 'Add Transaction'}
            onPress={handleSave}
            size="lg"
            loading={loading}
            disabled={cents === 0 || (!isEdit && !acctId)}
          />

          {isEdit && (
            <Button
              title="Delete Transaction"
              icon="trash-outline"
              variant="ghost"
              textColor={colors.negative}
              onPress={handleDelete}
              style={{ marginTop: spacing.sm }}
            />
          )}
        </View>
      </ScrollView>

      <KeyboardToolbar>
        <CalculatorToolbar
          onOperator={(op) => currencyInputRef.current?.injectOperator(op)}
          onEvaluate={() => currencyInputRef.current?.evaluate()}
        />
        <View style={{ flex: 1 }} />
        <GlassButton
          icon="checkmark"
          iconSize={16}
          variant="tinted"
          tintColor={colors.primary}
          onPress={() => Keyboard.dismiss()}
        />
      </KeyboardToolbar>
    </>
  );
}
