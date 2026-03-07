import { useEffect, useState } from 'react';
import { Alert, Pressable, Switch, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../../src/presentation/providers/ThemeProvider';
import { useCategoriesStore } from '../../../src/stores/categoriesStore';
import { useBudgetStore } from '../../../src/stores/budgetStore';
import { useUndoStore } from '../../../src/stores/undoStore';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { Button } from '../../../src/presentation/components/atoms/Button';
import { IconButton } from '../../../src/presentation/components/atoms/IconButton';
import { parseGoalDef } from '../../../src/goals';
import { describeTemplate } from '../../../src/goals/describe';

export default function EditCategoryScreen() {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const categories = useCategoriesStore((s) => s.categories);
  const groups = useCategoriesStore((s) => s.groups);
  const category = categories.find((c) => c.id === categoryId);
  const parentGroup = groups.find((g) => g.id === category?.cat_group);

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const busy = saving || deleting;

  useEffect(() => {
    if (category) setName(category.name);
  }, [category?.id]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed || !categoryId || busy) return;
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
    if (!categoryId || busy) return;
    Alert.alert(
      'Delete Category',
      `Are you sure you want to delete "${category?.name ?? 'this category'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await useCategoriesStore.getState().deleteCategory(categoryId);
              await useCategoriesStore.getState().load();
              await useBudgetStore.getState().load();
              useUndoStore.getState().showUndo('Category deleted');
              router.back();
            } catch {
              setDeleting(false);
              Alert.alert('Error', 'Could not delete the category. Please try again.');
            }
          },
        },
      ],
    );
  }

  const templates = parseGoalDef(category?.goal_def ?? null);
  const hasGoal = templates.length > 0;
  const goalDescription = hasGoal ? describeTemplate(templates[0]) : null;

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

      {/* Category name */}
      <Text
        variant="caption"
        color={colors.textMuted}
        style={{ marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: 0.5 }}
      >
        Category Name
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Category name"
        placeholderTextColor={colors.textMuted}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleSave}
        accessibilityLabel="Category name"
        style={{
          backgroundColor: colors.cardBackground,
          color: colors.textPrimary,
          fontSize: 16,
          padding: spacing.md,
          borderRadius: br.md,
          borderWidth: bw.thin,
          borderColor: colors.inputBorder,
        }}
      />

      {/* Goal target — disclosure row */}
      <View style={{ marginTop: spacing.lg }}>
        <Text
          variant="caption"
          color={colors.textMuted}
          style={{ marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: 0.5 }}
        >
          Target
        </Text>
        <Pressable
          onPress={() => {
            if (categoryId) {
              router.push({ pathname: '/(auth)/budget/goal', params: { categoryId } });
            }
          }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.cardBackground,
            borderRadius: br.md,
            borderWidth: bw.thin,
            borderColor: colors.divider,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.md,
            minHeight: 44,
            opacity: pressed ? 0.7 : 1,
          })}
          accessibilityRole="button"
          accessibilityLabel={
            hasGoal
              ? `Target: ${goalDescription}`
              : 'Target: Not set'
          }
          accessibilityHint={hasGoal ? 'Opens target editor' : 'Opens target setup'}
        >
          <Text variant="body" color={colors.textPrimary} style={{ marginRight: spacing.sm }}>
            Target
          </Text>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            {goalDescription ? (
              <Text variant="bodySm" color={colors.textSecondary} numberOfLines={1}>
                {goalDescription}
              </Text>
            ) : (
              <Text variant="bodySm" color={colors.primary} style={{ fontWeight: '600' }}>
                Add
              </Text>
            )}
          </View>
          <Ionicons
            name={hasGoal ? 'chevron-forward' : 'add-circle'}
            size={hasGoal ? 16 : 18}
            color={hasGoal ? colors.textMuted : colors.primary}
            style={{ marginLeft: spacing.xs }}
          />
        </Pressable>
      </View>

      {/* Hidden toggle — only if parent group is not hidden */}
      {parentGroup && !parentGroup.hidden && (
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
            value={category?.hidden ?? false}
            onValueChange={async (val) => {
              if (!categoryId) return;
              await useCategoriesStore.getState().updateCategory(categoryId, { hidden: val });
              await useCategoriesStore.getState().load();
              await useBudgetStore.getState().load();
            }}
            trackColor={{ true: colors.primary }}
          />
        </View>
      )}

      {/* Save */}
      <Button
        title="Save"
        variant="primary"
        onPress={handleSave}
        disabled={!name.trim() || busy}
        loading={saving}
        style={{ marginTop: spacing.xl, borderRadius: 999 }}
      />

      {/* Delete — separated from Save, ghost style */}
      <View style={{ marginTop: spacing.xl }}>
        <Button
          title="Delete Category"
          variant="ghost"
          icon="trash-outline"
          textColor={colors.negative}
          onPress={handleDelete}
          disabled={busy}
          loading={deleting}
        />
      </View>
    </View>
  );
}
