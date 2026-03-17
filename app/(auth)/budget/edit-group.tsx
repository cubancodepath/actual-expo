import { useEffect, useState } from "react";
import { Alert, Pressable, Switch, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { useCategoriesStore } from "@/stores/categoriesStore";
import { useBudgetStore } from "@/stores/budgetStore";
import { useUndoStore } from "@/stores/undoStore";
import { Text } from "@/presentation/components/atoms/Text";
import { Button } from "@/presentation/components/atoms/Button";
import { IconButton } from "@/presentation/components/atoms/IconButton";

export default function EditGroupScreen() {
  const { t } = useTranslation("budget");
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const groups = useCategoriesStore((s) => s.groups);
  const group = groups.find((g) => g.id === groupId);

  const [name, setName] = useState("");
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
    Alert.alert(t("deleteGroupTitle"), t("deleteGroupMessageEmpty", { name: group?.name ?? "" }), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: async () => {
          await useCategoriesStore.getState().deleteCategoryGroup(groupId);
          await useCategoriesStore.getState().load();
          await useBudgetStore.getState().load();
          useUndoStore.getState().showUndo(t("categoryGroupDeleted"));
          router.back();
        },
      },
    ]);
  }

  return (
    <View style={{ backgroundColor: colors.pageBackground, padding: spacing.lg, paddingTop: 72 }}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <IconButton
              name="close"
              size={22}
              color={colors.headerText}
              onPress={() => router.back()}
            />
          ),
          headerRight: () => (
            <Pressable onPress={handleSave} hitSlop={8} disabled={!name.trim() || saving}>
              <Text
                variant="body"
                color={name.trim() && !saving ? colors.primary : colors.textMuted}
                style={{ fontWeight: "600", fontSize: 17 }}
              >
                {t("save")}
              </Text>
            </Pressable>
          ),
        }}
      />

      <Text variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.xs }}>
        {t("groupNameLabel")}
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t("groupNamePlaceholder")}
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
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: colors.cardBackground,
            borderRadius: br.md,
            borderWidth: bw.thin,
            borderColor: colors.divider,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
            marginTop: spacing.lg,
          }}
        >
          <Text variant="body" color={colors.textPrimary}>
            {t("hidden")}
          </Text>
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
        title={t("deleteGroup")}
        variant="danger"
        icon="trashOutline"
        onPress={handleDelete}
        style={{ marginTop: spacing.sm, borderRadius: 999 }}
      />
    </View>
  );
}
