import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Switch, Typography, useThemeColor } from "heroui-native";
import { CircleCheck } from "lucide-react-native";

type ClearedFieldProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
};

/** Cleared toggle row. */
export function ClearedField({ value, onValueChange }: ClearedFieldProps) {
  const { t } = useTranslation("transactions");
  const muted = useThemeColor("muted");
  return (
    <View className="flex-row items-center gap-3 px-4 py-3.5">
      <CircleCheck size={18} color={muted} />
      <Typography className="flex-1 text-base text-foreground">{t("statusCleared")}</Typography>
      <Switch isSelected={value} onSelectedChange={onValueChange} />
    </View>
  );
}
