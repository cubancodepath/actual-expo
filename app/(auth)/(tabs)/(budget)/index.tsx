import { useCallback, useMemo, useState } from 'react';
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
import { useSyncStore } from '../../../../src/stores/syncStore';
import type { BudgetCategory, BudgetGroup } from '../../../../src/budgets/types';

import { BudgetGroupHeader } from '../../../../src/presentation/components/budget/BudgetGroupHeader';
import { BudgetCategoryRow } from '../../../../src/presentation/components/budget/BudgetCategoryRow';
import { MoveMoneyModal, type MoveMoneyMode, type MoveMoneyCategory } from '../../../../src/presentation/components/budget/MoveMoneyModal';
import { Text } from '../../../../src/presentation/components/atoms/Text';
import { Amount } from '../../../../src/presentation/components/atoms/Amount';
import { formatPrivacyAware } from '../../../../src/lib/format';
import { usePrivacyStore } from '../../../../src/stores/privacyStore';

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
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { month, data, loading, load, setAmount, setCarryover, transfer, resetHold } = useBudgetStore();
  const { refreshing, sync } = useSyncStore();
  const { privacyMode, toggle: togglePrivacy } = usePrivacyStore();

  const fabCollapsed = useSharedValue(false);
  const COLLAPSE_THRESHOLD = 100;
  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    fabCollapsed.value = e.nativeEvent.contentOffset.y > COLLAPSE_THRESHOLD;
  }, []);

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

  // -- Summary card colors --
  const toBudget = data?.toBudget ?? 0;
  const pillColor =
    toBudget > 0 ? colors.primary : toBudget < 0 ? colors.negative : colors.positive;
  const pillIcon: keyof typeof Ionicons.glyphMap =
    toBudget > 0 ? 'sparkles' : toBudget < 0 ? 'warning' : 'checkmark-circle';
  const pillLabel =
    toBudget > 0 ? 'Ready to Assign' : toBudget < 0 ? 'Overassigned' : 'Fully Assigned';

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

  const labelStyle = {
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    fontWeight: '700' as const,
  };

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
              <>
                {/* Summary Card */}
                <Pressable
                  onPress={() => router.push('/(auth)/budget/assign')}
                  style={({ pressed }) => pressed && { opacity: 0.8 }}
                  accessibilityLabel={`${formatPrivacyAware(toBudget)} ${pillLabel}. Tap to assign budget.`}
                  accessibilityRole="button"
                >
                  <View
                    style={{
                      marginHorizontal: spacing.lg,
                      marginTop: spacing.lg,
                      backgroundColor: colors.cardBackground,
                      borderRadius: br.lg,
                      borderWidth: bw.thin,
                      borderColor: colors.cardBorder,
                      paddingHorizontal: spacing.lg,
                      paddingVertical: spacing.md,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                      <Ionicons name={pillIcon} size={22} color={pillColor} />
                      <View style={{ flex: 1 }}>
                        <Amount value={toBudget} variant="headingLg" color={pillColor} weight="700" />
                        <Text
                          variant="captionSm"
                          color={pillColor}
                          style={{ opacity: 0.75, marginTop: 1 }}
                        >
                          {pillLabel}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={pillColor} style={{ opacity: 0.5 }} />
                    </View>

                    <View
                      style={{
                        height: bw.thin,
                        backgroundColor: colors.divider,
                        marginVertical: spacing.sm,
                      }}
                    />

                    {/* Income / Budgeted / Spent */}
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text variant="captionSm" color={colors.textMuted} style={labelStyle}>
                          Income
                        </Text>
                        <Amount value={data.income} variant="body" color={colors.positive} weight="600" style={{ marginTop: 2 }} />
                      </View>
                      <View style={{ width: 1, height: 24, backgroundColor: colors.divider }} />
                      <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text variant="captionSm" color={colors.textMuted} style={labelStyle}>
                          Budgeted
                        </Text>
                        <Amount value={data.budgeted} variant="body" weight="600" style={{ marginTop: 2 }} />
                      </View>
                      <View style={{ width: 1, height: 24, backgroundColor: colors.divider }} />
                      <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text variant="captionSm" color={colors.textMuted} style={labelStyle}>
                          Spent
                        </Text>
                        <Amount value={data.spent} variant="body" color={colors.textSecondary} weight="600" style={{ marginTop: 2 }} />
                      </View>
                    </View>

                    {/* Held for Next Month */}
                    {data.buffered > 0 && (
                      <>
                        <View
                          style={{
                            height: bw.thin,
                            backgroundColor: colors.divider,
                            marginVertical: spacing.sm,
                          }}
                        />
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation();
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
                          <Amount value={data.buffered} variant="body" color={colors.primary} weight="600" style={{ marginRight: spacing.sm }} />
                          <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                        </Pressable>
                      </>
                    )}
                  </View>
                </Pressable>
              </>
            ) : null
          }
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

      <AddTransactionButton collapsed={fabCollapsed} />
    </View>
    <Stack.Toolbar placement="right">
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
