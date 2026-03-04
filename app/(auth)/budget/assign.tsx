import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SectionList, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '../../../src/presentation/providers/ThemeProvider';
import { useBudgetStore } from '../../../src/stores/budgetStore';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { IconButton } from '../../../src/presentation/components/atoms/IconButton';
import { Button } from '../../../src/presentation/components/atoms/Button';
import { CompactCurrencyInput, type CompactCurrencyInputRef } from '../../../src/presentation/components/atoms/CompactCurrencyInput';
import { formatBalance } from '../../../src/lib/format';

type CategorySection = {
  key: string;
  title: string;
  data: { id: string; name: string; budgeted: number }[];
};

export default function AssignBudgetScreen() {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { data, setAmount } = useBudgetStore();

  const toBudget = data?.toBudget ?? 0;
  const groups = data?.groups ?? [];

  // Local edits: categoryId → cents
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

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

  function updateEdit(catId: string, cents: number) {
    setEdits((prev) => ({ ...prev, [catId]: cents }));
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

  const labelStyle = {
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
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

      {/* Available / Remaining banner */}
      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          backgroundColor: colors.cardBackground,
          borderBottomWidth: bw.thin,
          borderBottomColor: colors.divider,
        }}
      >
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text variant="captionSm" color={colors.textMuted} style={labelStyle}>
            Available
          </Text>
          <Text
            variant="headingSm"
            color={toBudget > 0 ? colors.positive : toBudget < 0 ? colors.negative : colors.textMuted}
            style={{ fontVariant: ['tabular-nums'], marginTop: 2 }}
          >
            {formatBalance(toBudget)}
          </Text>
        </View>
        <View style={{ width: 1, height: 32, backgroundColor: colors.divider }} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text variant="captionSm" color={colors.textMuted} style={labelStyle}>
            Remaining
          </Text>
          <Text
            variant="headingSm"
            color={remaining > 0 ? colors.positive : remaining < 0 ? colors.negative : colors.textMuted}
            style={{ fontVariant: ['tabular-nums'], marginTop: 2 }}
          >
            {formatBalance(remaining)}
          </Text>
        </View>
      </View>

      {/* Quick actions */}
      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
          gap: spacing.sm,
          borderBottomWidth: bw.thin,
          borderBottomColor: colors.divider,
        }}
      >
        <View style={{ flex: 1 }}>
          <Button
            title="Hold"
            icon="calendar-outline"
            variant="secondary"
            size="sm"
            disabled
            onPress={() => {}}
            style={{ borderRadius: br.full }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Auto-assign"
            icon="sparkles-outline"
            variant="secondary"
            size="sm"
            disabled
            onPress={() => {}}
            style={{ borderRadius: br.full }}
          />
        </View>
      </View>

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
            paddingBottom: spacing.xxl,
            backgroundColor: colors.pageBackground,
            borderTopWidth: bw.thin,
            borderTopColor: colors.divider,
          }}
        >
          <Button
            title="Save Changes"
            icon="checkmark"
            variant="primary"
            size="lg"
            loading={saving}
            onPress={handleSave}
            style={{ borderRadius: br.full }}
          />
        </View>
      )}

      {/* Category list */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        renderSectionHeader={({ section }) => (
          <View
            style={{
              paddingHorizontal: spacing.lg,
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
        renderItem={({ item }) => (
          <CategoryAmountRow
            catId={item.id}
            name={item.name}
            value={edits[item.id] ?? 0}
            onChange={updateEdit}
          />
        )}
        contentContainerStyle={{ paddingBottom: hasChanges ? 120 : 40 }}
      />
    </View>
  );
}

// ── Category row with compact currency input ─────────────────────────────────

function CategoryAmountRow({
  catId,
  name,
  value,
  onChange,
}: {
  catId: string;
  name: string;
  value: number;
  onChange: (catId: string, cents: number) => void;
}) {
  const { colors, spacing, borderWidth: bw } = useTheme();
  const inputRef = useRef<CompactCurrencyInputRef>(null);

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: 10,
        backgroundColor: colors.cardBackground,
        borderBottomWidth: bw.thin,
        borderBottomColor: colors.divider,
      }}
    >
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
