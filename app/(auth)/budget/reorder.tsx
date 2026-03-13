import { useCallback, useMemo } from "react";
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn } from "react-native-reanimated";
import { useAnimatedRef } from "react-native-reanimated";
import Sortable from "react-native-sortables";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../../src/presentation/providers/ThemeProvider";
import { useCategoriesStore } from "../../../src/stores/categoriesStore";
import { Text } from "../../../src/presentation/components/atoms/Text";
import { IconButton } from "../../../src/presentation/components/atoms/IconButton";
import type { Category, CategoryGroup } from "../../../src/categories/types";

type GroupWithCats = {
  id: string;
  group: CategoryGroup;
  cats: Category[];
};

export default function ReorderBudgetScreen() {
  const { t } = useTranslation('budget');
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const scrollableRef = useAnimatedRef<ScrollView>();
  const groups = useCategoriesStore((s) => s.groups);
  const categories = useCategoriesStore((s) => s.categories);
  const load = useCategoriesStore((s) => s.load);
  const moveCategoryGroup = useCategoriesStore((s) => s.moveCategoryGroup);
  const moveCategory = useCategoriesStore((s) => s.moveCategory);

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

  const expenseGroupCards = useMemo<GroupWithCats[]>(
    () =>
      expenseGroups.map((g) => ({
        id: g.id,
        group: g,
        cats: categoriesByGroup.get(g.id) ?? [],
      })),
    [expenseGroups, categoriesByGroup],
  );

  const incomeGroupCards = useMemo<GroupWithCats[]>(
    () =>
      incomeGroups.map((g) => ({
        id: g.id,
        group: g,
        cats: categoriesByGroup.get(g.id) ?? [],
      })),
    [incomeGroups, categoriesByGroup],
  );

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

    if (Platform.OS === "ios") {
      const options = [...otherGroups.map((g) => g.name), "Cancel"];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: t('moveCategoryTo', { name: cat.name }),
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
      Alert.alert(t('moveCategoryTo', { name: cat.name }), undefined, [
        ...otherGroups.map((g) => ({
          text: g.name,
          onPress: async () => {
            await moveCategory(cat.id, g.id, null);
            await load();
          },
        })),
        { text: t('cancel'), style: "cancel" as const },
      ]);
    }
  }

  // ---------- Reorder row ----------

  function ReorderCategoryRow({
    cat,
    sortable = true,
  }: {
    cat: Category;
    sortable?: boolean;
  }) {
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
        onLongPress={
          canMoveToOtherGroup
            ? () => handleMoveCategoryToGroup(cat)
            : undefined
        }
        delayLongPress={500}
        style={{
          flexDirection: "row",
          alignItems: "center",
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

  // ---------- Group card ----------

  function GroupCardContent({
    gwc,
    showHandle,
  }: {
    gwc: GroupWithCats;
    showHandle: boolean;
  }) {
    return (
      <View
        style={{
          marginHorizontal: spacing.lg,
          marginTop: spacing.sm,
          borderRadius: br.lg,
          borderWidth: bw.thin,
          borderColor: colors.cardBorder,
          backgroundColor: colors.cardBackground,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
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
              textTransform: "uppercase",
              letterSpacing: 0.5,
              fontWeight: "700",
            }}
          >
            {gwc.group.name}
          </Text>
        </View>

        {gwc.cats.length === 0 && (
          <View
            style={{
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              borderTopWidth: bw.thin,
              borderTopColor: colors.divider,
            }}
          >
            <Text
              variant="bodySm"
              color={colors.textMuted}
              style={{ fontStyle: "italic" }}
            >
              {t('noCategories')}
            </Text>
          </View>
        )}
        {gwc.cats.length > 1 ? (
          <Sortable.Grid
            data={gwc.cats}
            renderItem={({ item }) => <ReorderCategoryRow cat={item} />}
            keyExtractor={(cat) => cat.id}
            columns={1}
            customHandle
            scrollableRef={scrollableRef}
            overDrag="vertical"
            activeItemScale={1.02}
            activeItemOpacity={0.9}
            onDragStart={() =>
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
            }
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
    ({ item }: { item: GroupWithCats }) => (
      <GroupCardContent gwc={item} showHandle />
    ),
    [colors, spacing, br, bw, categoriesByGroup],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              ionIcon="checkmark"
              size={22}
              color={colors.headerText}
              onPress={() => router.back()}
            />
          ),
        }}
      />

      <Animated.View entering={FadeIn.duration(300)} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollableRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 80, paddingTop: spacing.sm }}
          contentInsetAdjustmentBehavior="automatic"
        >
          {expenseGroupCards.length > 0 && (
            <>
              <View
                style={{
                  paddingHorizontal: spacing.lg,
                  paddingTop: spacing.md,
                  paddingBottom: spacing.xs,
                }}
              >
                <Text
                  variant="captionSm"
                  color={colors.textSecondary}
                  style={{
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                    fontWeight: "700",
                  }}
                >
                  {t('expenses')}
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
                onDragStart={() =>
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
                }
                onOrderChange={() => Haptics.selectionAsync()}
                onDragEnd={({ key, data }) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  handleGroupDragEnd(key, data);
                }}
              />
            </>
          )}

          {incomeGroupCards.length > 0 && (
            <>
              <View
                style={{
                  paddingHorizontal: spacing.lg,
                  paddingTop: spacing.xl,
                  paddingBottom: spacing.xs,
                }}
              >
                <Text
                  variant="captionSm"
                  color={colors.textSecondary}
                  style={{
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                    fontWeight: "700",
                  }}
                >
                  {t('income')}
                </Text>
              </View>
              {incomeGroupCards.map((gwc) => (
                <GroupCardContent key={gwc.id} gwc={gwc} showHandle={false} />
              ))}
            </>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}
