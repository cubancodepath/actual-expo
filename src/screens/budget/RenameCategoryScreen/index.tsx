import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Button, Input, Label, TextField, useThemeColor } from "heroui-native";
import { Check, X } from "lucide-react-native";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { updateCategory } from "@/core/server/budget";

export interface RenameCategoryScreenProps {
  categoryId: string;
  currentName: string;
}

/**
 * Rename a category from a bottom sheet: our own header (close on the left,
 * a circular check to save on the right) over a single text field. Save is
 * disabled until the trimmed name is non-empty and actually changed.
 */
export function RenameCategoryScreen({ categoryId, currentName }: RenameCategoryScreenProps) {
  const { t } = useTranslation("budget");
  const { t: tc } = useTranslation("common");
  const router = useRouter();
  const accentForeground = useThemeColor("accent-foreground");
  const foreground = useThemeColor("foreground");

  const initial = currentName ?? "";
  const [name, setName] = useState(initial);
  // Select the whole name on mount so the user can retype immediately. Held as
  // controlled selection (autoFocus can beat selectTextOnFocus to layout), then
  // released on the first edit so it never fights the cursor afterwards.
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(
    initial ? { start: 0, end: initial.length } : undefined,
  );
  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && trimmed !== currentName;

  function handleSave() {
    if (!canSave || !categoryId) return;
    updateCategory(categoryId, { name: trimmed });
    router.back();
  }

  return (
    <View className="flex-1">
      <ScreenHeader>
        <ScreenHeader.Back>
          <Button
            variant="secondary"
            isIconOnly
            className="rounded-full"
            onPress={() => router.back()}
            accessibilityLabel={tc("close")}
          >
            <X size={24} color={foreground} />
          </Button>
        </ScreenHeader.Back>
        <ScreenHeader.Title>{t("renameCategory")}</ScreenHeader.Title>
        <ScreenHeader.Actions>
          <Button
            isIconOnly
            className="rounded-full"
            isDisabled={!canSave}
            onPress={handleSave}
            accessibilityLabel={tc("save")}
          >
            <Check size={22} color={accentForeground} />
          </Button>
        </ScreenHeader.Actions>
      </ScreenHeader>

      <View className="px-4">
        <TextField>
          <Label>{t("categoryNameLabel")}</Label>
          <Input
            value={name}
            onChangeText={(next) => {
              if (selection) setSelection(undefined);
              setName(next);
            }}
            selection={selection}
            placeholder={t("categoryNamePlaceholder")}
            autoFocus
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
        </TextField>
      </View>
    </View>
  );
}
