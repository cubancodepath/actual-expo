import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useAnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../src/presentation/providers/ThemeProvider';
import { useCategoriesStore } from '../../../src/stores/categoriesStore';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { Button } from '../../../src/presentation/components/atoms/Button';
import { IconButton } from '../../../src/presentation/components/atoms/IconButton';
import type { Category, CategoryGroup } from '../../../src/categories/types';

// ---------- Types ----------

type GroupSection = {
  groupId: string;
  groupName: string;
  data: Category[];
};

type ReorderItem =
  | { type: 'group'; id: string; group: CategoryGroup }
  | { type: 'category'; id: string; category: Category }
  | { type: 'empty'; id: string; groupId: string };

// ---------- Helpers ----------

/** Build a flat list: [group1, cat1a, cat1b, group2, empty2, group3, cat3a, ...] */
function buildFlatList(
  groups: CategoryGroup[],
  categories: Category[],
): ReorderItem[] {
  const items: ReorderItem[] = [];
  for (const g of groups) {
    items.push({ type: 'group', id: g.id, group: g });
    const cats = categories
      .filter((c) => c.cat_group === g.id && !c.hidden)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    if (cats.length === 0) {
      // Placeholder so the grid has a drop target for empty groups
      items.push({ type: 'empty', id: `empty-${g.id}`, groupId: g.id });
    }
    for (const c of cats) {
      items.push({ type: 'category', id: c.id, category: c });
    }
  }
  return items;
}

/** Find the group a category belongs to by scanning upward in the flat list */
function findGroupForIndex(items: ReorderItem[], index: number): string | null {
  for (let i = index; i >= 0; i--) {
    if (items[i].type === 'group') return items[i].id;
  }
  return null;
}

/** Extract ordered group ids from flat list */
function extractGroupOrder(items: ReorderItem[]): string[] {
  return items.filter((i) => i.type === 'group').map((i) => i.id);
}

/** Extract category ids for a group from the flat list, in order (ignores empty placeholders) */
function extractCategoriesForGroup(
  items: ReorderItem[],
  groupId: string,
): string[] {
  const cats: string[] = [];
  let inGroup = false;
  for (const item of items) {
    if (item.type === 'group') {
      inGroup = item.id === groupId;
    } else if (inGroup && item.type === 'category') {
      cats.push(item.id);
    }
  }
  return cats;
}

