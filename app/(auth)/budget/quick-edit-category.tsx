import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { useCategoriesStore } from "@/stores/categoriesStore";
import { useBudgetStore } from "@/stores/budgetStore";
import { useUndoStore } from "@/stores/undoStore";
import { Text } from "@/presentation/components/atoms/Text";
import { Button } from "@/presentation/components/atoms/Button";
import { IconButton } from "@/presentation/components/atoms/IconButton";
import { parseGoalDef } from "@/goals";
import { describeTemplate, translateDescription } from "@/goals/describe";
import i18n from "@/i18n/config";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";

export default function QuickEditCategoryScreen() {
  const { t } = useTranslation("budget");
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const goalsEnabled = useFeatureFlag("goalTemplatesEnabled");
  const router = useRouter();
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();

  const categories = useCategoriesStore((s) => s.categories);
  const category = categories.find((c) => c.id === categoryId);
  const coverTarget = useBudgetStore((s) => s.coverTarget);
  const setCoverTarget = useBudgetStore((s) => s.setCoverTarget);

  const [name, setName] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (category) setName(category.name);
  }, [category?.id]);

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && trimmed !== category?.name && !saving;

  // Goal description
  const templates = parseGoalDef(category?.goal_def ?? null);
  const goalDesc = templates.length > 0 ? describeTemplate(templates[0], i18n.language) : null;
  const goalDescription = goalDesc ? translateDescription(goalDesc, t) : null;

  async function handleSaveName() {
    setEditing(false);
    if (!categoryId || saving) return;
    if (!trimmed || trimmed === category?.name) {
      setName(category?.name ?? "");
      return;
    }
    setSaving(true);
    try {
      await useCategoriesStore.getState().updateCategory(categoryId, { name: trimmed });
      await useCategoriesStore.getState().load();
      await useBudgetStore.getState().load();
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!categoryId) return;
    Alert.alert(
      t("deleteCategoryTitle"),
      t("deleteCategoryWithTransfers", { name: category?.name ?? t("category") }),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("selectCategory"),
          onPress: () => {
            setCoverTarget(null);
            setPendingDelete(true);
            router.push({
              pathname: "/(auth)/budget/delete-category-picker",
              params: { excludeIds: categoryId, moveCatId: categoryId },
            });
          },
        },
      ],
    );
  }

  // Complete deletion after user picks a transfer category
  useEffect(() => {
    if (!pendingDelete || !coverTarget || !categoryId) return;
    (async () => {
      try {
        await useCategoriesStore.getState().deleteCategory(categoryId, coverTarget.catId);
        await useCategoriesStore.getState().load();
        await useBudgetStore.getState().load();
        useUndoStore.getState().showUndo(t("categoryDeleted"));
        setCoverTarget(null);
        setPendingDelete(false);
        router.back();
      } catch {
        setPendingDelete(false);
        setCoverTarget(null);
        Alert.alert(t("errorTitle"), t("couldNotDeleteCategory"));
      }
    })();
  }, [pendingDelete, coverTarget, categoryId, setCoverTarget, router]);

  const labelStyle = {
    marginBottom: spacing.xs,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  };

  return (
    <View style={{ backgroundColor: colors.pageBackground, padding: spacing.lg, paddingTop: 72 }}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <IconButton
              sfSymbol="xmark"
              size={22}
              color={colors.headerText}
              onPress={() => router.back()}
            />
          ),
        }}
      />

      {/* Category Name */}
      <Text variant="caption" color={colors.textMuted} style={labelStyle}>
        {t("categoryName")}
      </Text>
      {editing ? (
        <TextInput
          ref={inputRef}
          value={name}
          onChangeText={setName}
          placeholder={t("categoryNamePlaceholder")}
          placeholderTextColor={colors.textMuted}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSaveName}
          onBlur={handleSaveName}
          style={{
            backgroundColor: colors.cardBackground,
            color: colors.textPrimary,
            fontSize: 16,
            padding: spacing.md,
            borderRadius: br.full,
            borderWidth: bw.thin,
            borderColor: colors.primary,
          }}
        />
      ) : (
        <Pressable
          onPress={() => {
            setEditing(true);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          style={{
            backgroundColor: colors.cardBackground,
            padding: spacing.md,
            borderRadius: br.full,
            borderWidth: bw.thin,
            borderColor: colors.divider,
          }}
        >
          <Text variant="body" color={colors.textPrimary} numberOfLines={1}>
            {name || t("categoryNamePlaceholder")}
          </Text>
        </Pressable>
      )}

      {/* Target */}
      {goalsEnabled && (
        <>
          <Text
            variant="caption"
            color={colors.textMuted}
            style={[labelStyle, { marginTop: spacing.lg }]}
          >
            {t("target")}
          </Text>
          <View
            style={{
              backgroundColor: colors.cardBackground,
              borderRadius: br.lg,
              borderWidth: bw.thin,
              borderColor: colors.divider,
              padding: spacing.md,
              paddingHorizontal: spacing.lg,
              alignItems: "center",
              gap: spacing.sm,
            }}
          >
            <Text
              variant="body"
              color={goalDescription ? colors.textPrimary : colors.textMuted}
              numberOfLines={1}
            >
              {goalDescription ?? t("noTargetSet")}
            </Text>
            <Button
              title={goalDescription ? t("editTarget") : t("setTarget")}
              variant="secondary"
              size="md"
              style={{ alignSelf: "stretch" }}
              icon="flag-outline"
              onPress={() => {
                if (categoryId) {
                  router.navigate({
                    pathname: "/(auth)/budget/goal",
                    params: { categoryId },
                  });
                }
              }}
            />
          </View>
        </>
      )}

      {/* Hide + Delete side by side */}
      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
        <Button
          title={category?.hidden ? t("show") : t("hide")}
          variant="secondary"
          size="md"
          icon={category?.hidden ? "eye-outline" : "eye-off-outline"}
          style={{ flex: 1 }}
          onPress={async () => {
            if (!categoryId) return;
            await useCategoriesStore
              .getState()
              .updateCategory(categoryId, { hidden: !category?.hidden });
            await useCategoriesStore.getState().load();
            await useBudgetStore.getState().load();
          }}
        />
        <Button
          title={t("delete")}
          variant="danger"
          size="md"
          icon="trash-outline"
          style={{ flex: 1 }}
          onPress={handleDelete}
        />
      </View>
    </View>
  );
}
