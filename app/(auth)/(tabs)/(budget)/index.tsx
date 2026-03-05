import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '../../../../src/presentation/providers/ThemeProvider';
import { useSharedValue } from 'react-native-reanimated';
import { AddTransactionButton } from '../../../../src/presentation/components/molecules/AddTransactionButton';
import { useBudgetStore } from '../../../../src/stores/budgetStore';
import { useRefreshControl } from '../../../../src/presentation/hooks/useRefreshControl';
import type { BudgetCategory, BudgetGroup } from '../../../../src/budgets/types';

import { BudgetGroupHeader } from '../../../../src/presentation/components/budget/BudgetGroupHeader';
import { BudgetCategoryRow } from '../../../../src/presentation/components/budget/BudgetCategoryRow';
import { MoveMoneyModal, type MoveMoneyMode, type MoveMoneyCategory } from '../../../../src/presentation/components/budget/MoveMoneyModal';
import { ReadyToAssignPill } from '../../../../src/presentation/components/budget/ReadyToAssignPill';
import { Text } from '../../../../src/presentation/components/atoms/Text';
import { Amount } from '../../../../src/presentation/components/atoms/Amount';
import { formatPrivacyAware } from '../../../../src/lib/format';
import { usePrivacyStore } from '../../../../src/stores/privacyStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BudgetFilter = 'all' | 'underfunded' | 'overfunded' | 'has-money';

type BudgetSection = {
  key: string;
  title: string;
  group: BudgetGroup;
  data: BudgetCategory[];
};

// ---------------------------------------------------------------------------
// Filter logic
// ---------------------------------------------------------------------------

function matchesFilter(cat: BudgetCategory, filter: BudgetFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'underfunded':
      return cat.goal !== null && cat.balance < cat.goal;
    case 'overfunded':
      if (cat.goal !== null) return cat.balance > cat.goal;
      return cat.balance > 0 && cat.budgeted > 0;
    case 'has-money':
      return cat.balance > 0;
  }
}

function filterBudgetGroups(groups: BudgetGroup[], filter: BudgetFilter): BudgetGroup[] {
  if (filter === 'all') return groups;
  return groups
    .map((g) => ({ ...g, categories: g.categories.filter((c) => matchesFilter(c, filter)) }))
    .filter((g) => g.categories.length > 0);
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function BudgetScreen() {
  const { colors, spacing, borderRadius: br } = useTheme();
  const router = useRouter();
  const { month, data, loading, load, setAmount, setCarryover, transfer, resetHold } = useBudgetStore();
  const { refreshControlProps } = useRefreshControl();
  const { privacyMode, toggle: togglePrivacy } = usePrivacyStore();

  const fabCollapsed = useSharedValue(false);
  const COLLAPSE_THRESHOLD = 100;
  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    fabCollapsed.value = e.nativeEvent.contentOffset.y > COLLAPSE_THRESHOLD;
  }, []);

  const [filter, setFilter] = useState<BudgetFilter>('all');
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

  // -- Reset filter on month change --
  useEffect(() => { setFilter('all'); }, [month]);

  // -- Sections (filtered) --
  const filteredGroups = useMemo(
    () => filterBudgetGroups(data?.groups ?? [], filter),
    [data?.groups, filter],
  );
  const sections: BudgetSection[] = filteredGroups.map((g) => ({
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

  // -- Budget assignment balance --
  const toBudget = data?.toBudget ?? 0;

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

  function renderItem({ item: cat, index, section }: { item: BudgetCategory; index: number; section: BudgetSection }) {
    return (
      <BudgetCategoryRow
        cat={cat}
        isIncome={section.group.is_income}
        isFirst={index === 0}
        isLast={index === section.data.length - 1}
        onLongPress={handleCategoryLongPress}
        onBalancePress={handleBalancePress}
      />
    );
  }

  return (
    <>
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
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
          onScroll={handleScroll}
          scrollEventThrottle={16}
          extraData={collapsedGroups}
          ListHeaderComponent={
            data ? (
              <View style={{ paddingTop: spacing.sm, paddingBottom: spacing.xs }}>
                {/* Budget assignment status pill — always visible, tappable when actionable */}
                {toBudget !== 0 && (
                  <ReadyToAssignPill
                    amount={toBudget}
                    onPress={() => router.push('/(auth)/budget/assign')}
                  />
                )}

                {/* Held for next month — discrete caption */}
                {data.buffered > 0 && (
                  <Pressable
                    onPress={() =>
                      Alert.alert(
                        'Reset Hold',
                        'Release held funds back to "Ready to Assign"?',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Reset', style: 'destructive', onPress: () => resetHold() },
                        ],
                      )
                    }
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: spacing.xs,
                      gap: spacing.xxs,
                    }}
                  >
                    <Ionicons name="arrow-forward" size={11} color={colors.textMuted} />
                    <Text variant="captionSm" color={colors.textMuted}>
                      Holding{' '}
                    </Text>
                    <Amount value={data.buffered} variant="captionSm" color={colors.textMuted} weight="600" />
                    <Text variant="captionSm" color={colors.textMuted}>
                      {' '}for next month
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl {...refreshControlProps} />
          }
          ListEmptyComponent={
            filter !== 'all' ? (
              <View style={{ alignItems: 'center', marginTop: 80, gap: 8 }}>
                <Ionicons name="funnel-outline" size={32} color={colors.textMuted} />
                <Text variant="bodyLg" color={colors.textSecondary}>No matching categories</Text>
                <Text variant="bodySm" color={colors.textMuted}>Try a different filter or switch to All</Text>
              </View>
            ) : (
              <View style={{ alignItems: 'center', marginTop: 80, gap: 8 }}>
                <Text variant="bodyLg" color={colors.textSecondary}>No categories yet</Text>
                <Text variant="bodySm" color={colors.textMuted}>Sync to load budget data</Text>
              </View>
            )
          }
          contentContainerStyle={{ paddingBottom: 80 }}
        />
      )}

      <AddTransactionButton collapsed={fabCollapsed} />
    </View>
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Menu
        icon={filter === 'all' ? 'line.3.horizontal.decrease' : 'line.3.horizontal.decrease.circle.fill'}
        tintColor={filter !== 'all' ? colors.primary : undefined}
        title="Filter"
      >
        <Stack.Toolbar.MenuAction isOn={filter === 'all'} icon="list.bullet" onPress={() => setFilter('all')}>
          All
        </Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction isOn={filter === 'underfunded'} icon="arrow.down.circle" onPress={() => setFilter('underfunded')}>
          Underfunded
        </Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction isOn={filter === 'overfunded'} icon="arrow.up.circle" onPress={() => setFilter('overfunded')}>
          Overfunded
        </Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction isOn={filter === 'has-money'} icon="banknote" onPress={() => setFilter('has-money')}>
          Money Available
        </Stack.Toolbar.MenuAction>
      </Stack.Toolbar.Menu>
      <Stack.Toolbar.Menu icon="ellipsis">
        <Stack.Toolbar.MenuAction
          icon={privacyMode ? 'eye' : 'eye.slash'}
          onPress={togglePrivacy}
        >
          {privacyMode ? 'Show Amounts' : 'Hide Amounts'}
        </Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction
          icon="gearshape"
          onPress={() => router.push('/(auth)/settings')}
        >
          Settings
        </Stack.Toolbar.MenuAction>
      </Stack.Toolbar.Menu>
    </Stack.Toolbar>
    </>
  );
}
