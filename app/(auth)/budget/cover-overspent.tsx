import { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/presentation/providers/ThemeProvider';
import { useBudgetStore } from '../../../src/stores/budgetStore';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { Amount } from '../../../src/presentation/components/atoms/Amount';
import { IconButton } from '../../../src/presentation/components/atoms/IconButton';

type OverspentCategory = {
  id: string;
  name: string;
  balance: number;
  groupName: string;
};

export default function CoverOverspentScreen() {
  const { t } = useTranslation('budget');
  const { colors, spacing, borderRadius: br } = useTheme();
  const router = useRouter();
  const data = useBudgetStore((s) => s.data);

  const overspentCategories = useMemo<OverspentCategory[]>(() => {
    if (!data) return [];
    return data.groups
      .filter((g) => !g.is_income)
      .flatMap((g) =>
        g.categories
          .filter((c) => c.balance < 0 && !c.carryover)
          .map((c) => ({ id: c.id, name: c.name, balance: c.balance, groupName: g.name })),
      );
  }, [data]);

  const pillBg = colors.cardBackground;
  const pillBorder = colors.cardBorder;
  const amountBadgeBg = colors.budgetOverspentBg;
  const amountBadgeColor = colors.budgetOverspent;

  function handleSelect(cat: OverspentCategory) {
    router.push({
      pathname: '/(auth)/budget/cover-source',
      params: { catId: cat.id, catName: cat.name, balance: String(cat.balance) },
    });
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.pageBackground }}
      contentContainerStyle={{ paddingTop: 72, paddingBottom: spacing.xl }}
    >
      <Stack.Screen
        options={{
          headerLeft: () => (
            <IconButton
              sfSymbol="xmark"
              size={22}
              color={colors.headerText}
              onPress={() => router.back()}
            />
          ),
        }}
      />

      <Text
        variant="bodySm"
        color={colors.textSecondary}
        style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}
      >
        {t('selectCategoryTocover')}
      </Text>

      <View
        style={{
          paddingHorizontal: spacing.lg,
          gap: spacing.sm,
        }}
      >
        {overspentCategories.map((cat) => (
          <Pressable
            key={cat.id}
            onPress={() => handleSelect(cat)}
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                minHeight: 44,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: br.full,
                backgroundColor: pillBg,
                borderWidth: 1,
                borderColor: pillBorder,
              },
              pressed && { opacity: 0.72 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('coverOverspendingAccessibility', { name: cat.name })}
          >
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <Text variant="body" color={colors.textPrimary} numberOfLines={1}>
                {cat.name}
              </Text>
            </View>

            <View
              style={{
                backgroundColor: amountBadgeBg,
                borderRadius: br.full,
                paddingHorizontal: 10,
                paddingVertical: 3,
              }}
            >
              <Amount
                value={cat.balance}
                variant="captionSm"
                color={amountBadgeColor}
                weight="600"
              />
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
