import { useState } from "react";
import { Pressable, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { useCategoriesStore } from "@/stores/categoriesStore";
import { useBudgetStore } from "@/stores/budgetStore";
import { Text } from "@/presentation/components/atoms/Text";
import { Button } from "@/presentation/components/atoms/Button";
import { Input } from "@/presentation/components/atoms/Input";

export default function NewGroupScreen() {
  const { t } = useTranslation("budget");
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await useCategoriesStore.getState().createGroup(trimmed);
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
          headerLeft: () => (
            <Button
              icon="close"
              buttonStyle="borderless"
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
      <Input
        value={name}
        onChangeText={setName}
        placeholder={t("newGroupPlaceholder")}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleSave}
      />
    </View>
  );
}
