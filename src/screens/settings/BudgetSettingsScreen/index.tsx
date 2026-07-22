import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Typography } from "heroui-native";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { FormattingGroup } from "./components/FormattingGroup";

/**
 * Budget Settings — the per-file (synced) settings screen, migrated to HeroUI
 * with our floating header. For now it holds only the Formatting group; the
 * remaining sections (Sync / Encryption / Experimental / Delete) are migrated in
 * follow-up passes.
 */
export function BudgetSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("settings");

  return (
    <ScreenHeader.ScrollArea>
      <ScreenHeader.Body
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
      >
        <View className="mb-6">
          <Typography className="mb-2 ml-2 text-sm font-medium text-muted">
            {t("formatting")}
          </Typography>
          <FormattingGroup />
        </View>
      </ScreenHeader.Body>

      <ScreenHeader.Floating>
        <View style={{ height: insets.top }} />
        <ScreenHeader>
          <ScreenHeader.Back />
          <ScreenHeader.Title>{t("budgetSettings")}</ScreenHeader.Title>
        </ScreenHeader>
      </ScreenHeader.Floating>
    </ScreenHeader.ScrollArea>
  );
}
