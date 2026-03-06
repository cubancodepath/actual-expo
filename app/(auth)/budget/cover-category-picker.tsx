import { useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useBudgetStore } from '../../../src/stores/budgetStore';
import { Amount } from '../../../src/presentation/components/atoms/Amount';
import { CategoryPickerList, type GroupedCategory } from '../../../src/presentation/components';

export default function CoverCategoryPickerScreen() {
  const router = useRouter();
  const { excludeIds, overspentCatId } = useLocalSearchParams<{
    excludeIds: string;
    overspentCatId: string;
  }>();
  const data = useBudgetStore((s) => s.data);
  const setCoverTarget = useBudgetStore((s) => s.setCoverTarget);

  const excludeSet = useMemo(
    () => new Set([...(excludeIds?.split(',') ?? []), overspentCatId].filter(Boolean)),
    [excludeIds, overspentCatId],
  );

  const groups = useMemo<GroupedCategory[]>(() => {
    if (!data) return [];
    return data.groups
      .filter((g) => !g.is_income)
      .map((g) => ({
        groupId: g.id,
        groupName: g.name,
        categories: g.categories
          .filter((c) => !excludeSet.has(c.id) && c.balance > 0)
          .map((c) => ({ id: c.id, name: c.name, balance: c.balance })),
      }))
      .filter((g) => g.categories.length > 0);
  }, [data, excludeSet]);

  return (
    <CategoryPickerList
      title="Cover overspending from"
      groups={groups}
      onSelect={(cat) => {
        setCoverTarget({ catId: cat.id, catName: cat.name, balance: cat.balance });
        router.back();
      }}
      renderRight={(cat) => <Amount value={cat.balance} variant="bodySm" weight="600" />}
      emptyMessage="No categories with positive balance"
    />
  );
}
