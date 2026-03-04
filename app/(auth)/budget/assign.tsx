import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, SectionList, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../src/presentation/providers/ThemeProvider';
import { useBudgetStore } from '../../../src/stores/budgetStore';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { IconButton } from '../../../src/presentation/components/atoms/IconButton';
import { Button } from '../../../src/presentation/components/atoms/Button';
import { CompactCurrencyInput, type CompactCurrencyInputRef } from '../../../src/presentation/components/atoms/CompactCurrencyInput';
import { HoldModal } from '../../../src/presentation/components/budget/HoldModal';
import { Amount } from '../../../src/presentation/components/atoms/Amount';

type CategorySection = {
  key: string;
  title: string;
  data: { id: string; name: string; budgeted: number }[];
};

export default function AssignBudgetScreen() {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, setAmount, hold, resetHold } = useBudgetStore();

  const toBudget = data?.toBudget ?? 0;
  const buffered = data?.buffered ?? 0;
  const groups = data?.groups ?? [];

  // Local edits: categoryId → cents
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [holdModalVisible, setHoldModalVisible] = useState(false);
  const hapticFiredRef = useRef(false);

  // Initialize edits from current budget data
  useEffect(() => {
    const initial: Record<string, number> = {};
    for (const g of groups) {
      if (g.is_income) continue;
      for (const cat of g.categories) {
        initial[cat.id] = cat.budgeted;
      }
    }
    setEdits(initial);
  }, []);

  // Sections for expense groups only
  const sections = useMemo<CategorySection[]>(
    () =>
      groups
        .filter((g) => !g.is_income)
        .map((g) => ({
          key: g.id,
          title: g.name,
          data: g.categories.map((c) => ({ id: c.id, name: c.name, budgeted: c.budgeted })),
        })),
    [groups],
  );

  // Sum of all edited amounts in cents
  const totalAssigned = useMemo(() => {
    let sum = 0;
    for (const val of Object.values(edits)) {
      sum += val;
    }
    return sum;
  }, [edits]);

  // Original total budgeted (to compute delta)
  const originalBudgeted = useMemo(() => {
    let sum = 0;
    for (const g of groups) {
      if (g.is_income) continue;
      for (const cat of g.categories) {
        sum += cat.budgeted;
      }
    }
    return sum;
  }, [groups]);

  const remaining = toBudget - (totalAssigned - originalBudgeted);

  // Check if any category has been changed
  const hasChanges = useMemo(() => {
    for (const g of groups) {
      if (g.is_income) continue;
      for (const cat of g.categories) {
        if ((edits[cat.id] ?? 0) !== cat.budgeted) return true;
      }
    }
    return false;
  }, [edits, groups]);

  // Haptic when fully assigned
  useEffect(() => {
    if (remaining === 0 && hasChanges && !hapticFiredRef.current) {
      hapticFiredRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    if (remaining !== 0) {
      hapticFiredRef.current = false;
    }
  }, [remaining, hasChanges]);

  function updateEdit(catId: string, cents: number) {
    setEdits((prev) => ({ ...prev, [catId]: cents }));
  }

  async function handleAutoAssign() {
    setSaving(true);
    try {
      const result = await useBudgetStore.getState().applyGoals(false);
      // Refresh edits from newly computed budget
      const freshGroups = useBudgetStore.getState().data?.groups ?? [];
      const refreshed: Record<string, number> = {};
      for (const g of freshGroups) {
        if (g.is_income) continue;
        for (const cat of g.categories) {
          refreshed[cat.id] = cat.budgeted;
        }
      }
      setEdits(refreshed);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (result.applied === 0) {
        Alert.alert('No Changes', 'No categories with templates needed budgeting. Set goal targets on your categories first.');
      }
    } catch {
      Alert.alert('Error', 'Could not auto-assign budgets. Check that your categories have goals configured.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    for (const g of groups) {
      if (g.is_income) continue;
      for (const cat of g.categories) {
        const newCents = edits[cat.id] ?? 0;
        if (newCents !== cat.budgeted) {
          await setAmount(cat.id, newCents);
        }
      }
    }
    router.back();
  }

  // Color state based on remaining
  const remainingColor =
    remaining > 0 ? colors.primary : remaining < 0 ? colors.negative : colors.positive;
  const remainingIcon: keyof typeof Ionicons.glyphMap =
    remaining > 0 ? 'sparkles' : remaining < 0 ? 'warning' : 'checkmark-circle';
  const remainingLabel =
    remaining > 0 ? 'Ready to Assign' : remaining < 0 ? 'Overassigned' : 'Fully Assigned';

  const labelStyle = {
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    fontWeight: '700' as const,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
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
          headerRight: () => null,
        }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
      >
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <>
              {/* Summary Card */}
              <View
                style={{
                  marginHorizontal: spacing.lg,
                  marginTop: spacing.lg,
                  marginBottom: spacing.md,
                  backgroundColor: colors.cardBackground,
                  borderRadius: br.lg,
                  borderWidth: bw.thin,
                  borderColor: colors.cardBorder,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <Ionicons name={remainingIcon} size={22} color={remainingColor} />
                  <View style={{ flex: 1 }}>
                    <Amount value={toBudget} variant="headingLg" color={remainingColor} weight="700" />
                    <Text
                      variant="captionSm"
                      color={remainingColor}
                      style={{ opacity: 0.75, marginTop: 1 }}
                    >
                      {remainingLabel}
                    </Text>
                  </View>
                </View>

                <View
                  style={{
                    height: bw.thin,
                    backgroundColor: colors.divider,
                    marginVertical: spacing.sm,
                  }}
                />

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text variant="body" color={colors.textSecondary}>
                    Remaining
                  </Text>
                  <Amount value={remaining} variant="headingSm" color={remainingColor} weight="600" />
                </View>

                {/* Held for Next Month */}
                {buffered > 0 && (
                  <>
                    <View
                      style={{
                        height: bw.thin,
                        backgroundColor: colors.divider,
                        marginVertical: spacing.sm,
                      }}
                    />
                    <Pressable
                      onPress={() => {
                        Alert.alert(
                          'Reset Hold',
                          'Release held funds back to "Ready to Assign"?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Reset', style: 'destructive', onPress: () => resetHold() },
                          ],
                        );
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center' }}
                    >
                      <Ionicons name="arrow-forward" size={14} color={colors.primary} style={{ marginRight: spacing.sm }} />
                      <Text variant="bodySm" color={colors.textSecondary} style={{ flex: 1 }}>
                        Held for Next Month
                      </Text>
                      <Amount value={buffered} variant="body" color={colors.primary} weight="600" style={{ marginRight: spacing.sm }} />
                      <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                    </Pressable>
                  </>
                )}
              </View>

              {/* Quick Actions */}
              <View
                style={{
                  flexDirection: 'row',
                  paddingHorizontal: spacing.lg,
                  paddingBottom: spacing.md,
                  gap: spacing.sm,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Button
                    title="Hold"
                    icon="calendar-outline"
                    variant="secondary"
                    size="sm"
                    onPress={() => setHoldModalVisible(true)}
                    style={{ borderRadius: br.full }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Auto-assign"
                    icon="sparkles-outline"
                    variant="secondary"
                    size="sm"
                    loading={saving}
                    onPress={handleAutoAssign}
                    style={{ borderRadius: br.full }}
                  />
                </View>
              </View>
            </>
          }
          renderSectionHeader={({ section }) => (
            <View
              style={{
                paddingHorizontal: spacing.lg * 2,
                paddingTop: spacing.lg,
                paddingBottom: spacing.xs,
                backgroundColor: colors.pageBackground,
              }}
            >
              <Text variant="captionSm" color={colors.textMuted} style={labelStyle}>
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item, index, section }) => {
            const isFirst = index === 0;
            const isLast = index === section.data.length - 1;
            const isEdited = (edits[item.id] ?? 0) !== item.budgeted;
            return (
              <CategoryAmountRow
                catId={item.id}
                name={item.name}
                value={edits[item.id] ?? 0}
                onChange={updateEdit}
                isFirst={isFirst}
                isLast={isLast}
                isEdited={isEdited}
              />
            );
          }}
          contentContainerStyle={{ paddingBottom: hasChanges ? 120 : 40 }}
        />
      </KeyboardAvoidingView>

      {/* Save button — fixed, overlays above the list */}
      {hasChanges && (
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: Math.max(insets.bottom, spacing.md),
            backgroundColor: colors.pageBackground,
            borderTopWidth: bw.thin,
            borderTopColor: colors.divider,
          }}
        >
          <Button
            title={saving ? 'Saving...' : 'Save Changes'}
            icon="checkmark"
            variant="primary"
            size="lg"
            loading={saving}
            onPress={handleSave}
            style={{ borderRadius: br.full }}
          />
        </View>
      )}

      {/* Hold Modal */}
      <HoldModal
        visible={holdModalVisible}
        current={buffered}
        maxAmount={remaining + buffered}
        onSave={(cents) => hold(cents)}
        onClose={() => setHoldModalVisible(false)}
      />
    </View>
  );
}

// ── Category row with inset grouped styling ──────────────────────────────────

function CategoryAmountRow({
  catId,
  name,
  value,
  onChange,
  isFirst,
  isLast,
  isEdited,
}: {
  catId: string;
  name: string;
  value: number;
  onChange: (catId: string, cents: number) => void;
  isFirst: boolean;
  isLast: boolean;
  isEdited: boolean;
}) {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const inputRef = useRef<CompactCurrencyInputRef>(null);

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        minHeight: 44,
        marginHorizontal: spacing.lg,
        backgroundColor: colors.cardBackground,
        borderTopLeftRadius: isFirst ? br.lg : 0,
        borderTopRightRadius: isFirst ? br.lg : 0,
        borderBottomLeftRadius: isLast ? br.lg : 0,
        borderBottomRightRadius: isLast ? br.lg : 0,
        borderBottomWidth: isLast ? 0 : bw.thin,
        borderBottomColor: colors.divider,
      }}
    >
      {isEdited && (
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 8,
            bottom: 8,
            width: 3,
            borderRadius: br.full,
            backgroundColor: colors.primary,
          }}
        />
      )}
      <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
        {name}
      </Text>
      <CompactCurrencyInput
        ref={inputRef}
        value={value}
        onChangeValue={(cents) => onChange(catId, cents)}
      />
    </Pressable>
  );
}
