import { useEffect, useState } from "react";
import { Alert, ScrollView } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { useCategoriesStore } from "@/stores/categoriesStore";
import { useBudgetStore } from "@/stores/budgetStore";
import { useUndoStore } from "@/stores/undoStore";
import { mutate } from "@/stores/mutate";
import { updateCategoryGroup } from "@/categories";
import { Text } from "@/presentation/components/atoms/Text";
import { Button } from "@/presentation/components/atoms/Button";
import { Input } from "@/presentation/components/atoms/Input";

export default function EditGroupScreen() {
  const { t } = useTranslation("budget");
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const groups = useCategoriesStore((s) => s.groups);
  const group = groups.find((g) => g.id === groupId);

  const [name, setName] = useState("");

  useEffect(() => {
    if (group) setName(group.name);
  }, [group?.id]);

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && trimmed !== group?.name;

  function handleSave() {
    if (!trimmed || !groupId) return;
    if (trimmed === group?.name) {
      router.back();
      return;
    }
    mutate.update(useCategoriesStore, "groups", groupId, { name: trimmed },
      () => updateCategoryGroup(groupId, { name: trimmed }),
    );
    router.back();
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
          useUndoStore.getState().showUndo(t("categoryGroupDeleted"));
          router.back();
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.pageBackground }}
      contentContainerStyle={{ padding: spacing.lg }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{}} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="xmark" onPress={() => router.back()} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          variant="done"
          tintColor={colors.primary}
          onPress={handleSave}
          disabled={!canSave}
        >
          {t("save")}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      {/* Group Name */}
      <Text
        variant="caption"
        color={colors.textMuted}
        style={{ marginBottom: spacing.xs, textTransform: "uppercase", letterSpacing: 0.5 }}
      >
        {t("groupNameLabel")}
      </Text>
      <Input
        value={name}
        onChangeText={setName}
        placeholder={t("groupNamePlaceholder")}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleSave}
      />

      {/* Hidden toggle — not shown for income groups */}
      {group && !group.is_income && (
        <Button
          title={group.hidden ? t("showGroup") : t("hideGroup")}
          buttonStyle="borderedSecondary"
          size="lg"
          icon={group.hidden ? "eyeOutline" : "eyeOffOutline"}
          style={{ alignSelf: "stretch", marginTop: spacing.md }}
          onPress={() => {
            if (!groupId) return;
            mutate.update(useCategoriesStore, "groups", groupId, { hidden: !group.hidden },
              () => updateCategoryGroup(groupId, { hidden: !group.hidden }),
            );
          }}
        />
      )}

      {/* Delete — separated per HIG */}
      <Button
        title={t("deleteGroup")}
        buttonStyle="borderless"
        danger
        icon="trashOutline"
        onPress={handleDelete}
        style={{ marginTop: spacing.lg }}
      />
    </ScrollView>
  );
}
