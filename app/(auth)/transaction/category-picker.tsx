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
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
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
      {/* No category — standalone card */}
      <View style={styles.standaloneCard}>
        <Pressable
          style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          onPress={() => select(null, '')}
        >
          <Text variant="body" color={colors.textMuted} style={styles.catName}>
            No category
          </Text>
          {noneSelected && (
            <Ionicons name="checkmark" size={20} color={colors.primary} />
          )}
        </Pressable>
      </View>

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
              <View style={styles.sectionHeader}>
                <Text
                  variant="captionSm"
                  color={colors.textMuted}
                  style={styles.sectionText}
                >
                  {g.name.toUpperCase()}
                </Text>
              </View>
              <View style={styles.groupCard}>
                {cats.map((c, i) => {
                  const balance = balanceMap.get(c.id);
                  const balanceColor =
                    balance === undefined
                      ? colors.textMuted
                      : balance > 0
                        ? colors.positive
                        : balance < 0
                          ? colors.negative
                          : colors.textMuted;
                  const isSelected = c.id === selectedId;
                  const isLast = i === cats.length - 1;
                  return (
                    <Pressable
                      key={c.id}
                      style={({ pressed }) => [
                        styles.item,
                        !isLast && { borderBottomWidth: bw.thin, borderBottomColor: colors.divider },
                        pressed && styles.pressed,
                      ]}
                      onPress={() => select(c.id, c.name)}
                    >
                      <Text
                        variant="body"
                        color={colors.textPrimary}
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
                        <Ionicons name="checkmark" size={20} color={colors.primary} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
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
  sectionHeader: {
    paddingHorizontal: theme.spacing.lg + theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  sectionText: {
    fontWeight: '700' as const,
    letterSpacing: 0.8,
  },
  standaloneCard: {
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth.thin,
    borderColor: theme.colors.cardBorder,
    overflow: 'hidden' as const,
  },
  groupCard: {
    marginHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth.thin,
    borderColor: theme.colors.cardBorder,
    overflow: 'hidden' as const,
  },
  item: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    minHeight: 44,
  },
  pressed: {
    opacity: 0.7,
  },
  catName: {
    flex: 1,
  },
  balance: {
    marginRight: theme.spacing.sm,
  },
});
