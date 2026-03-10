import { useMemo } from 'react';
import { Alert, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useBudgetStore } from '../../../src/stores/budgetStore';
import { useTheme } from '../../../src/presentation/providers/ThemeProvider';
import { Amount } from '../../../src/presentation/components/atoms/Amount';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { GlassButton } from '../../../src/presentation/components/atoms/GlassButton';
import { CategoryPickerList, type GroupedCategory } from '../../../src/presentation/components';

export default function DeleteCategoryPickerScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { excludeIds, moveCatId } = useLocalSearchParams<{
    excludeIds: string;
    moveCatId: string;
  }>();
  const data = useBudgetStore((s) => s.data);
  const setCoverTarget = useBudgetStore((s) => s.setCoverTarget);

  const excludeSet = useMemo(
    () => new Set([...(excludeIds?.split(',') ?? []), moveCatId].filter(Boolean)),
    [excludeIds, moveCatId],
  );

  const groups = useMemo<GroupedCategory[]>(() => {
    if (!data) return [];
    return data.groups
      .filter((g) => !g.is_income)
      .map((g) => ({
        groupId: g.id,
        groupName: g.name,
        categories: g.categories
          .filter((c) => !excludeSet.has(c.id))
          .map((c) => ({ id: c.id, name: c.name, balance: c.balance })),
      }))
      .filter((g) => g.categories.length > 0);
  }, [data, excludeSet]);

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={{ paddingTop: 12, paddingBottom: spacing.sm }}>
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md }}>
          <GlassButton icon="xmark" onPress={() => router.back()} />
          <View style={{ flex: 1, alignItems: 'center', marginRight: 48 }}>
            <Text variant="body" color={colors.textPrimary} style={{ fontWeight: '600' }}>
              Move transactions to
            </Text>
          </View>
        </View>
      </View>

      {/* Picker list */}
      <CategoryPickerList
        groups={groups}
        autoFocusSearch
        onSelect={(cat) => {
          Alert.alert(
            'Confirm Delete',
            `Transactions will be moved to "${cat.name}". This cannot be undone.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  setCoverTarget({ catId: cat.id, catName: cat.name, balance: cat.balance });
                  router.back();
                },
              },
            ],
          );
        }}
        renderRight={(cat) => <Amount value={cat.balance} variant="bodySm" weight="600" />}
      />
    </View>
  );
}
