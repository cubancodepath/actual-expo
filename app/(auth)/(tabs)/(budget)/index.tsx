import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
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
import { KeyboardToolbar } from '../../../../src/presentation/components/molecules/KeyboardToolbar';
import { useBudgetStore } from '../../../../src/stores/budgetStore';
import { useRefreshControl } from '../../../../src/presentation/hooks/useRefreshControl';
import { useKeyboardHeight } from '../../../../src/presentation/hooks/useKeyboardHeight';
import type { BudgetCategory, BudgetGroup } from '../../../../src/budgets/types';

import { BudgetGroupHeader } from '../../../../src/presentation/components/budget/BudgetGroupHeader';
import { BudgetCategoryRow } from '../../../../src/presentation/components/budget/BudgetCategoryRow';
import { ReadyToAssignPill } from '../../../../src/presentation/components/budget/ReadyToAssignPill';
import { OverspentPill } from '../../../../src/presentation/components/budget/OverspentPill';
import { Text } from '../../../../src/presentation/components/atoms/Text';
import { Amount } from '../../../../src/presentation/components/atoms/Amount';
import { Button } from '../../../../src/presentation/components/atoms/Button';
import { formatPrivacyAware } from '../../../../src/lib/format';
import { usePrivacyStore } from '../../../../src/stores/privacyStore';
import { usePrefsStore } from '../../../../src/stores/prefsStore';
import { useTabBarStore } from '../../../../src/stores/tabBarStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

