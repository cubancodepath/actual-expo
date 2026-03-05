import { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
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
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const data = useBudgetStore((s) => s.data);
  const setCoverTarget = useBudgetStore((s) => s.setCoverTarget);

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

  function handleSelect(cat: OverspentCategory) {
    setCoverTarget({ catId: cat.id, catName: cat.name, balance: cat.balance });
    router.back();
  }

  return (
    <View style={{ backgroundColor: colors.headerBackground, paddingTop: 72 }}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <IconButton
              icon="close"
              size={22}
              color={colors.headerText}
              onPress={() => router.back()}
            />
          ),
          headerRight: () => null,
        }}
      />

      <Text
        variant="bodySm"
        color={colors.textSecondary}
        style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}
      >
        Choose a category to cover its overspending.
      </Text>

      <ScrollView>
        <View
          style={{
            marginHorizontal: spacing.lg,
            borderRadius: br.md,
            backgroundColor: colors.cardBackground,
            borderWidth: bw.thin,
            borderColor: colors.cardBorder,
            overflow: 'hidden',
          }}
        >
          {overspentCategories.map((cat, index) => (
            <Pressable
              key={cat.id}
              onPress={() => handleSelect(cat)}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  minHeight: 52,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                },
                index < overspentCategories.length - 1 && {
                  borderBottomWidth: bw.thin,
                  borderBottomColor: colors.divider,
                },
                pressed && { backgroundColor: colors.inputBackground },
              ]}
              accessibilityRole="button"
            >
              <View style={{ flex: 1 }}>
                <Text variant="bodyLg" color={colors.textPrimary}>
                  {cat.name}
                </Text>
                <Text variant="captionSm" color={colors.textMuted}>
                  {cat.groupName}
                </Text>
              </View>
              <Amount value={cat.balance} variant="body" weight="600" />
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textMuted}
                style={{ marginLeft: spacing.sm }}
              />
            </Pressable>
          ))}
        </View>
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}
