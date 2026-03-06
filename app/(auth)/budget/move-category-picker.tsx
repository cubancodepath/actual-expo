import { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../../src/presentation/providers/ThemeProvider';
import { useBudgetStore } from '../../../src/stores/budgetStore';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { Amount } from '../../../src/presentation/components/atoms/Amount';
import { SearchBar } from '../../../src/presentation/components/molecules/SearchBar';
import type { BudgetCategory } from '../../../src/budgets/types';

type SectionHeaderItem = { type: 'section-header'; title: string; key: string };
type CategoryItem = { type: 'category'; cat: BudgetCategory; isFirst: boolean; isLast: boolean; key: string };
type ListItem = SectionHeaderItem | CategoryItem;

export default function MoveCategoryPickerScreen() {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { excludeIds, moveCatId, direction } = useLocalSearchParams<{
    excludeIds: string;
    moveCatId: string;
    direction: string;
  }>();
  const data = useBudgetStore((s) => s.data);
  const setCoverTarget = useBudgetStore((s) => s.setCoverTarget);
  const [search, setSearch] = useState('');

  const excludeSet = useMemo(
    () => new Set([...(excludeIds?.split(',') ?? []), moveCatId].filter(Boolean)),
    [excludeIds, moveCatId],
  );

  const items = useMemo<ListItem[]>(() => {
    if (!data) return [];
    const query = search.toLowerCase().trim();
    const result: ListItem[] = [];
    for (const g of data.groups) {
      if (g.is_income) continue;
      const cats = g.categories.filter((c) => {
        if (excludeSet.has(c.id)) return false;
        if (query && !c.name.toLowerCase().includes(query) && !g.name.toLowerCase().includes(query)) return false;
        return true;
      });
      if (cats.length === 0) continue;
      result.push({ type: 'section-header', title: g.name, key: `header-${g.id}` });
      cats.forEach((cat, i) => {
        result.push({ type: 'category', cat, isFirst: i === 0, isLast: i === cats.length - 1, key: cat.id });
      });
    }
    return result;
  }, [data, excludeSet, search]);

  function handleSelect(cat: BudgetCategory) {
    setCoverTarget({ catId: cat.id, catName: cat.name, balance: cat.balance });
    router.back();
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.pageBackground }}
      data={items}
      keyExtractor={(item) => item.key}
      keyboardShouldPersistTaps="handled"
      stickyHeaderIndices={[0]}
      ListHeaderComponent={
        <View style={{ backgroundColor: colors.pageBackground, paddingTop: spacing.md }}>
          <Text
            variant="headingSm"
            color={colors.textPrimary}
            style={{ paddingBottom: spacing.sm, paddingHorizontal: spacing.lg }}
          >
            {direction === 'to' ? 'Move from' : 'Move to'}
          </Text>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search categories..."
          />
        </View>
      }
      renderItem={({ item }) => {
        if (item.type === 'section-header') {
          return (
            <View
              style={{
                backgroundColor: colors.pageBackground,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm,
                paddingTop: spacing.md,
              }}
            >
              <Text
                variant="captionSm"
                color={colors.textMuted}
                style={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' }}
              >
                {item.title}
              </Text>
            </View>
          );
        }
        const { cat, isFirst, isLast } = item;
        return (
          <Pressable
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginHorizontal: spacing.lg,
                paddingHorizontal: spacing.md,
                paddingVertical: 12,
                backgroundColor: colors.cardBackground,
                borderColor: colors.cardBorder,
                borderWidth: bw.thin,
                borderBottomWidth: isLast ? bw.thin : 0,
                borderTopLeftRadius: isFirst ? br.md : 0,
                borderTopRightRadius: isFirst ? br.md : 0,
                borderBottomLeftRadius: isLast ? br.md : 0,
                borderBottomRightRadius: isLast ? br.md : 0,
              },
              pressed && { backgroundColor: colors.inputBackground },
            ]}
            onPress={() => handleSelect(cat)}
          >
            <Text variant="body" color={colors.textPrimary} style={{ flex: 1, marginRight: 12 }} numberOfLines={1}>
              {cat.name}
            </Text>
            <Amount value={cat.balance} variant="bodySm" weight="600" />
          </Pressable>
        );
      }}
      ListEmptyComponent={
        <View style={{ alignItems: 'center', marginTop: 60, gap: 8 }}>
          <Text variant="bodyLg" color={colors.textSecondary}>No categories available</Text>
          <Text variant="bodySm" color={colors.textMuted}>
            {search ? 'No matches found' : 'No categories available'}
          </Text>
        </View>
      }
      contentContainerStyle={{ paddingBottom: spacing.xl }}
    />
  );
}
