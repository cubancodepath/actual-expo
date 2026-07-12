import { useTranslation } from "react-i18next";
import { Label, TextArea, TextField } from "heroui-native";

type NotesFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
};

/** Multiline notes input (tags live inside notes as `#tag`). */
export function NotesField({ value, onChangeText }: NotesFieldProps) {
  const { t } = useTranslation("transactions");
  return (
    <TextField>
      <Label>{t("notes")}</Label>
      <TextArea
        value={value}
        onChangeText={onChangeText}
        placeholder={t("notesPlaceholder")}
        className="h-16"
      />
    </TextField>
  );
}
