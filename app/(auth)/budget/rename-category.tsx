import { useState } from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/design-system/providers/ThemeProvider";
import { updateCategory } from "@/core/domain/categories";
import { Text } from "@/design-system/atoms/Text";
import { Button } from "@/design-system/atoms/Button";
import { Input } from "@/design-system/atoms/Input";

export default function RenameCategoryScreen() {
  const { t } = useTranslation("budget");
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { categoryId, currentName } = useLocalSearchParams<{
    categoryId: string;
    currentName: string;
  }>();
  const [name, setName] = useState(currentName ?? "");

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && trimmed !== currentName;

  function handleSave() {
    if (!canSave || !categoryId) return;
    updateCategory(categoryId, { name: trimmed });
    router.back();
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
            <Button
              title={t("save")}
              buttonStyle="borderless"
              size="sm"
              color={canSave ? colors.textPrimary : colors.textMuted}
              onPress={handleSave}
              disabled={!canSave}
            />
          ),
        }}
      />

      <Text variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.xs }}>
        {t("categoryNameLabel")}
      </Text>
      <Input
        value={name}
        onChangeText={setName}
        placeholder={t("categoryNamePlaceholder")}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleSave}
      />
    </View>
  );
}
