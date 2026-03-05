import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';
import { Ionicons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../src/presentation/providers/ThemeProvider';
import { useCategoriesStore } from '../../../src/stores/categoriesStore';
import { useBudgetStore } from '../../../src/stores/budgetStore';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { SwipeableRow } from '../../../src/presentation/components/molecules/SwipeableRow';
import { parseGoalDef } from '../../../src/goals';
import { describeTemplate } from '../../../src/goals/describe';
import type { Category, CategoryGroup } from '../../../src/categories/types';

// ---------- Reorder helpers ----------

type GroupWithCats = {
  id: string;
  group: CategoryGroup;
  cats: Category[];
};

// ---------- Section types ----------

type GroupSection = {
  key: string;
  groupId: string | null;
  group: CategoryGroup | null;
  isIncome: boolean;
  data: Category[];
};

// ---------- Main screen ----------

export default function EditBudgetScreen() {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { groups, categories, load, moveCategoryGroup, moveCategory } =
    useCategoriesStore();
  const [isReordering, setIsReordering] = useState(false);
  const scrollableRef = useAnimatedRef<ScrollView>();

  useEffect(() => {
    load();
  }, []);

  // Split expense vs income groups
  const expenseGroups = useMemo(
    () =>
      groups
        .filter((g) => !g.hidden && !g.is_income)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [groups],
  );
  const incomeGroups = useMemo(
    () =>
      groups
        .filter((g) => !g.hidden && g.is_income)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [groups],
  );

  const categoriesByGroup = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const g of [...expenseGroups, ...incomeGroups]) {
      map.set(
        g.id,
        categories
          .filter((c) => c.cat_group === g.id && !c.hidden)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      );
    }
    return map;
  }, [expenseGroups, incomeGroups, categories]);

  // Build sections for SectionList
  const sections = useMemo<GroupSection[]>(() => {
    const out: GroupSection[] = [];
    if (expenseGroups.length > 0) {
      out.push({
        key: '__expenses__',
        groupId: null,
        group: null,
        isIncome: false,
        data: [],
      });
      for (const g of expenseGroups) {
        out.push({
          key: g.id,
          groupId: g.id,
          group: g,
          isIncome: false,
          data: categoriesByGroup.get(g.id) ?? [],
        });
      }
    }
    if (incomeGroups.length > 0) {
      out.push({
        key: '__income__',
        groupId: null,
        group: null,
        isIncome: true,
        data: [],
      });
      for (const g of incomeGroups) {
        out.push({
          key: g.id,
          groupId: g.id,
          group: g,
          isIncome: true,
          data: categoriesByGroup.get(g.id) ?? [],
        });
      }
    }
    return out;
  }, [expenseGroups, incomeGroups, categoriesByGroup]);

  // ---------- Reorder mode data ----------
  const expenseGroupCards = useMemo<GroupWithCats[]>(
    () =>
      expenseGroups.map((g) => ({
        id: g.id,
        group: g,
        cats: (categoriesByGroup.get(g.id) ?? []),
      })),
    [expenseGroups, categoriesByGroup],
  );

  const incomeGroupCards = useMemo<GroupWithCats[]>(
    () =>
      incomeGroups.map((g) => ({
        id: g.id,
        group: g,
        cats: (categoriesByGroup.get(g.id) ?? []),
      })),
    [incomeGroups, categoriesByGroup],
  );

  // ---------- Nav bar actions ----------

  function handleAddMenu() {
    const options = ['Add Category Group', 'Add Category', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 2 },
        (idx) => {
          if (idx === 0) router.push('/(auth)/budget/new-group');
          if (idx === 1) handleAddCategory();
        },
      );
    } else {
      Alert.alert('Add', undefined, [
        { text: 'Add Category Group', onPress: () => router.push('/(auth)/budget/new-group') },
        { text: 'Add Category', onPress: handleAddCategory },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  function handleAddCategory() {
    if (expenseGroups.length === 1) {
      router.push({
        pathname: '/(auth)/budget/new-category',
        params: { groupId: expenseGroups[0].id },
      });
    } else if (expenseGroups.length > 1) {
      const groupNames = expenseGroups.map((g) => g.name);
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: 'Select Group',
            options: [...groupNames, 'Cancel'],
            cancelButtonIndex: groupNames.length,
          },
          (idx) => {
            if (idx < groupNames.length) {
              router.push({
                pathname: '/(auth)/budget/new-category',
                params: { groupId: expenseGroups[idx].id },
              });
            }
          },
        );
      } else {
        Alert.alert('Select Group', undefined, [
          ...expenseGroups.map((g) => ({
            text: g.name,
            onPress: () =>
              router.push({
                pathname: '/(auth)/budget/new-category',
                params: { groupId: g.id },
              }),
          })),
          { text: 'Cancel', style: 'cancel' as const },
        ]);
      }
    }
  }

  // ---------- Group actions ----------

  function handleGroupLongPress(group: CategoryGroup) {
    const catCount = (categoriesByGroup.get(group.id) ?? []).length;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: group.name,
          options: ['Rename Group', 'Delete Group', 'Cancel'],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
        },
        (idx) => {
          if (idx === 0) {
            router.push({
              pathname: '/(auth)/budget/edit-group',
              params: { groupId: group.id },
            });
          }
          if (idx === 1) confirmDeleteGroup(group, catCount);
        },
      );
    } else {
      Alert.alert(group.name, undefined, [
        {
          text: 'Rename Group',
          onPress: () =>
            router.push({
              pathname: '/(auth)/budget/edit-group',
              params: { groupId: group.id },
            }),
        },
        {
          text: 'Delete Group',
          style: 'destructive',
          onPress: () => confirmDeleteGroup(group, catCount),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  function confirmDeleteGroup(group: CategoryGroup, catCount: number) {
    const message =
      catCount > 0
        ? `This will delete "${group.name}" and its ${catCount} categor${catCount === 1 ? 'y' : 'ies'}. This cannot be undone.`
        : `Are you sure you want to delete "${group.name}"?`;
    Alert.alert('Delete Group', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await useCategoriesStore.getState().deleteCategoryGroup(group.id);
          await useCategoriesStore.getState().load();
          await useBudgetStore.getState().load();
        },
      },
    ]);
  }

  // ---------- Category delete ----------

  function handleDeleteCategory(cat: Category) {
    Alert.alert(
      'Delete Category',
      `Are you sure you want to delete "${cat.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await useCategoriesStore.getState().deleteCategory(cat.id);
            await useCategoriesStore.getState().load();
            await useBudgetStore.getState().load();
          },
        },
      ],
    );
  }

  // ---------- Drag end handlers ----------

  async function handleGroupDragEnd(movedKey: string, data: GroupWithCats[]) {
    const oldOrder = expenseGroupCards.map((g) => g.id);
    const newOrder = data.map((g) => g.id);
    if (oldOrder.every((id, i) => id === newOrder[i])) return;
    const idx = newOrder.indexOf(movedKey);
    const targetId = idx + 1 < newOrder.length ? newOrder[idx + 1] : null;
    await moveCategoryGroup(movedKey, targetId);
    await load();
  }

  async function handleCategoryDragEnd(
    groupId: string,
    movedKey: string,
    data: Category[],
  ) {
    const original = categoriesByGroup.get(groupId) ?? [];
    if (original.every((c, i) => c.id === data[i]?.id)) return;
    const idx = data.findIndex((c) => c.id === movedKey);
    const targetId = idx + 1 < data.length ? data[idx + 1].id : null;
    await moveCategory(movedKey, groupId, targetId);
    await load();
  }

  // ---------- Move category between groups ----------

  function handleMoveCategoryToGroup(cat: Category) {
    const currentGroup = cat.cat_group;
    const otherGroups = expenseGroups.filter((g) => g.id !== currentGroup);
    if (otherGroups.length === 0) return;

    if (Platform.OS === 'ios') {
      const options = [...otherGroups.map((g) => g.name), 'Cancel'];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: `Move "${cat.name}" to…`,
          options,
          cancelButtonIndex: options.length - 1,
        },
        async (idx) => {
          if (idx < otherGroups.length) {
            await moveCategory(cat.id, otherGroups[idx].id, null);
            await load();
          }
        },
      );
    } else {
      Alert.alert(`Move "${cat.name}" to…`, undefined, [
        ...otherGroups.map((g) => ({
          text: g.name,
          onPress: async () => {
            await moveCategory(cat.id, g.id, null);
            await load();
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  }

  // ---------- Render: Reorder mode items ----------

  function ReorderCategoryRow({ cat, sortable = true }: { cat: Category; sortable?: boolean }) {
    const icon = (
      <Ionicons
        name="reorder-three-outline"
        size={20}
        color={colors.textMuted}
        style={{ marginRight: spacing.sm }}
      />
    );
    const canMoveToOtherGroup = expenseGroups.length > 1;
    return (
      <Pressable
        onLongPress={canMoveToOtherGroup ? () => handleMoveCategoryToGroup(cat) : undefined}
        delayLongPress={500}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: spacing.xl,
          paddingRight: spacing.lg,
          paddingVertical: spacing.md,
          backgroundColor: colors.cardBackground,
          borderTopWidth: bw.thin,
          borderTopColor: colors.divider,
          minHeight: 44,
        }}
      >
        {sortable ? <Sortable.Handle>{icon}</Sortable.Handle> : icon}
        <Text variant="body" color={colors.textPrimary}>
          {cat.name}
        </Text>
      </Pressable>
    );
  }

  function GroupCardContent({ gwc, showHandle }: { gwc: GroupWithCats; showHandle: boolean }) {
    return (
      <View
        style={{
          marginHorizontal: spacing.lg,
          marginTop: spacing.sm,
          borderRadius: br.lg,
          borderWidth: bw.thin,
          borderColor: colors.cardBorder,
          backgroundColor: colors.cardBackground,
          overflow: 'hidden',
        }}
      >
        {/* Group header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: spacing.md,
            paddingLeft: showHandle ? spacing.md : spacing.lg,
            paddingRight: spacing.lg,
            minHeight: 44,
          }}
        >
          {showHandle && (
            <Sortable.Handle>
              <Ionicons
                name="reorder-three-outline"
                size={22}
                color={colors.textMuted}
                style={{ marginRight: spacing.sm }}
              />
            </Sortable.Handle>
          )}
          <Text
            variant="captionSm"
            color={colors.textSecondary}
            style={{
              flex: 1,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              fontWeight: '700',
            }}
          >
            {gwc.group.name}
          </Text>
        </View>

        {/* Categories within this group */}
        {gwc.cats.length === 0 && (
          <View
            style={{
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              borderTopWidth: bw.thin,
              borderTopColor: colors.divider,
            }}
          >
            <Text variant="bodySm" color={colors.textMuted} style={{ fontStyle: 'italic' }}>
              No categories
            </Text>
          </View>
        )}
        {gwc.cats.length > 1 ? (
          <Sortable.Grid
            data={gwc.cats}
            renderItem={({ item }) => (
              <ReorderCategoryRow cat={item} />
            )}
            keyExtractor={(cat) => cat.id}
            columns={1}
            customHandle
            scrollableRef={scrollableRef}
            overDrag="vertical"
            activeItemScale={1.02}
            activeItemOpacity={0.9}
            onDragStart={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
            onOrderChange={() => Haptics.selectionAsync()}
            onDragEnd={({ key, data }) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              handleCategoryDragEnd(gwc.group.id, key, data);
            }}
          />
        ) : gwc.cats.length === 1 ? (
          <ReorderCategoryRow cat={gwc.cats[0]} sortable={false} />
        ) : null}
      </View>
    );
  }

  const renderGroupCard = useCallback(
    ({ item }: { item: GroupWithCats }) => <GroupCardContent gwc={item} showHandle />,
    [colors, spacing, br, bw, categoriesByGroup],
  );

  // ---------- Render: Normal mode ----------

  const renderSectionHeader = useCallback(
    ({ section }: { section: GroupSection }) => {
      // Super-headers (EXPENSES / INCOME labels)
      if (!section.group) {
        return (
          <View
            style={{
              paddingHorizontal: spacing.lg,
              paddingTop: section.isIncome ? spacing.xl : spacing.md,
              paddingBottom: spacing.sm,
            }}
          >
            <Text
              variant="captionSm"
              color={colors.textSecondary}
              style={{
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                fontWeight: '700',
              }}
            >
              {section.isIncome ? 'Income' : 'Expenses'}
            </Text>
          </View>
        );
      }

      // Group card header
      const group = section.group;
      return (
        <Pressable
          onLongPress={() => handleGroupLongPress(group)}
          delayLongPress={400}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            marginHorizontal: spacing.lg,
            marginTop: spacing.sm,
            backgroundColor: colors.cardBackground,
            borderTopLeftRadius: br.lg,
            borderTopRightRadius: br.lg,
            borderWidth: bw.thin,
            borderBottomWidth: 0,
            borderColor: colors.cardBorder,
            minHeight: 44,
          }}
          accessibilityRole="header"
          accessibilityLabel={`${group.name} group, ${section.data.length} categories`}
        >
          <Text
            variant="captionSm"
            color={colors.textSecondary}
            style={{
              flex: 1,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              fontWeight: '700',
            }}
          >
            {group.name}
          </Text>
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(auth)/budget/new-category',
                params: { groupId: group.id },
              })
            }
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Add category to ${group.name}`}
          >
            <Text
              variant="captionSm"
              color={colors.primary}
              style={{ fontWeight: '600' }}
            >
              + Add
            </Text>
          </Pressable>
        </Pressable>
      );
    },
    [colors, spacing, br, bw, router],
  );

  const renderNormalItem = useCallback(
    ({ item, index, section }: { item: Category; index: number; section: GroupSection }) => {
      const isLast = index === section.data.length - 1;
      const isFirst = index === 0;

      // Goal info
      const templates = parseGoalDef(item.goal_def ?? null);
      const hasGoal = templates.length > 0;
      const goalDescription = hasGoal ? describeTemplate(templates[0]) : null;

      return (
        <View
          style={{
            marginHorizontal: spacing.lg,
            borderLeftWidth: bw.thin,
            borderRightWidth: bw.thin,
            borderBottomWidth: bw.thin,
            borderColor: colors.cardBorder,
            borderBottomLeftRadius: isLast ? br.lg : 0,
            borderBottomRightRadius: isLast ? br.lg : 0,
            overflow: 'hidden',
          }}
        >
          <SwipeableRow
            onDelete={() => handleDeleteCategory(item)}
            isFirst={false}
            isLast={isLast}
          >
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/(auth)/budget/edit-category',
                  params: { categoryId: item.id },
                })
              }
              style={({ pressed }) => ({
                paddingHorizontal: spacing.lg,
                paddingTop: 12,
                paddingBottom: hasGoal ? 10 : 12,
                minHeight: 44,
                backgroundColor: pressed
                  ? colors.cardBackground + 'cc'
                  : colors.cardBackground,
                borderTopWidth: isFirst ? 0 : bw.thin,
                borderTopColor: colors.divider,
              })}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}${hasGoal ? `, Target: ${goalDescription}` : ''}`}
              accessibilityHint="Edit category"
            >
              {/* Line 1: Name + Goal description */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text
                  variant="body"
                  style={{ flex: 1 }}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                {hasGoal && goalDescription && (
                  <Text
                    variant="captionSm"
                    color={colors.textSecondary}
                    numberOfLines={1}
                    style={{ flexShrink: 1, marginLeft: spacing.sm }}
                  >
                    {goalDescription}
                  </Text>
                )}
              </View>
            </Pressable>
          </SwipeableRow>
        </View>
      );
    },
    [colors, spacing, br, bw, router],
  );

  // ---------- Layout ----------

  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      <Stack.Screen
        options={{
          title: 'Edit Budget',
          headerRight: () =>
            isReordering ? (
              <Pressable
                onPress={() => setIsReordering(false)}
                style={{ padding: spacing.sm }}
                accessibilityRole="button"
                accessibilityLabel="Done reordering"
              >
                <Ionicons name="checkmark" size={24} color={colors.link} />
              </Pressable>
            ) : (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Pressable
                  onPress={() => setIsReordering(true)}
                  style={{ padding: spacing.sm }}
                  accessibilityRole="button"
                  accessibilityLabel="Reorder categories"
                >
                  <Ionicons name="swap-vertical" size={22} color={colors.headerText} />
                </Pressable>
                <Pressable
                  onPress={handleAddMenu}
                  style={{ padding: spacing.sm }}
                  accessibilityRole="button"
                  accessibilityLabel="Add group or category"
                >
                  <Ionicons name="add" size={24} color={colors.headerText} />
                </Pressable>
              </View>
            ),
        }}
      />

      {isReordering ? (
        <ScrollView
          ref={scrollableRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 80 }}
        >
          {/* Expense groups — sortable as whole cards */}
          {expenseGroupCards.length > 0 && (
            <>
              <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs }}>
                <Text
                  variant="captionSm"
                  color={colors.textSecondary}
                  style={{ textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700' }}
                >
                  Expenses
                </Text>
              </View>
              <Sortable.Grid
                data={expenseGroupCards}
                renderItem={renderGroupCard}
                keyExtractor={(item) => item.id}
                columns={1}
                customHandle
                scrollableRef={scrollableRef}
                overDrag="vertical"
                activeItemScale={1.02}
                activeItemOpacity={0.9}
                onDragStart={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
                onOrderChange={() => Haptics.selectionAsync()}
                onDragEnd={({ key, data }) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  handleGroupDragEnd(key, data);
                }}
              />
            </>
          )}

          {/* Income groups — not sortable relative to expenses, but categories within are */}
          {incomeGroupCards.length > 0 && (
            <>
              <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.xs }}>
                <Text
                  variant="captionSm"
                  color={colors.textSecondary}
                  style={{ textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700' }}
                >
                  Income
                </Text>
              </View>
              {incomeGroupCards.map((gwc) => (
                <GroupCardContent key={gwc.id} gwc={gwc} showHandle={false} />
              ))}
            </>
          )}
        </ScrollView>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(c) => c.id}
          renderItem={renderNormalItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: 80 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 80, gap: 8 }}>
              <SymbolView
                name="folder.badge.questionmark"
                tintColor={colors.textMuted}
                size={48}
              />
              <Text variant="bodyLg" color={colors.textSecondary}>
                No category groups yet
              </Text>
              <Text variant="bodySm" color={colors.textMuted}>
                Organize your budget by creating groups
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
