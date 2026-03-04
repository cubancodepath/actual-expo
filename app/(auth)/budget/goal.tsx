import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Host, DatePicker, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { datePickerStyle, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useTheme } from '../../../src/presentation/providers/ThemeProvider';
import { useCategoriesStore } from '../../../src/stores/categoriesStore';
import { useBudgetStore } from '../../../src/stores/budgetStore';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { Button } from '../../../src/presentation/components/atoms/Button';
import { IconButton } from '../../../src/presentation/components/atoms/IconButton';
import { CurrencyInput } from '../../../src/presentation/components/atoms/CurrencyInput';
import { getGoalTemplates, setGoalTemplates } from '../../../src/goals';
import { amountToInteger, integerToAmount } from '../../../src/goals/engine';
import { formatDateLong } from '../../../src/lib/date';
import type { Template } from '../../../src/goals/types';

type GoalType = 'simple' | 'goal' | 'by' | 'average';

const TYPE_LABELS = ['Monthly', 'Balance', 'By Date', 'Average'];
const TYPE_KEYS: GoalType[] = ['simple', 'goal', 'by', 'average'];

const TYPE_DESCRIPTIONS: Record<GoalType, string> = {
  simple: 'Budget a fixed amount each month.',
  goal: 'Track progress toward a target balance. Does not auto-budget.',
  by: 'Save toward a target amount by a specific date, split evenly across remaining months.',
  average: 'Budget based on your average spending over recent months.',
};

const AVG_OPTIONS = ['3 months', '6 months', '12 months'];
const AVG_VALUES = [3, 6, 12];

function getDefaultTargetDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 6, 1);
}

/** Extract YYYY-MM from a Date */
function dateToMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Convert a Date to YYYYMMDD int for display */
function dateToInt(d: Date): number {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return parseInt(`${y}${m}${day}`, 10);
}

