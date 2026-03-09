import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../../src/presentation/providers/ThemeProvider';
import { useCategoriesStore } from '../../../src/stores/categoriesStore';
import { useBudgetStore } from '../../../src/stores/budgetStore';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { Button } from '../../../src/presentation/components/atoms/Button';
import { IconButton } from '../../../src/presentation/components/atoms/IconButton';

export default function NewCategoryScreen() {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed || !groupId || saving) return;
    setSaving(true);
    try {
      await useCategoriesStore.getState().createCategory(trimmed, groupId);
      await useCategoriesStore.getState().load();
      await useBudgetStore.getState().load();
      router.back();
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ backgroundColor: colors.pageBackground, padding: spacing.lg, paddingTop: 72 }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              icon="close"
              size={22}
              color={colors.headerText}
              onPress={() => router.back()}
            />
          ),
        }}
      />

      <Text variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.xs }}>
        CATEGORY NAME
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. Rent, Groceries, Internet"
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
    </View>
  );
}