function filterBudgetGroups(groups: BudgetGroup[], filter: BudgetFilter, showHidden: boolean): BudgetGroup[] {
  return groups
    .filter((g) => showHidden || !g.hidden)
    .map((g) => ({
      ...g,
      categories: g.categories.filter((c) =>
        (showHidden || !c.hidden) && matchesFilter(c, filter),
      ),
    }))
    .filter((g) => filter === 'all' || g.categories.length > 0);
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function BudgetScreen() {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const { month, data, loading, load, setAmount, setCarryover, resetHold } = useBudgetStore();
  const { refreshControlProps } = useRefreshControl();
  const { privacyMode, toggle: togglePrivacy } = usePrivacyStore();
  const { showProgressBars, toggleProgressBars, showHiddenCategories, toggleShowHiddenCategories } = usePrefsStore();

  const fabCollapsed = useSharedValue(false);
  const COLLAPSE_THRESHOLD = 100;
  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    fabCollapsed.value = e.nativeEvent.contentOffset.y > COLLAPSE_THRESHOLD;
  }, []);

  const [filter, setFilter] = useState<BudgetFilter>('all');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // -- Inline budget editing (global edit mode) --
  const [editMode, setEditMode] = useState(false);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  // -- Collapsible groups --
  function toggleGroup(groupId: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  // -- Keyboard tracking --
  const { visible: keyboardVisible } = useKeyboardHeight();

  // -- Reset filter on month change --
  useEffect(() => { setFilter('all'); }, [month]);

  // -- Sections (filtered) --
  const filteredGroups = useMemo(
    () => filterBudgetGroups(data?.groups ?? [], filter, showHiddenCategories),
    [data?.groups, filter, showHiddenCategories],
  );
  const sections: BudgetSection[] = filteredGroups.map((g) => ({
    key: g.id,
    title: g.name,
    group: g,
    data: collapsedGroups.has(g.id) ? [] : g.categories,
  }));

  // -- Move money --
  function handleMoveMoney(cat: BudgetCategory) {
    router.push({
      pathname: '/(auth)/budget/move-money',
      params: { catId: cat.id, catName: cat.name, balance: String(cat.balance) },
    });
  }

  function handleToggleCarryover(cat: BudgetCategory) {
    setCarryover(cat.id, !cat.carryover);
  }

  function handleCategoryLongPress(cat: BudgetCategory) {
    // Android fallback — iOS uses zeego context menu in BudgetCategoryRow
    const toggleLabel = cat.carryover ? 'Remove overspending rollover' : 'Rollover overspending';
    Alert.alert(cat.name, undefined, [
      { text: 'Move Money', onPress: () => handleMoveMoney(cat) },
      { text: toggleLabel, onPress: () => handleToggleCarryover(cat) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  // -- Global edit mode --
  function enterEditMode() {
    if (editMode) return;
    const initial: Record<string, number> = {};
    for (const g of data?.groups ?? []) {
      if (g.is_income) continue;
      for (const cat of g.categories) {
        initial[cat.id] = cat.budgeted;
      }
    }
    setEdits(initial);
    setEditMode(true);
    useTabBarStore.getState().setHidden(true);
  }

  function handleCategoryPress(_cat: BudgetCategory) {
    if (!editMode) enterEditMode();
  }

  function handleEditChange(catId: string, cents: number) {
    setEdits((prev) => ({ ...prev, [catId]: cents }));
  }

  async function handleSaveEdits() {
    setSaving(true);
    try {
      const groups = data?.groups ?? [];
      for (const g of groups) {
        if (g.is_income) continue;
        for (const cat of g.categories) {
          const newCents = edits[cat.id] ?? 0;
          if (newCents !== cat.budgeted) {
            await setAmount(cat.id, newCents);
          }
        }
      }
      setEditMode(false);
      setEdits({});
      useTabBarStore.getState().setHidden(false);
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdits() {
    setEditMode(false);
    setEdits({});
    useTabBarStore.getState().setHidden(false);
  }

  const hasEdits = useMemo(() => {
    if (!editMode) return false;
    for (const g of data?.groups ?? []) {
      if (g.is_income) continue;
      for (const cat of g.categories) {
        if ((edits[cat.id] ?? cat.budgeted) !== cat.budgeted) return true;
      }
    }
    return false;
  }, [editMode, edits, data]);

  // -- Budget assignment balance --
  const toBudget = data?.toBudget ?? 0;

  // -- Overspent categories --
  const overspentCategories = useMemo(() => {
    if (!data) return [];
    return data.groups
      .filter((g) => !g.is_income)
      .flatMap((g) =>
        g.categories
          .filter((c) => c.balance < 0 && !c.carryover)
          .map((c) => ({ id: c.id, name: c.name, balance: c.balance, groupName: g.name })),
      );
  }, [data]);
  const overspentCount = overspentCategories.length;
  const overspentTotal = overspentCategories.reduce((sum, c) => sum + c.balance, 0);


  function handleOverspentPress() {
    router.push('/(auth)/budget/cover-overspent');
  }

  // -- Render helpers --
  function renderSectionHeader({ section }: { section: BudgetSection }) {
    return (
      <View style={section.group.hidden ? { opacity: 0.5 } : undefined}>
        <BudgetGroupHeader
          group={section.group}
          isCollapsed={collapsedGroups.has(section.group.id)}
          onToggle={() => toggleGroup(section.group.id)}
        />
      </View>
    );
  }

  function renderItem({ item: cat, index, section }: { item: BudgetCategory; index: number; section: BudgetSection }) {
    const isExpenseEdit = editMode && !section.group.is_income;
    return (
      <View style={cat.hidden ? { opacity: 0.5 } : undefined}>
      <BudgetCategoryRow
        cat={cat}
        isIncome={section.group.is_income}
        isFirst={index === 0}
        isLast={index === section.data.length - 1}
        editing={isExpenseEdit}
        editValue={isExpenseEdit ? (edits[cat.id] ?? cat.budgeted) : undefined}
        onPress={handleCategoryPress}
        onLongPress={handleCategoryLongPress}
        onMoveMoney={handleMoveMoney}
        onToggleCarryover={handleToggleCarryover}
        onEditChange={handleEditChange}
        showProgressBar={showProgressBars}
      />
      </View>
    );
  }

  const editToolbarButtons = (
    <>
      <View style={{ flex: 1 }}>
        <Button
          title="Cancel"
          variant="secondary"
          onPress={() => { Keyboard.dismiss(); handleCancelEdits(); }}
          style={{ borderRadius: br.full }}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Button
          title={saving ? 'Saving...' : 'Save'}
          icon="checkmark"
          variant="primary"
          loading={saving}
          disabled={!hasEdits}
          onPress={() => { Keyboard.dismiss(); handleSaveEdits(); }}
          style={{ borderRadius: br.full }}
        />
      </View>
    </>
  );

  return (
    <>
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      {/* Sticky status area — stays fixed above the list */}
      {data && (toBudget !== 0 || data.buffered > 0) && (
        <View style={{ paddingTop: spacing.sm, paddingBottom: spacing.xs }}>
          {toBudget !== 0 && (
            <ReadyToAssignPill
              amount={toBudget}
              onPress={() => router.push('/(auth)/budget/assign')}
            />
          )}
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
      )}

      {/* Budget list */}
      {loading && !data ? (
        <ActivityIndicator color={colors.link} style={{ marginTop: 40 }} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled
          onScroll={handleScroll}
          scrollEventThrottle={16}
          extraData={`${[...collapsedGroups].join()}-${editMode}-${JSON.stringify(edits)}`}
          ListHeaderComponent={
            data && overspentCount > 0 ? (
              <View style={{ paddingTop: spacing.xs, paddingBottom: spacing.xs }}>
                <OverspentPill
                  count={overspentCount}
                  onPress={handleOverspentPress}
                />
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
          contentContainerStyle={{ paddingBottom: editMode ? 100 : 80 }}
        />
      )}

      {!editMode && <AddTransactionButton collapsed={fabCollapsed} />}
    </View>

    {/* Edit mode toolbar — always mounted to track keyboard height */}
    <KeyboardToolbar visible={editMode && keyboardVisible}>
      {editToolbarButtons}
    </KeyboardToolbar>

    {/* Fixed bottom toolbar when keyboard is closed */}
    {editMode && !keyboardVisible && (
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          flexDirection: 'row',
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingTop: spacing.sm,
          paddingBottom: safeBottom + spacing.sm,
        }}
      >
        {editToolbarButtons}
      </View>
    )}
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
          icon={showProgressBars ? 'line.3.horizontal' : 'line.3.horizontal'}
          onPress={toggleProgressBars}
        >
          {showProgressBars ? 'Hide Progress' : 'Show Progress'}
        </Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction
          icon={showHiddenCategories ? 'square.stack.3d.up.slash' : 'square.stack.3d.up'}
          onPress={toggleShowHiddenCategories}
        >
          {showHiddenCategories ? 'Hide Hidden Categories' : 'Show Hidden Categories'}
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
