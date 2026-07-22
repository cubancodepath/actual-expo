import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Typography } from "heroui-native";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { FormattingGroup } from "./components/FormattingGroup";
import { CurrencyGroup } from "./components/CurrencyGroup";
import { EncryptionGroup } from "./components/EncryptionGroup";
import { ExperimentalGroup } from "./components/ExperimentalGroup";

/** A muted section label above a group card. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Typography className="mb-2 ml-2 text-sm font-medium text-muted">{children}</Typography>;
}

/**
 * Budget Settings — the per-file (synced) settings screen, migrated to HeroUI
 * with our floating header. Holds Formatting, Currency (behind the experimental
 * `currency` flag) and Experimental Features; the remaining sections (Sync /
 * Encryption / Delete) are migrated in follow-up passes.
 */
export function BudgetSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("settings");
  const currencyEnabled = useFeatureFlag("currency");

  return (
    <ScreenHeader.ScrollArea>
      <ScreenHeader.Body
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
      >
        <View className="mb-6">
          <SectionLabel>{t("formatting")}</SectionLabel>
          <FormattingGroup />
        </View>

        {currencyEnabled && (
          <View className="mb-6">
            <SectionLabel>{t("currency")}</SectionLabel>
            <CurrencyGroup />
          </View>
        )}

        <View className="mb-6">
          <SectionLabel>{t("encryption")}</SectionLabel>
          <EncryptionGroup />
        </View>

        <View className="mb-6">
          <SectionLabel>{t("experimentalFeatures")}</SectionLabel>
          <ExperimentalGroup />
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