export default function GoalEditorScreen() {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [typeIndex, setTypeIndex] = useState(0);
  const goalType = TYPE_KEYS[typeIndex];
  const [amountCents, setAmountCents] = useState(0);

  // By-specific
  const [targetDate, setTargetDate] = useState<Date>(getDefaultTargetDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [byRepeat, setByRepeat] = useState(false);

  // Average-specific
  const [avgIndex, setAvgIndex] = useState(0);

  // Load existing template
  useEffect(() => {
    if (!categoryId) return;
    (async () => {
      const templates = await getGoalTemplates(categoryId);
      if (templates.length === 0) return;
      const t = templates[0];
      setIsEditing(true);
      setTypeIndex(TYPE_KEYS.indexOf(t.type));

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
      }
    })();
  }, [categoryId]);

  function buildTemplate(): Template {
    const displayAmount = integerToAmount(amountCents);

    switch (goalType) {
      case 'simple':
        return {
          type: 'simple',
          monthly: displayAmount,
          priority: 0,
          directive: 'template',
        };
      case 'goal':
        return {
          type: 'goal',
          amount: displayAmount,
          directive: 'goal',
        };
      case 'by':
        return {
          type: 'by',
          amount: displayAmount,
          month: dateToMonth(targetDate),
          ...(byRepeat ? { repeat: 12, annual: true } : {}),
          priority: 0,
          directive: 'template',
        };
      case 'average':
        return {
          type: 'average',
          numMonths: AVG_VALUES[avgIndex],
          priority: 0,
          directive: 'template',
        };
    }
  }

  async function handleSave() {
    if (!categoryId || saving) return;
    setSaving(true);
    try {
      await setGoalTemplates(categoryId, [buildTemplate()]);
      await useCategoriesStore.getState().load();
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
    Alert.alert(
      'Remove Target',
      'Are you sure you want to remove this goal target?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
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
      ],
    );
  }

  const canSave = goalType === 'average' || amountCents > 0;

  const labelStyle = {
    marginBottom: spacing.xs,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.headerBackground }}
      contentContainerStyle={{ padding: spacing.lg, paddingTop: 72 }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{
          headerLeft: () => (
            <IconButton
              icon="close"
              size={22}
              color={colors.headerText}
              onPress={() => router.back()}
            />
          ),
        }}
      />

      {/* Type Picker — native segmented control */}
      <Text variant="caption" color={colors.textMuted} style={labelStyle}>
        Goal type
      </Text>
      <Host matchContents>
        <Picker
          selection={goalType}
          onSelectionChange={(val) => setTypeIndex(TYPE_KEYS.indexOf(val as GoalType))}
          modifiers={[pickerStyle('segmented')]}
        >
          {TYPE_KEYS.map((key, i) => (
            <SwiftText key={key} modifiers={[tag(key)]}>{TYPE_LABELS[i]}</SwiftText>
          ))}
        </Picker>
      </Host>
      <Text
        variant="captionSm"
        color={colors.textMuted}
        style={{ marginTop: spacing.xs, marginBottom: spacing.xl }}
      >
        {TYPE_DESCRIPTIONS[goalType]}
      </Text>

      {/* Type-specific fields */}
      {goalType === 'simple' && (
        <View>
          <Text variant="caption" color={colors.textMuted} style={labelStyle}>
            Monthly amount
          </Text>
          <CurrencyInput
            value={amountCents}
            onChangeValue={setAmountCents}
            type="income"
            autoFocus
          />
        </View>
      )}

      {goalType === 'goal' && (
        <View>
          <Text variant="caption" color={colors.textMuted} style={labelStyle}>
            Target balance
          </Text>
          <CurrencyInput
            value={amountCents}
            onChangeValue={setAmountCents}
            type="income"
            autoFocus
          />
        </View>
      )}

      {goalType === 'by' && (
        <View>
          <Text variant="caption" color={colors.textMuted} style={labelStyle}>
            Target amount
          </Text>
          <CurrencyInput
            value={amountCents}
            onChangeValue={setAmountCents}
            type="income"
            autoFocus
          />

          <Text
            variant="caption"
            color={colors.textMuted}
            style={[labelStyle, { marginTop: spacing.lg }]}
          >
            Target date
          </Text>
          {/* Date row — tap to expand graphical picker */}
          <Pressable
            onPress={() => setShowDatePicker(!showDatePicker)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: colors.cardBackground,
              borderRadius: br.md,
              borderWidth: bw.thin,
              borderColor: colors.divider,
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.md,
              minHeight: 44,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
              <Text variant="body" color={colors.textPrimary}>
                {formatDateLong(dateToInt(targetDate))}
              </Text>
            </View>
            <Ionicons
              name={showDatePicker ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.textMuted}
            />
          </Pressable>
          {showDatePicker && (
            <View style={{ marginTop: spacing.sm }}>
              <Host matchContents={{ vertical: true }}>
                <DatePicker
                  selection={targetDate}
                  displayedComponents={['date']}
                  modifiers={[datePickerStyle('graphical')]}
                  onDateChange={(date) => {
                    setTargetDate(date);
                    setShowDatePicker(false);
                  }}
                />
              </Host>
            </View>
          )}

          {/* Repeat toggle */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: spacing.lg,
              minHeight: 44,
            }}
          >
            <Text variant="body" color={colors.textPrimary}>
              Repeat annually
            </Text>
            <Switch
              value={byRepeat}
              onValueChange={setByRepeat}
              trackColor={{ false: colors.divider, true: colors.primary }}
              accessibilityLabel="Repeat annually"
            />
          </View>
        </View>
      )}

      {goalType === 'average' && (
        <View>
          <Text variant="caption" color={colors.textMuted} style={labelStyle}>
            Look-back period
          </Text>
          <Host matchContents>
            <Picker
              selection={AVG_VALUES[avgIndex]}
              onSelectionChange={(val) => setAvgIndex(AVG_VALUES.indexOf(val as number))}
              modifiers={[pickerStyle('segmented')]}
            >
              {AVG_VALUES.map((v, i) => (
                <SwiftText key={v} modifiers={[tag(v)]}>{AVG_OPTIONS[i]}</SwiftText>
              ))}
            </Picker>
          </Host>
        </View>
      )}

      {/* Save */}
      <Button
        title={isEditing ? 'Save Target' : 'Add Target'}
        variant="primary"
        onPress={handleSave}
        disabled={!canSave}
        loading={saving}
        style={{ marginTop: spacing.xl, borderRadius: 999 }}
      />

      {/* Delete — ghost style, separated */}
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
  );
}
