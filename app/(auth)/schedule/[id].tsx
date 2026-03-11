import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Pressable, Switch, useColorScheme, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, interpolate } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useAccountsStore } from '../../../src/stores/accountsStore';
import { usePayeesStore } from '../../../src/stores/payeesStore';
import { useCategoriesStore } from '../../../src/stores/categoriesStore';
import { useSchedulesStore } from '../../../src/stores/schedulesStore';
import { usePickerStore } from '../../../src/stores/pickerStore';
import { useUndoStore } from '../../../src/stores/undoStore';
import {
  getScheduleById,
  getStatus,
  getScheduledAmount,
  getRecurringDescription,
} from '../../../src/schedules';
import { withOpacity } from '../../../src/lib/colors';
import { useTheme } from '../../../src/presentation/providers/ThemeProvider';
import { Button } from '../../../src/presentation/components/atoms/Button';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { GlassButton } from '../../../src/presentation/components/atoms/GlassButton';
import { CurrencyInput, type CurrencyInputRef } from '../../../src/presentation/components/atoms/CurrencyInput';
import { ScheduleStatusBadge } from '../../../src/presentation/components/atoms/ScheduleStatusBadge';
import { KeyboardToolbar } from '../../../src/presentation/components/molecules/KeyboardToolbar';
import { CalculatorToolbar } from '../../../src/presentation/components/atoms/CalculatorToolbar';
import { Banner } from '../../../src/presentation/components/molecules/Banner';
import { TypeToggle, type TransactionType } from '../../../src/presentation/components/transaction/TypeToggle';
import { DetailRow } from '../../../src/presentation/components/transaction/DetailRow';
import type { Schedule, RecurConfig, RuleCondition, RuleAction } from '../../../src/schedules/types';

