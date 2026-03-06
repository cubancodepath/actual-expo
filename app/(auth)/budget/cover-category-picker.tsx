import { useMemo, useState } from 'react';
import { Pressable, SectionList, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../../src/presentation/providers/ThemeProvider';
import { useBudgetStore } from '../../../src/stores/budgetStore';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { Amount } from '../../../src/presentation/components/atoms/Amount';
import { SearchBar } from '../../../src/presentation/components/molecules/SearchBar';
import type { BudgetCategory } from '../../../src/budgets/types';

type PickerSection = {
  key: string;
  title: string;
  data: BudgetCategory[];
};

export default function CoverCategoryPickerScreen() {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { excludeIds, overspentCatId } = useLocalSearchParams<{
    excludeIds: string;
    overspentCatId: string;
  }>();
  const data = useBudgetStore((s) => s.data);
  const setCoverTarget = useBudgetStore((s) => s.setCoverTarget);
  const [search, setSearch] = useState('');

  const excludeSet = useMemo(
    () => new Set([...(excludeIds?.split(',') ?? []), overspentCatId].filter(Boolean)),
    [excludeIds, overspentCatId],
  );

  const sections = useMemo<PickerSection[]>(() => {
    if (!data) return [];
    const query = search.toLowerCase().trim();
    return data.groups
      .filter((g) => !g.is_income)
      .map((g) => ({
        key: g.id,
        title: g.name,
        data: g.categories.filter((c) => {
          if (excludeSet.has(c.id) || c.balance <= 0) return false;
          if (query && !c.name.toLowerCase().includes(query) && !g.name.toLowerCase().includes(query)) return false;
          return true;
        }),
      }))
      .filter((s) => s.data.length > 0);
  }, [data, excludeSet, search]);

  function handleSelect(cat: BudgetCategory) {
    setCoverTarget({ catId: cat.id, catName: cat.name, balance: cat.balance });
    router.back();
  }

  return (
    <SectionList
      style={{ backgroundColor: colors.pageBackground }}
      contentInsetAdjustmentBehavior="automatic"
      sections={sections}
      keyExtractor={(c) => c.id}
      keyboardShouldPersistTaps="handled"
      stickySectionHeadersEnabled
      ListHeaderComponent={
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search categories..."
        />
      }
      renderSectionHeader={({ section }) => (
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
            {section.title}
          </Text>
        </View>
      )}
      renderItem={({ item: cat, index, section }) => (
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
              borderBottomWidth: index < section.data.length - 1 ? 0 : bw.thin,
              borderTopLeftRadius: index === 0 ? br.md : 0,
              borderTopRightRadius: index === 0 ? br.md : 0,
              borderBottomLeftRadius: index === section.data.length - 1 ? br.md : 0,
              borderBottomRightRadius: index === section.data.length - 1 ? br.md : 0,
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
      )}
      ListEmptyComponent={
        <View style={{ alignItems: 'center', marginTop: 60, gap: 8 }}>
          <Text variant="bodyLg" color={colors.textSecondary}>No categories available</Text>
          <Text variant="bodySm" color={colors.textMuted}>
            {search ? 'No matches found' : 'No categories with positive balance'}
          </Text>
        </View>
      }
      contentContainerStyle={{ paddingBottom: spacing.xl }}
    >
      <Stack.Screen
        options={{
          headerLeft: () => null,
          headerRight: () => null,
        }}
      />
    </SectionList>
  );
}
