import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { TextArea, Typography } from "heroui-native";

type NotesFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
};

/**
 * Multiline notes editor — same look as the budget category note (muted section
 * heading over a bordered TextArea). Tags live inside notes as `#tag`.
 */
export function NotesField({ value, onChangeText }: NotesFieldProps) {
  const { t } = useTranslation("transactions");
  return (
    <View>
      <Typography className="mb-2 ml-2 text-sm font-medium text-muted">{t("notes")}</Typography>
      <TextArea
        value={value}
        onChangeText={onChangeText}
        placeholder={t("notesPlaceholder")}
        className="h-16"
      />
    </View>
  );
}
