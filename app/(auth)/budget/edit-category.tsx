import { useEffect, useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../../src/presentation/providers/ThemeProvider';
import { useCategoriesStore } from '../../../src/stores/categoriesStore';
import { useBudgetStore } from '../../../src/stores/budgetStore';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { Button } from '../../../src/presentation/components/atoms/Button';
import { IconButton } from '../../../src/presentation/components/atoms/IconButton';

export default function EditCategoryScreen() {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const categories = useCategoriesStore((s) => s.categories);
  const category = categories.find((c) => c.id === categoryId);

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (category) setName(category.name);
  }, [category?.id]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed || !categoryId || saving) return;
    if (trimmed === category?.name) {
      router.back();
      return;
    }
    setSaving(true);
    try {
      await useCategoriesStore.getState().updateCategory(categoryId, { name: trimmed });
      await useCategoriesStore.getState().load();
      await useBudgetStore.getState().load();
      router.back();
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!categoryId) return;
    Alert.alert(
      'Delete Category',
      `Are you sure you want to delete "${category?.name ?? 'this category'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await useCategoriesStore.getState().deleteCategory(categoryId);
            await useCategoriesStore.getState().load();
            await useBudgetStore.getState().load();
            router.back();
          },
        },
      ],
    );
  }

  return (
    <View style={{ backgroundColor: colors.headerBackground, padding: spacing.lg, paddingTop: 72 }}>
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

      <Text variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.xs }}>
        CATEGORY NAME
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Category name"
        placeholderTextColor={colors.textMuted}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleSave}
        style={{
          backgroundColor: colors.cardBackground,
          color: colors.textPrimary,
          fontSize: 16,
          padding: spacing.md,
          borderRadius: br.md,
          borderWidth: bw.thin,
          borderColor: colors.divider,
        }}
      />

      <Button
        title="Save"
        variant="primary"
        onPress={handleSave}
        disabled={!name.trim()}
        loading={saving}
        style={{ marginTop: spacing.lg, borderRadius: 999 }}
      />

      <Button
        title="Delete Category"
        variant="danger"
        icon="trash-outline"
        onPress={handleDelete}
        style={{ marginTop: spacing.sm, borderRadius: 999 }}
      />
    </View>
  );
}
