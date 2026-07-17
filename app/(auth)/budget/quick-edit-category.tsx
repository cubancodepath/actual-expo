import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, type TextInput, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/design-system/providers/ThemeProvider";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { useUndoStore } from "@/stores/undoStore";
import { updateCategory, deleteCategory } from "@/core/domain/categories";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import { useCategories } from "@/hooks/useCategories";
import { Text } from "@/design-system/atoms/Text";
import { Button } from "@/design-system/atoms/Button";
import { Input } from "@/design-system/atoms/Input";
import { parseGoalDef } from "@/core/domain/goals";
import { describeTemplate, translateDescription } from "@/core/domain/goals/describe";
import i18n from "@/i18n/config";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";

export default function QuickEditCategoryScreen() {
  const { t } = useTranslation("budget");
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const goalsEnabled = useFeatureFlag("goalTemplatesEnabled");
  const router = useRouter();
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();

  const { categories, groups } = useCategories();
  const category = categories.find((c) => c.id === categoryId);
  const isIncome = groups.find((g) => g.id === category?.cat_group)?.is_income ?? false;
  const pickedCategory = useBudgetUIStore((s) => s.pickedCategory);
  const setPickedCategory = useBudgetUIStore((s) => s.setPickedCategory);

  const [name, setName] = useState("");
  const [editing, setEditing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (category) setName(category.name);
  }, [category?.id]);

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && trimmed !== category?.name;

  // Goal description
  const templates = parseGoalDef(category?.goal_def ?? null);
  const goalDesc = templates.length > 0 ? describeTemplate(templates[0], i18n.language) : null;
  const goalDescription = goalDesc ? translateDescription(goalDesc, t) : null;

  function handleSaveName() {
    setEditing(false);
    if (!categoryId) return;
    if (!trimmed || trimmed === category?.name) {
      setName(category?.name ?? "");
      return;
    }
    updateCategory(categoryId, { name: trimmed });
  }

  function handleDelete() {
    if (!categoryId) return;
    Alert.alert(
      t("deleteCategoryTitle"),
      t("deleteCategoryWithTransfers", {
        name: category?.name ?? t("category"),
      }),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("selectCategory"),
          onPress: () => {
            setPickedCategory(null);
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
    if (!pendingDelete || !pickedCategory || !categoryId) return;
    (async () => {
      try {
        await deleteCategory(categoryId, pickedCategory.catId);
        useUndoStore.getState().showUndo(t("categoryDeleted"));
        setPickedCategory(null);
        setPendingDelete(false);
        router.back();
      } catch (e) {
        emitErrorEvent(e);
        setPendingDelete(false);
        setPickedCategory(null);
        Alert.alert(t("errorTitle"), t("couldNotDeleteCategory"));
      }
    })();
  }, [pendingDelete, pickedCategory, categoryId, setPickedCategory, router]);

  const labelStyle = {
    marginBottom: spacing.xs,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  };

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
          onPress={handleSaveName}
          disabled={!canSave}
        >
          {t("save")}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      {/* Category Name */}
      <Text variant="caption" color={colors.textMuted} style={labelStyle}>
        {t("categoryName")}
      </Text>
      {editing ? (
        <Input
          ref={inputRef}
          value={name}
          onChangeText={setName}
          placeholder={t("categoryNamePlaceholder")}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSaveName}
          onBlur={handleSaveName}
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

      {/* Target (not for income categories) */}
      {goalsEnabled && !isIncome && (
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
              buttonStyle="borderedSecondary"
              size="lg"
              style={{ alignSelf: "stretch" }}
              icon="flagOutline"
              onPress={() => {
                if (categoryId) {
                  router.navigate({
                    pathname: "/(auth)/budget/goal",
                    params: { categoryId, dismissCount: "2" },
                  });
                }
              }}
            />
          </View>
        </>
      )}

      {/* Hide */}
      <Button
        title={category?.hidden ? t("show") : t("hide")}
        buttonStyle="borderedSecondary"
        size="lg"
        icon={category?.hidden ? "eyeOutline" : "eyeOffOutline"}
        style={{ alignSelf: "stretch", marginTop: spacing.md }}
        onPress={() => {
          if (!categoryId) return;
          if (!category?.hidden) {
            Alert.alert(t("categoryHiddenTitle"), t("categoryHiddenMessage"), [
              { text: t("cancel"), style: "cancel" },
              {
                text: t("hide"),
                onPress: () => {
                  updateCategory(categoryId, { hidden: true });
                  router.back();
                },
              },
            ]);
          } else {
            updateCategory(categoryId, { hidden: false });
            router.back();
          }
        }}
      />

      {/* Delete — separated per HIG */}
      <Button
        title={t("deleteCategory")}
        buttonStyle="borderless"
        danger
        icon="trashOutline"
        onPress={handleDelete}
        style={{ marginTop: spacing.lg }}
      />
    </ScrollView>
  );
}
