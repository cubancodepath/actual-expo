import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Button, Input, Label, TextField, useThemeColor } from "heroui-native";
import { Check, X } from "lucide-react-native";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { useScheduleFormContext } from "@/screens/schedules/ScheduleDetailScreen/context/ScheduleFormProvider";

/**
 * Edit the schedule name in a full modal (same shape as RenameCategoryScreen),
 * but writing to the shared schedule form (not the DB) — persistence happens on
 * the detail screen's Save.
 */
export function ScheduleNameScreen() {
  const { t } = useTranslation("schedules");
  const { t: tc } = useTranslation("common");
  const router = useRouter();
  const [accentForeground, foreground] = useThemeColor(["accent-foreground", "foreground"]);
  const { form } = useScheduleFormContext();

  const initial = (form.getFieldValue("name") as string) ?? "";
  const [name, setName] = useState(initial);
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(
    initial ? { start: 0, end: initial.length } : undefined,
  );

  function handleSave() {
    form.setFieldValue("name", name.trim());
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
        <ScreenHeader.Title>{t("scheduleName")}</ScreenHeader.Title>
        <ScreenHeader.Actions>
          <Button
            isIconOnly
            className="rounded-full"
            onPress={handleSave}
            accessibilityLabel={tc("save")}
          >
            <Check size={22} color={accentForeground} />
          </Button>
        </ScreenHeader.Actions>
      </ScreenHeader>

      <View className="px-4">
        <TextField>
          <Label>{t("scheduleName")}</Label>
          <Input
            value={name}
            onChangeText={(next) => {
              if (selection) setSelection(undefined);
              setName(next);
            }}
            selection={selection}
            placeholder={t("scheduleName")}
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
