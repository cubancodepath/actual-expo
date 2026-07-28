import { Fragment } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { ListGroup, Separator, Typography, useThemeColor } from "heroui-native";
import { Check } from "lucide-react-native";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { useGlobalPref } from "@/lib/hooks/useGlobalPref";
import { useSurfaceLevel } from "@/ui/surface-level";

const THEME_OPTIONS = [
  // "auto" = follow the OS ("System default"), matching upstream's theme
  // vocabulary (light | dark | auto). Stored verbatim in the `theme` GlobalPref.
  { value: "auto", labelKey: "themeSystem" },
  { value: "light", labelKey: "themeLight" },
  { value: "dark", labelKey: "themeDark" },
] as const;

/** App appearance (theme) picker. HeroUI replacement for the legacy display screen. */
export function DisplaySettingsScreen() {
  const { itemVariant } = useSurfaceLevel();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("settings");
  const accent = useThemeColor("accent");

  const [themePref, setThemeMode] = useGlobalPref("theme");
  const themeMode = themePref ?? "auto";

  return (
    <ScreenHeader.ScrollArea>
      <ScreenHeader.Body
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
      >
        <View className="mb-6">
          <Typography className="mb-2 ml-2 text-sm font-medium text-muted">{t("theme")}</Typography>
          <ListGroup variant={itemVariant}>
            {THEME_OPTIONS.map((opt, index) => (
              <Fragment key={opt.value}>
                {index > 0 && <Separator className="mx-4" />}
                <ListGroup.Item onPress={() => setThemeMode(opt.value)}>
                  <ListGroup.ItemContent>
                    <ListGroup.ItemTitle>{t(opt.labelKey)}</ListGroup.ItemTitle>
                  </ListGroup.ItemContent>
                  {themeMode === opt.value && (
                    <ListGroup.ItemSuffix>
                      <Check size={20} color={accent} />
                    </ListGroup.ItemSuffix>
                  )}
                </ListGroup.Item>
              </Fragment>
            ))}
          </ListGroup>
        </View>
      </ScreenHeader.Body>

      <ScreenHeader.Floating>
        <View style={{ height: insets.top }} />
        <ScreenHeader>
          <ScreenHeader.Back />
          <ScreenHeader.Title>{t("display")}</ScreenHeader.Title>
        </ScreenHeader>
      </ScreenHeader.Floating>
    </ScreenHeader.ScrollArea>
  );
}
