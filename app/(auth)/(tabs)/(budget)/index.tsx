import { useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  SectionList,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../../../src/presentation/providers/ThemeProvider';
import { AddTransactionButton } from '../../../../src/presentation/components/molecules/AddTransactionButton';
import { useBudgetStore } from '../../../../src/stores/budgetStore';
import { useSyncStore } from '../../../../src/stores/syncStore';
import type { BudgetCategory, BudgetGroup } from '../../../../src/budgets/types';

import { ReadyToAssignPill } from '../../../../src/presentation/components/budget/ReadyToAssignPill';
import { BudgetSummaryBar } from '../../../../src/presentation/components/budget/BudgetSummaryBar';
import { BudgetGroupHeader } from '../../../../src/presentation/components/budget/BudgetGroupHeader';
import { BudgetCategoryRow } from '../../../../src/presentation/components/budget/BudgetCategoryRow';
import { MoveMoneyModal, type MoveMoneyMode, type MoveMoneyCategory } from '../../../../src/presentation/components/budget/MoveMoneyModal';
import { Text } from '../../../../src/presentation/components/atoms/Text';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BudgetSection = {
  key: string;
  title: string;
  group: BudgetGroup;
  data: BudgetCategory[];
};

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function BudgetScreen() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const { month, data, loading, load, setAmount, setCarryover, transfer } = useBudgetStore();
  const { refreshing, sync } = useSyncStore();

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [moveMoneyTarget, setMoveMoneyTarget] = useState<{
    catId: string; catName: string; balance: number; mode: MoveMoneyMode;
  } | null>(null);

  // -- Collapsible groups --
  function toggleGroup(groupId: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  // -- Sections --
  const sections: BudgetSection[] = (data?.groups ?? []).map((g) => ({
    key: g.id,
    title: g.name,
    group: g,
    data: collapsedGroups.has(g.id) ? [] : g.categories,
  }));

  // -- Move money --
  const moveMoneyCandidates = useMemo<MoveMoneyCategory[]>(() => {
    if (!data || !moveMoneyTarget) return [];
    return data.groups
      .filter((g) => !g.is_income)
      .flatMap((g) =>
        g.categories
          .filter((c) => {
            if (c.id === moveMoneyTarget.catId) return false;
            if (moveMoneyTarget.mode === 'cover') return c.balance > 0;
            return true;
          })
          .map((c) => ({ id: c.id, name: c.name, balance: c.balance, groupName: g.name })),
      );
  }, [data, moveMoneyTarget]);

  async function handleMoveMoneyConfirm(otherCategoryId: string, amountCents: number) {
    if (!moveMoneyTarget) return;
    const { catId, mode } = moveMoneyTarget;
    const fromId = mode === 'transfer' ? catId : otherCategoryId;
    const toId = mode === 'transfer' ? otherCategoryId : catId;
    setMoveMoneyTarget(null);
    await transfer(fromId, toId, amountCents);
  }

  function handleBalancePress(cat: BudgetCategory) {
    if (cat.balance === 0) return;
    setMoveMoneyTarget({
      catId: cat.id,
      catName: cat.name,
      balance: cat.balance,
      mode: cat.balance > 0 ? 'transfer' : 'cover',
    });
  }

  function handleCategoryLongPress(cat: BudgetCategory) {
    const toggleLabel = cat.carryover ? 'Remove overspending rollover' : 'Rollover overspending';
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [toggleLabel, 'Cancel'], cancelButtonIndex: 1 },
        (idx) => { if (idx === 0) setCarryover(cat.id, !cat.carryover); },
      );
    } else {
      Alert.alert(cat.name, undefined, [
        { text: toggleLabel, onPress: () => setCarryover(cat.id, !cat.carryover) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  // -- Render helpers --
  function renderSectionHeader({ section }: { section: BudgetSection }) {
    return (
      <BudgetGroupHeader
        group={section.group}
        isCollapsed={collapsedGroups.has(section.group.id)}
        onToggle={() => toggleGroup(section.group.id)}
      />
    );
  }

  function renderItem({ item: cat, section }: { item: BudgetCategory; section: BudgetSection }) {
    return (
      <BudgetCategoryRow
        cat={cat}
        isIncome={section.group.is_income}
        onLongPress={handleCategoryLongPress}
        onBalancePress={handleBalancePress}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      {/* Ready to Assign + Summary */}
      {data && (
        <ReadyToAssignPill
          amount={data.toBudget}
          onPress={() => router.push('/(auth)/budget/assign')}
        />
      )}
      {data && (
        <BudgetSummaryBar
          income={data.income}
          budgeted={data.budgeted}
          spent={data.spent}
        />
      )}

      {/* Move Money Modal */}
      <MoveMoneyModal
        visible={!!moveMoneyTarget}
        mode={moveMoneyTarget?.mode ?? 'transfer'}
        sourceName={moveMoneyTarget?.catName ?? ''}
        prefilledAmount={Math.abs(moveMoneyTarget?.balance ?? 0)}
        candidates={moveMoneyCandidates}
        onClose={() => setMoveMoneyTarget(null)}
        onConfirm={handleMoveMoneyConfirm}
      />

      {/* Budget list */}
      {loading && !data ? (
        <ActivityIndicator color={colors.link} style={{ marginTop: 40 }} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          extraData={collapsedGroups}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={sync}
              tintColor={colors.link}
              colors={[colors.link]}
            />
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 80, gap: 8 }}>
              <Text variant="bodyLg" color={colors.textSecondary}>No categories yet</Text>
              <Text variant="bodySm" color={colors.textMuted}>Sync to load budget data</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 80 }}
        />
      )}

      <AddTransactionButton iconOnly />
    </View>
  );
}
