import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { createCategory } from "@/categories";
import { Text } from "@/presentation/components/atoms/Text";
import { Input } from "@/presentation/components/atoms/Input";

export default function NewCategoryScreen() {
  const { t } = useTranslation("budget");
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed || !groupId || saving) return;
    setSaving(true);
    try {
      await createCategory({ name: trimmed, cat_group: groupId });
      router.back();
    } finally {
      setSaving(false);
    }
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
        <Stack.Toolbar.Button
          icon="xmark"
          onPress={() => router.back()}
        />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          variant="done"
          tintColor={colors.primary}
          onPress={handleSave}
          disabled={!name.trim() || saving}
        >
          {t("save")}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      <Text variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.xs }}>
        {t("categoryNameLabel")}
      </Text>
      <Input
        value={name}
        onChangeText={setName}
        placeholder={t("newCategoryPlaceholder")}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleSave}
      />
    </ScrollView>
  );
}
