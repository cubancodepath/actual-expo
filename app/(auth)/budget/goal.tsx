import { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, Pressable, ScrollView, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Host, DatePicker, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { datePickerStyle, frame, pickerStyle, tag, tint } from '@expo/ui/swift-ui/modifiers';
import { useTheme } from '../../../src/presentation/providers/ThemeProvider';
import { useCategoriesStore } from '../../../src/stores/categoriesStore';
import { useBudgetStore } from '../../../src/stores/budgetStore';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { Button } from '../../../src/presentation/components/atoms/Button';
import { IconButton } from '../../../src/presentation/components/atoms/IconButton';
import { Card } from '../../../src/presentation/components/atoms/Card';
import { ListItem } from '../../../src/presentation/components/molecules/ListItem';
import { Divider } from '../../../src/presentation/components/atoms/Divider';
import { CurrencyInput, type CurrencyInputRef } from '../../../src/presentation/components/atoms/CurrencyInput';
import { CalculatorToolbar } from '../../../src/presentation/components/atoms/CalculatorToolbar';
import { GlassButton } from '../../../src/presentation/components/atoms/GlassButton';
import { KeyboardToolbar } from '../../../src/presentation/components/molecules/KeyboardToolbar';
import { getGoalTemplates, setGoalTemplates } from '../../../src/goals';
import { updateGoalIndicator } from '../../../src/goals/apply';
import { amountToInteger, integerToAmount } from '../../../src/goals/engine';
import { batchMessages } from '../../../src/sync';
import { formatDateLong } from '../../../src/lib/date';
import type { Template } from '../../../src/goals/types';

// ---------------------------------------------------------------------------
// Type options
// ---------------------------------------------------------------------------

type GoalType =
  | 'simple' | 'goal' | 'by' | 'average'
  | 'copy' | 'periodic' | 'spend' | 'percentage'
  | 'remainder' | 'limit';

const TYPE_OPTIONS: { value: GoalType; label: string }[] = [
  { value: 'simple', label: 'Monthly' },
  { value: 'goal', label: 'Balance Target' },
  { value: 'by', label: 'By Date' },
  { value: 'average', label: 'Average' },
  { value: 'copy', label: 'Copy' },
  { value: 'periodic', label: 'Periodic' },
  { value: 'spend', label: 'Spend By' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'remainder', label: 'Remainder' },
  { value: 'limit', label: 'Spending Limit' },
];

const TYPE_DESCRIPTIONS: Record<GoalType, string> = {
  simple: 'Budget a fixed amount each month, or refill to a target. E.g. $200/month for groceries.',
  goal: 'Track progress toward a savings target. Shows a progress bar but does not auto-budget.',
  by: 'Save a total amount by a specific date, split evenly across the remaining months.',
  average: 'Budget based on what you actually spent over the last few months.',
  copy: 'Reuse the same budget you set a few months ago.',
  periodic: 'Budget for recurring events. E.g. $50 every 2 weeks.',
  spend: 'Spread a target amount across a date range. E.g. save $1,200 between Jan–Dec.',
  percentage: 'Budget a percentage of your income. E.g. save 10% of your paycheck.',
  remainder: 'Gets whatever is left after all other categories are budgeted.',
  limit: 'Cap spending for this category. Optionally refill it automatically.',
};

const AVG_OPTIONS = ['3 months', '6 months', '12 months'];
const AVG_VALUES = [3, 6, 12];

const PERIOD_OPTIONS = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
];

const LIMIT_PERIOD_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

function getDefaultTargetDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 6, 1);
}

function dateToMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function dateToInt(d: Date): number {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return parseInt(`${y}${m}${day}`, 10);
}

// ---------------------------------------------------------------------------
// Reusable picker row — renders a ListItem with a SwiftUI menu picker on the right
// ---------------------------------------------------------------------------

