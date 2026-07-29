import { useTranslation } from "react-i18next";
import { Button, useThemeColor } from "heroui-native";
import { Search } from "lucide-react-native";

/** Header action that opens the variant's dedicated token-search screen. */
export function SearchButton({ onPress }: { onPress: () => void }) {
  const foreground = useThemeColor("foreground");
  const { t } = useTranslation("common");
  return (
    <Button
      variant="secondary"
      isIconOnly
      className="rounded-full"
      onPress={onPress}
      accessibilityLabel={t("a11y.search")}
    >
      <Search size={20} color={foreground} />
    </Button>
  );
}