export default function EditBudgetScreen() {
  const { colors, spacing, borderWidth: bw } = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { groups, categories, load, moveCategoryGroup, moveCategory } =
    useCategoriesStore();
  const [isReordering, setIsReordering] = useState(false);
  const scrollableRef = useAnimatedRef<ScrollView>();

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      load();
    });
    return unsubscribe;
  }, [navigation]);

  // Split expense vs income groups
  const expenseGroups = useMemo(
    () => groups.filter((g) => !g.hidden && !g.is_income),
    [groups],
  );
  const incomeGroups = useMemo(
    () => groups.filter((g) => !g.hidden && g.is_income),
    [groups],
  );

  const visibleGroups = useMemo(
    () =>
      groups
        .filter((g) => !g.hidden)
        .sort((a, b) => {
          if (a.is_income !== b.is_income) return a.is_income ? 1 : -1;
          return (a.sort_order ?? 0) - (b.sort_order ?? 0);
        }),
    [groups],
  );

  const categoriesByGroup = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const g of visibleGroups) {
      map.set(
        g.id,
        categories.filter((c) => c.cat_group === g.id && !c.hidden),
      );
    }
    return map;
  }, [visibleGroups, categories]);

  // ---------- Normal mode data ----------
  const sections = useMemo<GroupSection[]>(
    () =>
      visibleGroups.map((g) => ({
        groupId: g.id,
        groupName: g.name,
        data: categoriesByGroup.get(g.id) ?? [],
      })),
    [visibleGroups, categoriesByGroup],
  );

  // ---------- Reorder mode data ----------
  const expenseFlatList = useMemo(
    () => buildFlatList(expenseGroups, categories),
    [expenseGroups, categories],
  );

  const incomeCats = useMemo(() => {
    const cats: Category[] = [];
    for (const g of incomeGroups) {
      cats.push(
        ...categories
          .filter((c) => c.cat_group === g.id && !c.hidden)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      );
    }
    return cats;
  }, [incomeGroups, categories]);

  // ---------- Drag end handlers ----------
  async function handleExpenseDragEnd(movedKey: string, data: ReorderItem[]) {
    const movedItem = data.find((item) => item.id === movedKey);
    if (!movedItem || movedItem.type === 'empty') return;

    if (movedItem.type === 'group') {
      const oldGroupOrder = extractGroupOrder(expenseFlatList);
      const newGroupOrder = extractGroupOrder(data);

      // Check if order actually changed
      if (oldGroupOrder.every((id, i) => id === newGroupOrder[i])) return;

      const idx = newGroupOrder.indexOf(movedKey);
      const targetId =
        idx + 1 < newGroupOrder.length ? newGroupOrder[idx + 1] : null;
      await moveCategoryGroup(movedKey, targetId);
    } else if (movedItem.type === 'category') {
      const movedIndex = data.findIndex((item) => item.id === movedKey);
      const newGroupId = findGroupForIndex(data, movedIndex);
      if (!newGroupId) return;

      const catsInGroup = extractCategoriesForGroup(data, newGroupId);
      const posInGroup = catsInGroup.indexOf(movedKey);
      const targetId =
        posInGroup + 1 < catsInGroup.length
          ? catsInGroup[posInGroup + 1]
          : null;

      await moveCategory(movedKey, newGroupId, targetId);
    }

    await load();
  }

  async function handleIncomeDragEnd(data: Category[]) {
    for (let i = 0; i < data.length; i++) {
      if (data[i].id !== incomeCats[i]?.id) {
        const movedId = data[i].id;
        const groupId = data[i].cat_group;
        const targetId = i + 1 < data.length ? data[i + 1].id : null;
        await moveCategory(movedId, groupId, targetId);
        await load();
        return;
      }
    }
  }

  // ---------- Render items for Sortable.Grid ----------
  const renderExpenseItem = useCallback(
    ({ item }: { item: ReorderItem }) => {
      if (item.type === 'group') {
        return (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: spacing.sm,
              paddingRight: spacing.lg,
              paddingVertical: 8,
              backgroundColor: colors.cardBackground,
              borderTopWidth: bw.thin,
              borderBottomWidth: bw.thin,
              borderColor: colors.divider,
            }}
          >
            <Sortable.Handle>
              <Ionicons
                name="menu"
                size={18}
                color={colors.textMuted}
                style={{ marginRight: spacing.xs }}
              />
            </Sortable.Handle>
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
              {item.group.name}
            </Text>
          </View>
        );
      }

      if (item.type === 'empty') {
        return (
          <View
            style={{
              paddingHorizontal: spacing.lg,
              paddingVertical: 12,
              backgroundColor: colors.pageBackground,
              borderBottomWidth: bw.thin,
              borderColor: colors.divider,
            }}
          >
            <Sortable.Handle mode="non-draggable">
              <Text variant="bodySm" color={colors.textMuted} style={{ fontStyle: 'italic' }}>
                No categories
              </Text>
            </Sortable.Handle>
          </View>
        );
      }

      return (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: spacing.lg + spacing.sm,
            paddingRight: spacing.lg,
            paddingVertical: 12,
            backgroundColor: colors.pageBackground,
            borderBottomWidth: bw.thin,
            borderColor: colors.divider,
          }}
        >
          <Sortable.Handle>
            <Ionicons
              name="menu"
              size={16}
              color={colors.textMuted}
              style={{ marginRight: spacing.xs }}
            />
          </Sortable.Handle>
          <Text variant="body" color={colors.textPrimary}>
            {item.category.name}
          </Text>
        </View>
      );
    },
    [colors, spacing, bw],
  );

  const renderIncomeItem = useCallback(
    ({ item }: { item: Category }) => (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: spacing.lg + spacing.sm,
          paddingRight: spacing.lg,
          paddingVertical: 12,
          backgroundColor: colors.pageBackground,
          borderBottomWidth: bw.thin,
          borderColor: colors.divider,
        }}
      >
        <Sortable.Handle>
          <Ionicons
            name="menu"
            size={16}
            color={colors.textMuted}
            style={{ marginRight: spacing.xs }}
          />
        </Sortable.Handle>
        <Text variant="body" color={colors.textPrimary}>
          {item.name}
        </Text>
      </View>
    ),
    [colors, spacing, bw],
  );

  // ---------- Normal mode renders ----------
  const renderSectionHeader = useCallback(
    ({ section }: { section: GroupSection }) => (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: spacing.lg,
          paddingRight: spacing.sm,
          paddingVertical: 8,
          backgroundColor: colors.cardBackground,
          borderTopWidth: bw.thin,
          borderBottomWidth: bw.thin,
          borderColor: colors.divider,
          marginTop: 6,
        }}
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
          {section.groupName}
        </Text>
        <IconButton
          icon="add-circle"
          size={18}
          color={colors.textMuted}
          onPress={() =>
            router.push({
              pathname: '/(auth)/budget/new-category',
              params: { groupId: section.groupId },
            })
          }
        />
        <IconButton
          icon="ellipsis-horizontal-circle-outline"
          size={18}
          color={colors.textMuted}
          onPress={() =>
            router.push({
              pathname: '/(auth)/budget/edit-group',
              params: { groupId: section.groupId },
            })
          }
        />
      </View>
    ),
    [colors, spacing, bw, router],
  );

  const renderNormalItem = useCallback(
    ({ item }: { item: Category }) => (
      <Pressable
        onPress={() =>
          router.push({
            pathname: '/(auth)/budget/edit-category',
            params: { categoryId: item.id },
          })
        }
        style={({ pressed }) => ({
          paddingHorizontal: spacing.lg,
          paddingVertical: 12,
          backgroundColor: colors.pageBackground,
          borderBottomWidth: bw.thin,
          borderColor: colors.divider,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text variant="body" color={colors.textPrimary}>
          {item.name}
        </Text>
      </Pressable>
    ),
    [colors, spacing, bw, router],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      {/* Toolbar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
          gap: spacing.sm,
        }}
      >
        {!isReordering && (
          <Button
            title="Add Group"
            variant="secondary"
            size="sm"
            icon="folder-outline"
            onPress={() => router.push('/(auth)/budget/new-group')}
            style={{ borderRadius: 999 }}
          />
        )}
        <Button
          title={isReordering ? 'Done' : 'Reorder'}
          variant={isReordering ? 'primary' : 'secondary'}
          size="sm"
          icon={isReordering ? 'checkmark' : 'reorder-three-outline'}
          onPress={() => setIsReordering((v) => !v)}
          style={{ borderRadius: 999 }}
        />
      </View>

      {isReordering ? (
        <ScrollView
          ref={scrollableRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          {/* Expense groups + categories */}
          {expenseFlatList.length > 0 && (
            <Sortable.Grid
              data={expenseFlatList}
              renderItem={renderExpenseItem}
              keyExtractor={(item) => item.id}
              columns={1}
              customHandle
              scrollableRef={scrollableRef}
              overDrag="vertical"
              activeItemScale={1.03}
              activeItemOpacity={0.9}
              onDragStart={() => Haptics.selectionAsync()}
              onDragEnd={({ key, data }) => handleExpenseDragEnd(key, data)}
            />
          )}

          {/* Income section */}
          {incomeGroups.length > 0 && (
            <View>
              {/* Income group header — not draggable */}
              {incomeGroups.map((g) => (
                <View
                  key={g.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingLeft: spacing.lg,
                    paddingRight: spacing.lg,
                    paddingVertical: 8,
                    backgroundColor: colors.cardBackground,
                    borderTopWidth: bw.thin,
                    borderBottomWidth: bw.thin,
                    borderColor: colors.divider,
                    marginTop: 6,
                  }}
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
                    {g.name}
                  </Text>
                </View>
              ))}
              {/* Income categories: separate sortable */}
              {incomeCats.length > 1 && (
                <Sortable.Grid
                  data={incomeCats}
                  renderItem={renderIncomeItem}
                  keyExtractor={(item) => item.id}
                  columns={1}
                  customHandle
                  scrollableRef={scrollableRef}
                  overDrag="vertical"
                  activeItemScale={1.03}
                  activeItemOpacity={0.9}
                  onDragStart={() => Haptics.selectionAsync()}
                  onDragEnd={({ data }) => handleIncomeDragEnd(data)}
                />
              )}
              {/* Single income cat — no sorting needed */}
              {incomeCats.length === 1 && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingLeft: spacing.lg + spacing.sm,
                    paddingRight: spacing.lg,
                    paddingVertical: 12,
                    backgroundColor: colors.pageBackground,
                    borderBottomWidth: bw.thin,
                    borderColor: colors.divider,
                  }}
                >
                  <Text variant="body" color={colors.textPrimary}>
                    {incomeCats[0].name}
                  </Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(c) => c.id}
          renderItem={renderNormalItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 80, gap: 8 }}>
              <Text variant="bodyLg" color={colors.textSecondary}>
                No category groups yet
              </Text>
              <Text variant="bodySm" color={colors.textMuted}>
                Tap + to create a group
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
