import { useEffect, useState } from 'react';
import { Alert, Switch, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../../src/presentation/providers/ThemeProvider';
import { useCategoriesStore } from '../../../src/stores/categoriesStore';
import { useBudgetStore } from '../../../src/stores/budgetStore';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { Button } from '../../../src/presentation/components/atoms/Button';
import { IconButton } from '../../../src/presentation/components/atoms/IconButton';

export default function EditGroupScreen() {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const groups = useCategoriesStore((s) => s.groups);
  const group = groups.find((g) => g.id === groupId);

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (group) setName(group.name);
  }, [group?.id]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed || !groupId || saving) return;
    if (trimmed === group?.name) {
      router.back();
      return;
    }
    setSaving(true);
    try {
      await useCategoriesStore.getState().updateCategoryGroup(groupId, { name: trimmed });
      await useCategoriesStore.getState().load();
      await useBudgetStore.getState().load();
      router.back();
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!groupId) return;
    Alert.alert(
      'Delete Group',
      `Are you sure you want to delete "${group?.name ?? 'this group'}" and all its categories?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await useCategoriesStore.getState().deleteCategoryGroup(groupId);
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
        GROUP NAME
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Group name"
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

      {/* Hidden toggle — not shown for income groups */}
      {group && !group.is_income && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.cardBackground,
            borderRadius: br.md,
            borderWidth: bw.thin,
            borderColor: colors.divider,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
            marginTop: spacing.lg,
          }}
        >
          <Text variant="body" color={colors.textPrimary}>Hidden</Text>
          <Switch
            value={group.hidden}
            onValueChange={async (val) => {
              if (!groupId) return;
              await useCategoriesStore.getState().updateCategoryGroup(groupId, { hidden: val });
              await useCategoriesStore.getState().load();
              await useBudgetStore.getState().load();
            }}
            trackColor={{ true: colors.primary }}
          />
        </View>
      )}

      <Button
        title="Save"
        variant="primary"
        onPress={handleSave}
        disabled={!name.trim()}
        loading={saving}
        style={{ marginTop: spacing.lg, borderRadius: 999 }}
      />

      <Button
        title="Delete Group"
        variant="danger"
        icon="trash-outline"
        onPress={handleDelete}
        style={{ marginTop: spacing.sm, borderRadius: 999 }}
      />
    </View>
  );
}