export default function ScheduleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { update, delete_, skip, postTransaction, load } = useSchedulesStore();
  const payees = usePayeesStore((s) => s.payees);
  const accounts = useAccountsStore((s) => s.accounts);
  const { groups: categoryGroups } = useCategoriesStore();

  // Picker store
  const selectedPayee = usePickerStore((s) => s.selectedPayee);
  const selectedAccount = usePickerStore((s) => s.selectedAccount);
  const selectedCategory = usePickerStore((s) => s.selectedCategory);
  const selectedRecurConfig = usePickerStore((s) => s.selectedRecurConfig);
  const clearPicker = usePickerStore((s) => s.clear);

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [type, setType] = useState<TransactionType>('expense');
  const [cents, setCents] = useState(0);
  const [name, setName] = useState('');
  const [payeeId, setPayeeId] = useState<string | null>(null);
  const [payeeName, setPayeeName] = useState('');
  const [acctId, setAcctId] = useState<string | null>(null);
  const [acctName, setAcctName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [postsTransaction, setPostsTransaction] = useState(false);
  const [recurConfig, setRecurConfig] = useState<RecurConfig | null>(null);
  const currencyRef = useRef<CurrencyInputRef>(null);
  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const blurContainerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 50], [0, 1], 'clamp'),
  }));

  // Initial values for change detection
  const [initial, setInitial] = useState<{
    type: TransactionType;
    cents: number;
    name: string | null;
    payeeId: string | null;
    acctId: string | null;
    categoryId: string | null;
    postsTransaction: boolean;
    recurConfig: RecurConfig | null;
  } | null>(null);

  const payeeMap = useMemo(
    () => new Map(payees.map((p) => [p.id, p.name])),
    [payees],
  );
  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );
  const categoryMap = useMemo(
    () => {
      const m = new Map<string, string>();
      for (const g of categoryGroups) {
        for (const c of g.categories ?? []) {
          m.set(c.id, c.name);
        }
      }
      return m;
    },
    [categoryGroups],
  );

  // Load schedule once on mount (not on focus — avoids overwriting picker selections)
  useEffect(() => {
    if (!id) return;
    clearPicker();

    (async () => {
      setLoading(true);
      try {
        const s = await getScheduleById(id);
        if (s) {
          setSchedule(s);
          setName(s.name ?? '');
          setPostsTransaction(s.posts_transaction);

          const amt = getScheduledAmount(s._amount);
          const isIncome = amt > 0;
          setType(isIncome ? 'income' : 'expense');
          setCents(Math.abs(amt));

          const pId = s._payee ?? null;
          setPayeeId(pId);
          setPayeeName(pId ? (payeeMap.get(pId) ?? '') : '');

          const aId = s._account ?? null;
          setAcctId(aId);
          setAcctName(aId ? (accountMap.get(aId) ?? '') : '');

          const cId = s._category ?? null;
          setCategoryId(cId);
          setCategoryName(cId ? (categoryMap.get(cId) ?? '') : '');

          const rc = s._date && typeof s._date === 'object' && 'frequency' in s._date
            ? (s._date as RecurConfig)
            : null;
          setRecurConfig(rc);

          setInitial({
            type: isIncome ? 'income' : 'expense',
            cents: Math.abs(amt),
            name: s.name ?? null,
            payeeId: pId,
            acctId: aId,
            categoryId: cId,
            postsTransaction: s.posts_transaction,
            recurConfig: rc,
          });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Sync picker selections
  useEffect(() => {
    if (selectedPayee) {
      setPayeeId(selectedPayee.id);
      setPayeeName(selectedPayee.name);
    }
  }, [selectedPayee]);

  useEffect(() => {
    if (selectedAccount) {
      setAcctId(selectedAccount.id);
      setAcctName(selectedAccount.name);
    }
  }, [selectedAccount]);

  useEffect(() => {
    if (selectedCategory) {
      setCategoryId(selectedCategory.id);
      setCategoryName(selectedCategory.name);
    }
  }, [selectedCategory]);

  useEffect(() => {
    if (selectedRecurConfig) {
      setRecurConfig(selectedRecurConfig);
    }
  }, [selectedRecurConfig]);

  const status = schedule ? getStatus(schedule.next_date, schedule.completed, false) : null;
  const isRecurring = recurConfig != null;
  const recurDesc = isRecurring ? getRecurringDescription(recurConfig) : '';

  // Change detection
  const hasChanges = initial != null && (
    type !== initial.type ||
    cents !== initial.cents ||
    (name.trim() || null) !== initial.name ||
    payeeId !== initial.payeeId ||
    acctId !== initial.acctId ||
    categoryId !== initial.categoryId ||
    postsTransaction !== initial.postsTransaction ||
    JSON.stringify(recurConfig) !== JSON.stringify(initial.recurConfig)
  );

  // ── Header colors based on type ──
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

  async function handleSave() {
    if (!schedule || !acctId) return;

    Keyboard.dismiss();
    setError(null);
    setSaving(true);

    try {
      const conditions: RuleCondition[] = [];

      if (payeeId) {
        conditions.push({ field: 'payee', op: 'is', value: payeeId });
      }
      conditions.push({ field: 'account', op: 'is', value: acctId });

      const signedAmount = type === 'expense' ? -Math.abs(cents) : Math.abs(cents);
      conditions.push({ field: 'amount', op: 'is', value: signedAmount });

      if (recurConfig) {
        conditions.push({ field: 'date', op: 'isapprox', value: recurConfig });
      }

      const recurrenceChanged =
        JSON.stringify(recurConfig) !== JSON.stringify(initial?.recurConfig);

      const actions: RuleAction[] = categoryId
        ? [{ op: 'set', field: 'category', value: categoryId }]
        : [];

      await update({
        schedule: {
          id: schedule.id,
          name: name.trim() || null,
          posts_transaction: postsTransaction,
        },
        conditions,
        actions,
        resetNextDate: recurrenceChanged,
      });
      load();
      router.dismiss();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update schedule');
    } finally {
      setSaving(false);
    }
  }

  function handleSkip() {
    Alert.alert('Skip Next Date', 'Move to the following occurrence?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Skip',
        onPress: async () => {
          await skip(schedule!.id);
          load();
          useUndoStore.getState().showUndo('Date skipped');
        },
      },
    ]);
  }

  function handlePostNow() {
    Alert.alert(
      'Post Transaction',
      'Create a transaction for this schedule now?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Post',
          onPress: async () => {
            await postTransaction(schedule!.id);
            load();
            useUndoStore.getState().showUndo('Transaction posted');
          },
        },
      ],
    );
  }

  function handleComplete() {
    Alert.alert(
      'Complete Schedule',
      'Mark this schedule as completed? It will no longer generate transactions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            await update({
              schedule: { id: schedule!.id, completed: true },
            });
            load();
            router.dismiss();
          },
        },
      ],
    );
  }

  function handleDelete() {
    Alert.alert('Delete Schedule', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await delete_(schedule!.id);
          load();
          useUndoStore.getState().showUndo('Schedule deleted');
          router.dismiss();
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      <Animated.ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        onScroll={scrollHandler}
        scrollEventThrottle={16}
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
          <View style={{ alignSelf: 'stretch', marginTop: spacing.lg }}>
            <TypeToggle type={type} onChangeType={setType} />
          </View>

          <CurrencyInput
            ref={currencyRef}
            value={cents}
            onChangeValue={(v) => { setCents(v); setError(null); }}
            type={type}
            color={headerText}
            style={{ paddingVertical: spacing.sm, alignSelf: 'stretch' }}
          />

          {status && <ScheduleStatusBadge status={status} />}
        </View>

        {/* ── Details card ── */}
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
              icon="folder-outline"
              label={categoryName}
              placeholder="Category"
              onClear={categoryId ? () => { setCategoryId(null); setCategoryName(''); } : undefined}
              onPress={() => router.push({ pathname: './category-picker', params: { selectedId: categoryId ?? '', hideSplit: '1' } })}
            />
            <View style={dividerStyle} />

            <DetailRow
              icon="repeat"
              label={recurDesc}
              placeholder="Repeat"
              onClear={recurConfig ? () => setRecurConfig(null) : undefined}
              onPress={() => {
                router.push({
                  pathname: './recurrence',
                  params: recurConfig ? { config: JSON.stringify(recurConfig) } : {},
                });
              }}
            />
          </View>
        </View>

        {/* ── Settings card ── */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
          <View style={cardStyle}>
            <DetailRow
              icon="text-outline"
              label={name}
              placeholder="Name"
              onPress={() => {
                Alert.prompt('Schedule Name', 'Optional display name', (text) => {
                  if (text !== undefined) setName(text);
                }, 'plain-text', name);
              }}
              onClear={name ? () => setName('') : undefined}
            />
            <View style={dividerStyle} />

            <Pressable
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.md,
                minHeight: 44,
              }}
              onPress={() => setPostsTransaction(!postsTransaction)}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Text variant="body" color={colors.textPrimary}>
                  Auto-post Transaction
                </Text>
              </View>
              <Switch
                value={postsTransaction}
                onValueChange={setPostsTransaction}
                trackColor={{ false: colors.inputBorder, true: colors.primary }}
                thumbColor={colors.cardBackground}
                ios_backgroundColor={colors.inputBorder}
              />
            </Pressable>
          </View>
        </View>

        {/* ── Error banner ── */}
        {error && (
          <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
            <Banner message={error} variant="error" onDismiss={() => setError(null)} />
          </View>
        )}

        {/* ── Buttons ── */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xl, gap: spacing.sm }}>
          <Button
            title="Save Changes"
            onPress={handleSave}
            size="lg"
            loading={saving}
            disabled={!hasChanges || saving}
          />

          {isRecurring && (
            <Button
              title="Skip Next Date"
              icon="play-forward-outline"
              variant="ghost"
              onPress={handleSkip}
            />
          )}

          <Button
            title="Post Transaction Now"
            icon="checkmark-circle-outline"
            variant="ghost"
            onPress={handlePostNow}
          />

          {schedule && !schedule.completed && (
            <Button
              title="Complete Schedule"
              icon="flag-outline"
              variant="ghost"
              onPress={handleComplete}
            />
          )}

          <Button
            title="Delete Schedule"
            icon="trash-outline"
            variant="ghost"
            textColor={colors.negative}
            onPress={handleDelete}
          />
        </View>
      </Animated.ScrollView>

      {/* ── Fixed top blur: fades in on scroll like Apple nav bars ── */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
          },
          blurContainerStyle,
        ]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={[colors.pageBackground + 'B3', colors.pageBackground + '1A', 'transparent']}
          style={{ height: 70 }}
        />
      </Animated.View>

      {/* Close button */}
      <View style={{ position: 'absolute', top: 12, left: spacing.md, zIndex: 11 }}>
        <GlassButton icon="xmark" onPress={() => router.dismiss()} />
      </View>

      {/* Title */}
      <View style={{ position: 'absolute', top: 12, left: 0, right: 0, height: 48, justifyContent: 'center', alignItems: 'center', zIndex: 11, pointerEvents: 'none' }}>
        <Text variant="body" color={colors.textPrimary} style={{ fontWeight: '600' }}>
          Edit Schedule
        </Text>
      </View>

      <KeyboardToolbar>
        <CalculatorToolbar
          onOperator={(op) => currencyRef.current?.injectOperator(op)}
          onEvaluate={() => currencyRef.current?.evaluate()}
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
    </View>
  );
}
