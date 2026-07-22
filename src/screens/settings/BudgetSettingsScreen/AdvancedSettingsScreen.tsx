import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Typography } from "heroui-native";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { ExperimentalGroup } from "./components/ExperimentalGroup";
import { AdvancedGroup } from "./components/AdvancedGroup";

/** A muted section label above a group card. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Typography className="mb-2 ml-2 text-sm font-medium text-muted">{children}</Typography>;
}

/**
 * Advanced settings — a drill-down that hides the rare/dangerous actions behind
 * an extra tap (upstream's `<AdvancedToggle>`): the experimental feature flags
 * plus the maintenance tools (Reset budget cache / Reset sync / Repair).
 */
export function AdvancedSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("settings");

  return (
    <ScreenHeader.ScrollArea>
      <ScreenHeader.Body
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
      >
        <View className="mb-6">
          <SectionLabel>{t("experimentalFeatures")}</SectionLabel>
          <ExperimentalGroup />
        </View>

        <View className="mb-6">
          <SectionLabel>{t("troubleshooting")}</SectionLabel>
          <AdvancedGroup />
        </View>
      </ScreenHeader.Body>

      <ScreenHeader.Floating>
        <View style={{ height: insets.top }} />
        <ScreenHeader>
          <ScreenHeader.Back />
          <ScreenHeader.Title>{t("advanced")}</ScreenHeader.Title>
        </ScreenHeader>
      </ScreenHeader.Floating>
    </ScreenHeader.ScrollArea>
  );
}
