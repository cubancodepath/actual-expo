import { View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { ListGroup, Typography, useThemeColor } from "heroui-native";
import { ChevronRight } from "lucide-react-native";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { FormattingGroup } from "./components/FormattingGroup";
import { CurrencyGroup } from "./components/CurrencyGroup";
import { EncryptionGroup } from "./components/EncryptionGroup";

/** A muted section label above a group card. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Typography className="mb-2 ml-2 text-sm font-medium text-muted">{children}</Typography>;
}

/**
 * Budget Settings — the per-file (synced) settings screen, migrated to HeroUI
 * with our floating header. Holds Formatting, Currency (behind the experimental
 * `currency` flag) and Encryption; the rare/dangerous Experimental + Advanced
 * actions live one tap deeper in the Advanced sub-screen.
 */
export function BudgetSettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation("settings");
  const muted = useThemeColor("muted");
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
          <ListGroup>
            <ListGroup.Item onPress={() => router.push("/(auth)/settings/advanced")}>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle>{t("advanced")}</ListGroup.ItemTitle>
              </ListGroup.ItemContent>
              <ListGroup.ItemSuffix>
                <ChevronRight size={18} color={muted} />
              </ListGroup.ItemSuffix>
            </ListGroup.Item>
          </ListGroup>
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