function MenuPickerRow<T extends string | number>({
  label,
  selection,
  options,
  onSelectionChange,
  pickerWidth = 180,
}: {
  label: string;
  selection: T;
  options: { value: T; label: string }[];
  onSelectionChange: (value: T) => void;
  pickerWidth?: number;
}) {
  const { colors } = useTheme();
  return (
    <ListItem
      title={label}
      right={
        <Host matchContents>
          <Picker
            selection={selection}
            onSelectionChange={(val) => onSelectionChange(val as T)}
            modifiers={[pickerStyle('menu'), tint(colors.primary), frame({ minWidth: pickerWidth, alignment: 'trailing' })]}
          >
            {options.map((opt) => (
              <SwiftText key={String(opt.value)} modifiers={[tag(opt.value)]}>
                {opt.label}
              </SwiftText>
            ))}
          </Picker>
        </Host>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function GoalEditorScreen() {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const currencyInputRef = useRef<CurrencyInputRef>(null);

  // Common state
  const [goalType, setGoalType] = useState<GoalType>('simple');
  const [amountCents, setAmountCents] = useState(0);

  // Simple-specific: "set aside" (false) vs "refill to" (true)
  const [simpleRefill, setSimpleRefill] = useState(false);

  // By-specific
  const [targetDate, setTargetDate] = useState<Date>(getDefaultTargetDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [byRepeat, setByRepeat] = useState(false);

  // Average-specific
  const [avgIndex, setAvgIndex] = useState(0);

  // Copy-specific
  const [lookBack, setLookBack] = useState(1);

  // Periodic-specific
  const [periodicPeriod, setPeriodicPeriod] = useState<'day' | 'week' | 'month' | 'year'>('month');
  const [periodicInterval, setPeriodicInterval] = useState(1);
  const [periodicStart, setPeriodicStart] = useState<Date | null>(null);
  const [showPeriodicStartPicker, setShowPeriodicStartPicker] = useState(false);

  // Spend-specific
  const [spendFromDate, setSpendFromDate] = useState<Date>(() => new Date());
  const [spendToDate, setSpendToDate] = useState<Date>(getDefaultTargetDate);
  const [showSpendFromPicker, setShowSpendFromPicker] = useState(false);
  const [showSpendToPicker, setShowSpendToPicker] = useState(false);
  const [spendRepeat, setSpendRepeat] = useState(false);

  // Percentage-specific
  const [percent, setPercent] = useState(10);
  const [percentCategory, setPercentCategory] = useState('all-income');
  const [percentPrevious, setPercentPrevious] = useState(false);

  // Remainder-specific
  const [weight, setWeight] = useState(1);

  // Limit-specific
  const [limitPeriod, setLimitPeriod] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [limitHold, setLimitHold] = useState(false);
  const [limitRefill, setLimitRefill] = useState(false);

  // Income categories for percentage picker
  const categories = useCategoriesStore((s) => s.categories);
  const groups = useCategoriesStore((s) => s.groups);
  const incomeCategories = categories.filter((c) => {
    const group = groups.find((g) => g.id === c.cat_group);
    return group?.is_income && !c.tombstone;
  });

  // Load existing template
  useEffect(() => {
    if (!categoryId) return;
    (async () => {
      const templates = await getGoalTemplates(categoryId);
      if (templates.length === 0) return;
      setIsEditing(true);

      // Detect refill templates — these map to Monthly with refill toggle:
      // - `simple` with `limit` but no `monthly` (#template up to X)
      // - legacy `[limit, refill]` pair from older Expo saves
      const simpleWithLimitOnly = templates.find(
        (t): t is import('../../../src/goals/types').SimpleTemplate =>
          t.type === 'simple' && !!t.limit && t.monthly == null,
      );
      if (simpleWithLimitOnly?.limit) {
        setGoalType('simple');
        setAmountCents(amountToInteger(simpleWithLimitOnly.limit.amount));
        setSimpleRefill(true);
        return;
      }

      // Legacy: [limit, refill] pair → convert to Monthly+refill
      const hasRefill = templates.some(t => t.type === 'refill');
      const limitT = templates.find(t => t.type === 'limit');
      if (hasRefill && limitT) {
        setGoalType('simple');
        setAmountCents(amountToInteger(limitT.amount));
        setSimpleRefill(true);
        return;
      }

      const t = templates[0];
      if (t.type === 'refill' || t.type === 'limit') return;
      setGoalType(t.type);

      switch (t.type) {
        case 'simple':
          setAmountCents(t.monthly != null ? amountToInteger(t.monthly) : 0);
          break;
        case 'goal':
          setAmountCents(amountToInteger(t.amount));
          break;
        case 'by': {
          setAmountCents(amountToInteger(t.amount));
          const [y, m] = t.month.split('-').map(Number);
          setTargetDate(new Date(y, m - 1, 1));
          if (t.repeat) setByRepeat(true);
          break;
        }
        case 'average':
          setAvgIndex(AVG_VALUES.indexOf(t.numMonths));
          break;
        case 'copy':
          setLookBack(t.lookBack);
          break;
        case 'periodic':
          setAmountCents(amountToInteger(t.amount));
          setPeriodicPeriod(t.period.period);
          setPeriodicInterval(t.period.amount);
          if (t.starting) setPeriodicStart(new Date(t.starting));
          break;
        case 'spend': {
          setAmountCents(amountToInteger(t.amount));
          const [ty, tm] = t.month.split('-').map(Number);
          setSpendToDate(new Date(ty, tm - 1, 1));
          const [fy, fm] = t.from.split('-').map(Number);
          setSpendFromDate(new Date(fy, fm - 1, 1));
          if (t.repeat) setSpendRepeat(true);
          break;
        }
        case 'percentage':
          setPercent(t.percent);
          setPercentCategory(t.category);
          setPercentPrevious(t.previous);
          break;
        case 'remainder':
          setWeight(t.weight);
          break;
      }
    })();
  }, [categoryId]);

  function buildTemplates(): Template[] {
    const displayAmount = integerToAmount(amountCents);

    switch (goalType) {
      case 'simple':
        if (simpleRefill) {
          // "#template up to X" — refill to amount
          return [{
            type: 'simple', limit: { amount: displayAmount, hold: false, period: 'monthly' as const },
            priority: 0, directive: 'template' as const,
          }];
        }
        // "#template X" — fixed monthly amount
        return [{ type: 'simple', monthly: displayAmount, priority: 0, directive: 'template' }];
      case 'goal':
        return [{ type: 'goal', amount: displayAmount, directive: 'goal' }];
      case 'by':
        return [{
          type: 'by', amount: displayAmount, month: dateToMonth(targetDate),
          ...(byRepeat ? { repeat: 12, annual: true } : {}),
          priority: 0, directive: 'template',
        }];
      case 'average':
        return [{ type: 'average', numMonths: AVG_VALUES[avgIndex], priority: 0, directive: 'template' }];
      case 'copy':
        return [{ type: 'copy', lookBack, priority: 0, directive: 'template' }];
      case 'periodic':
        return [{
          type: 'periodic', amount: displayAmount,
          period: { period: periodicPeriod, amount: periodicInterval },
          ...(periodicStart ? { starting: periodicStart.toISOString().slice(0, 10) } : {}),
          priority: 0, directive: 'template',
        }];
      case 'spend':
        return [{
          type: 'spend', amount: displayAmount,
          month: dateToMonth(spendToDate), from: dateToMonth(spendFromDate),
          ...(spendRepeat ? { repeat: 12, annual: true } : {}),
          priority: 0, directive: 'template',
        }];
      case 'percentage':
        return [{
          type: 'percentage', percent, previous: percentPrevious,
          category: percentCategory, priority: 0, directive: 'template',
        }];
      case 'remainder':
        return [{ type: 'remainder', weight, directive: 'template' }];
      case 'limit': {
        // Pure spending cap: "#template 0 up to X" — no auto-budgeting
        return [{
          type: 'simple' as const,
          monthly: 0,
          limit: { amount: displayAmount, hold: limitHold, period: limitPeriod },
          priority: 0,
          directive: 'template' as const,
        }];
      }
    }
  }

  const canSave = (() => {
    switch (goalType) {
      case 'simple': case 'goal': case 'by': case 'periodic': case 'spend': case 'limit':
        return amountCents > 0;
      case 'percentage':
        return percent > 0;
      case 'average': case 'copy': case 'remainder':
        return true;
    }
  })();

  async function handleSave() {
    if (!categoryId || saving) return;
    setSaving(true);
    try {
      const catNames = new Map(categories.map(c => [c.id, c.name]));
      await batchMessages(async () => {
        await setGoalTemplates(categoryId, buildTemplates(), catNames);
      });
      // Update goal indicator AFTER batchMessages so it reads the fresh goal_def
      await updateGoalIndicator(useBudgetStore.getState().month, categoryId);
      await useBudgetStore.getState().load();
      router.back();
    } catch {
      Alert.alert('Could Not Save', 'An error occurred while saving. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!categoryId) return;
    Alert.alert('Remove Target', 'Are you sure you want to remove this goal target?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            await setGoalTemplates(categoryId, []);
            await useCategoriesStore.getState().load();
            await useBudgetStore.getState().load();
            router.back();
          } catch {
            Alert.alert('Error', 'Could not remove the target. Please try again.');
          }
        },
      },
    ]);
  }

  // ---------------------------------------------------------------------------
  // Shared sub-components
  // ---------------------------------------------------------------------------

  function DateRow({
    label, date, show, onToggle, onDateChange,
  }: {
    label: string; date: Date; show: boolean;
    onToggle: () => void; onDateChange: (d: Date) => void;
  }) {
    return (
      <>
        <ListItem
          title={label}
          right={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text variant="body" color={colors.primary}>
                {formatDateLong(dateToInt(date))}
              </Text>
              <Ionicons
                name={show ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.textMuted}
              />
            </View>
          }
          onPress={onToggle}
        />
        {show && (
          <View style={{ paddingHorizontal: spacing.md }}>
            <Host matchContents={{ vertical: true }}>
              <DatePicker
                selection={date}
                displayedComponents={['date']}
                modifiers={[datePickerStyle('graphical'), tint(colors.primary)]}
                onDateChange={(d) => { onDateChange(d); onToggle(); }}
              />
            </Host>
          </View>
        )}
      </>
    );
  }

  function ToggleRow({ label, value, onValueChange }: {
    label: string; value: boolean; onValueChange: (v: boolean) => void;
  }) {
    return (
      <ListItem
        title={label}
        right={
          <Switch
            value={value}
            onValueChange={onValueChange}
            trackColor={{ false: colors.divider, true: colors.primary }}
          />
        }
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
    <ScrollView
      style={{ backgroundColor: colors.pageBackground }}
      contentContainerStyle={{ padding: spacing.lg, paddingTop: 72 }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{
          headerLeft: () => (
            <IconButton icon="close" size={22} color={colors.headerText} onPress={() => router.back()} />
          ),
        }}
      />

      {/* ── Type selector ──────────────────────────────────────── */}
      <Card style={{ padding: 0, overflow: 'hidden' as const, marginBottom: spacing.sm }}>
        <MenuPickerRow
          label="Goal Type"
          selection={goalType}
          options={TYPE_OPTIONS}
          onSelectionChange={setGoalType}
          pickerWidth={220}
        />
      </Card>
      <Text
        variant="captionSm"
        color={colors.textMuted}
        style={{ marginBottom: spacing.lg, paddingHorizontal: spacing.xs }}
      >
        {TYPE_DESCRIPTIONS[goalType]}
      </Text>

      {/* ── Type-specific fields ───────────────────────────────── */}
      <Card style={{ padding: 0, overflow: 'hidden' as const }}>
        {/* Simple */}
        {goalType === 'simple' && (
          <View>
            <View style={{ padding: spacing.md }}>
              <Text variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.xs }}>
                {simpleRefill ? 'Refill to' : 'Monthly amount'}
              </Text>
              <CurrencyInput ref={currencyInputRef} value={amountCents} onChangeValue={setAmountCents} type="income" autoFocus />
            </View>
            <Divider />
            <ToggleRow
              label="Refill mode"
              value={simpleRefill}
              onValueChange={setSimpleRefill}
            />
            <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
              <Text variant="captionSm" color={colors.textMuted}>
                {simpleRefill
                  ? 'Budget only what\'s needed to bring the balance back up to the target. If you have leftover from last month, less will be budgeted.'
                  : 'Budget the full amount every month, regardless of the current balance.'}
              </Text>
            </View>
          </View>
        )}

        {/* Goal */}
        {goalType === 'goal' && (
          <View style={{ padding: spacing.md }}>
            <Text variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.xs }}>
              Target balance
            </Text>
            <CurrencyInput value={amountCents} onChangeValue={setAmountCents} type="income" autoFocus />
          </View>
        )}

        {/* By */}
        {goalType === 'by' && (
          <View>
            <View style={{ padding: spacing.md }}>
              <Text variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.xs }}>
                Target amount
              </Text>
              <CurrencyInput ref={currencyInputRef} value={amountCents} onChangeValue={setAmountCents} type="income" autoFocus />
            </View>
            <Divider />
            <DateRow
              label="Target date"
              date={targetDate}
              show={showDatePicker}
              onToggle={() => setShowDatePicker(!showDatePicker)}
              onDateChange={setTargetDate}
            />
            <Divider />
            <ToggleRow label="Repeat annually" value={byRepeat} onValueChange={setByRepeat} />
          </View>
        )}

        {/* Average */}
        {goalType === 'average' && (
          <View style={{ padding: spacing.md }}>
            <Text variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.sm }}>
              Look-back period
            </Text>
            <Host matchContents>
              <Picker
                selection={AVG_VALUES[avgIndex]}
                onSelectionChange={(val) => setAvgIndex(AVG_VALUES.indexOf(val as number))}
                modifiers={[pickerStyle('segmented'), tint(colors.primary)]}
              >
                {AVG_VALUES.map((v, i) => (
                  <SwiftText key={v} modifiers={[tag(v)]}>{AVG_OPTIONS[i]}</SwiftText>
                ))}
              </Picker>
            </Host>
          </View>
        )}

        {/* Copy */}
        {goalType === 'copy' && (
          <MenuPickerRow
            label="Copy from"
            selection={lookBack}
            options={Array.from({ length: 12 }, (_, i) => ({
              value: i + 1,
              label: `${i + 1} month${i > 0 ? 's' : ''} ago`,
            }))}
            onSelectionChange={setLookBack}
          />
        )}

        {/* Periodic */}
        {goalType === 'periodic' && (
          <View>
            <View style={{ padding: spacing.md }}>
              <Text variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.xs }}>
                Amount per occurrence
              </Text>
              <CurrencyInput ref={currencyInputRef} value={amountCents} onChangeValue={setAmountCents} type="income" autoFocus />
            </View>
            <Divider />
            <MenuPickerRow
              label="Frequency"
              selection={periodicPeriod}
              options={PERIOD_OPTIONS.map((o) => ({ value: o.value as typeof periodicPeriod, label: o.label }))}
              onSelectionChange={setPeriodicPeriod}
            />
            <Divider />
            <MenuPickerRow
              label="Every"
              selection={periodicInterval}
              options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1}` }))}
              onSelectionChange={setPeriodicInterval}
            />
            <Divider />
            <DateRow
              label="Starting date"
              date={periodicStart ?? new Date()}
              show={showPeriodicStartPicker}
              onToggle={() => setShowPeriodicStartPicker(!showPeriodicStartPicker)}
              onDateChange={setPeriodicStart}
            />
            {periodicStart && (
              <Pressable
                onPress={() => setPeriodicStart(null)}
                style={{ padding: spacing.md, paddingTop: 0 }}
              >
                <Text variant="captionSm" color={colors.primary}>Clear start date</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Spend */}
        {goalType === 'spend' && (
          <View>
            <View style={{ padding: spacing.md }}>
              <Text variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.xs }}>
                Target amount
              </Text>
              <CurrencyInput ref={currencyInputRef} value={amountCents} onChangeValue={setAmountCents} type="income" autoFocus />
            </View>
            <Divider />
            <DateRow
              label="Starting from"
              date={spendFromDate}
              show={showSpendFromPicker}
              onToggle={() => setShowSpendFromPicker(!showSpendFromPicker)}
              onDateChange={setSpendFromDate}
            />
            <Divider />
            <DateRow
              label="Spend by"
              date={spendToDate}
              show={showSpendToPicker}
              onToggle={() => setShowSpendToPicker(!showSpendToPicker)}
              onDateChange={setSpendToDate}
            />
            <Divider />
            <ToggleRow label="Repeat annually" value={spendRepeat} onValueChange={setSpendRepeat} />
          </View>
        )}

        {/* Percentage */}
        {goalType === 'percentage' && (
          <View>
            <MenuPickerRow
              label="Percentage"
              selection={percent}
              options={[5, 10, 15, 20, 25, 30, 40, 50, 75, 100].map((v) => ({
                value: v, label: `${v}%`,
              }))}
              onSelectionChange={setPercent}
            />
            <Divider />
            <MenuPickerRow
              label="Of income from"
              selection={percentCategory}
              options={[
                { value: 'all-income', label: 'All Income' },
                ...incomeCategories.map((c) => ({ value: c.id, label: c.name })),
              ]}
              onSelectionChange={setPercentCategory}
            />
            <Divider />
            <ToggleRow
              label="Use last month"
              value={percentPrevious}
              onValueChange={setPercentPrevious}
            />
          </View>
        )}

        {/* Remainder */}
        {goalType === 'remainder' && (
          <View>
            <MenuPickerRow
              label="Weight"
              selection={weight}
              options={Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: `${i + 1}` }))}
              onSelectionChange={setWeight}
            />
            <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
              <Text variant="captionSm" color={colors.textMuted}>
                Higher weight means a larger share of the remaining budget.
              </Text>
            </View>
          </View>
        )}

        {/* Limit */}
        {goalType === 'limit' && (
          <View>
            <View style={{ padding: spacing.md }}>
              <Text variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.xs }}>
                Maximum spending
              </Text>
              <CurrencyInput ref={currencyInputRef} value={amountCents} onChangeValue={setAmountCents} type="income" autoFocus />
            </View>
            <Divider />
            <View style={{ padding: spacing.md }}>
              <Text variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.sm }}>
                Reset period
              </Text>
              <Host matchContents>
                <Picker
                  selection={limitPeriod}
                  onSelectionChange={(val) => setLimitPeriod(val as typeof limitPeriod)}
                  modifiers={[pickerStyle('segmented'), tint(colors.primary)]}
                >
                  {LIMIT_PERIOD_OPTIONS.map((opt) => (
                    <SwiftText key={opt.value} modifiers={[tag(opt.value)]}>{opt.label}</SwiftText>
                  ))}
                </Picker>
              </Host>
            </View>
            <Divider />
            <ToggleRow
              label="Keep surplus"
              value={limitHold}
              onValueChange={setLimitHold}
            />
            <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>
              <Text variant="captionSm" color={colors.textMuted}>
                {limitHold
                  ? `If you spend less than ${amountCents > 0 ? '$' + integerToAmount(amountCents) : 'the limit'}, the leftover rolls into next ${limitPeriod === 'daily' ? 'day' : limitPeriod === 'weekly' ? 'week' : 'month'}.`
                  : `Unspent budget is removed at the end of each ${limitPeriod === 'daily' ? 'day' : limitPeriod === 'weekly' ? 'week' : 'month'}.`}
              </Text>
            </View>
            <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
              <Text variant="captionSm" color={colors.textMuted}>
                This sets a spending cap. Use "Monthly" with refill mode instead if you want to auto-budget up to a target.
              </Text>
            </View>
          </View>
        )}
      </Card>

      {/* ── Save / Delete ──────────────────────────────────────── */}
      <Button
        title={isEditing ? 'Save Target' : 'Add Target'}
        variant="primary"
        onPress={handleSave}
        disabled={!canSave}
        loading={saving}
        style={{ marginTop: spacing.xl, borderRadius: 999 }}
      />

      {isEditing && (
        <View style={{ marginTop: spacing.xl }}>
          <Button
            title="Remove Target"
            variant="ghost"
            icon="trash-outline"
            textColor={colors.negative}
            onPress={handleDelete}
          />
        </View>
      )}
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
