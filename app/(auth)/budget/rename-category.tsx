import { useState } from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { useCategoriesStore } from "@/stores/categoriesStore";
import { mutate } from "@/stores/mutate";
import { updateCategory } from "@/categories";
import { Text } from "@/presentation/components/atoms/Text";
import { Button } from "@/presentation/components/atoms/Button";
import { Input } from "@/presentation/components/atoms/Input";

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
    mutate.update(useCategoriesStore, "categories", categoryId, { name: trimmed },
      () => updateCategory(categoryId, { name: trimmed }),
    );
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
