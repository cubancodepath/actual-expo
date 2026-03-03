import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCategoriesStore } from '../../../src/stores/categoriesStore';
import { usePickerStore } from '../../../src/stores/pickerStore';
import { getCategoryBalancesForMonth } from '../../../src/budgets';
import { useTheme, useThemedStyles } from '../../../src/presentation/providers/ThemeProvider';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { formatBalance } from '../../../src/lib/format';
import { currentMonth } from '../../../src/lib/date';
import type { Theme } from '../../../src/theme';

export default function CategoryPickerScreen() {
  const { month, selectedId } = useLocalSearchParams<{ month?: string; selectedId?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { groups, categories, load } = useCategoriesStore();
  const setCategory = usePickerStore((s) => s.setCategory);
  const [balanceMap, setBalanceMap] = useState<Map<string, number>>(new Map());

  const displayMonth = month || currentMonth();

  useEffect(() => {
    if (groups.length === 0) load();
    getCategoryBalancesForMonth(displayMonth)
      .then(setBalanceMap)
      .catch(() => {});
  }, [displayMonth]);

  function select(id: string | null, name: string) {
    setCategory({ id, name });
    router.back();
  }

  const noneSelected = !selectedId;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.list}
    >
      {/* No category */}
      <Pressable
        style={styles.item}
        onPress={() => select(null, '')}
      >
        <Text variant="body" color={theme.colors.textMuted} style={styles.catName}>
          No category
        </Text>
        {noneSelected && (
          <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
        )}
      </Pressable>

      {groups
        .filter((g) => !g.hidden && !g.tombstone)
        .sort((a, b) => {
          if (a.is_income !== b.is_income) return a.is_income ? 1 : -1;
          return (a.sort_order ?? 0) - (b.sort_order ?? 0);
        })
        .map((g) => {
          const cats = categories
            .filter((c) => c.cat_group === g.id && !c.hidden && !c.tombstone)
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
          if (cats.length === 0) return null;
          return (
            <View key={g.id}>
              <View style={styles.groupHeader}>
                <Text
                  variant="captionSm"
                  color={theme.colors.textMuted}
                  style={styles.groupText}
                >
                  {g.name.toUpperCase()}
                </Text>
              </View>
              {cats.map((c) => {
                const balance = balanceMap.get(c.id);
                const balanceColor =
                  balance === undefined
                    ? theme.colors.textMuted
                    : balance > 0
                      ? theme.colors.positive
                      : balance < 0
                        ? theme.colors.negative
                        : theme.colors.textMuted;
                const isSelected = c.id === selectedId;
                return (
                  <Pressable
                    key={c.id}
                    style={styles.item}
                    onPress={() => select(c.id, c.name)}
                  >
                    <Text
                      variant="body"
                      color={theme.colors.textPrimary}
                      style={styles.catName}
                    >
                      {c.name}
                    </Text>
                    {balance !== undefined && (
                      <Text variant="caption" color={balanceColor} style={styles.balance}>
                        {formatBalance(balance)}
                      </Text>
                    )}
                    {isSelected && (
                      <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          );
        })}
    </ScrollView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
  },
  list: {
    paddingBottom: 40,
  },
  groupHeader: {
    backgroundColor: theme.colors.pageBackground,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: theme.borderWidth.default,
    borderBottomColor: theme.colors.divider,
  },
  groupText: {
    fontWeight: '700' as const,
    letterSpacing: 1,
  },
  item: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: theme.borderWidth.default,
    borderBottomColor: theme.colors.divider,
    backgroundColor: theme.colors.cardBackground,
  },
  catName: {
    flex: 1,
  },
  balance: {
    marginRight: theme.spacing.sm,
  },
});
