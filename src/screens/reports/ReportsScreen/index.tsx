import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { useSyncRefreshControl } from "@/lib/hooks/useSyncRefreshControl";
import { useDashboardWidgets, widgetPixelHeight, CARD_GAP } from "./hooks/useDashboardWidgets";
import { ReportWidgetView } from "./components/ReportWidgetView";
import { PlaceholderWidget } from "./components/PlaceholderWidget";

/**
 * Reports dashboard — a read-only, single-column render of the user's synced
 * dashboard (upstream `Overview.tsx`'s narrow-width branch). Widget graphs land
 * in later phases; for now every widget renders through a placeholder so the
 * screen is end-to-end renderable from the real `dashboard` table.
 */
export function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("reports");
  const { widgets, isLoading } = useDashboardWidgets();
  const refreshControl = useSyncRefreshControl();

  return (
    <ScreenHeader.ScrollArea>
      <ScreenHeader.Body
        refreshControl={refreshControl}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 32,
          gap: CARD_GAP,
        }}
      >
        {widgets.map((widget) =>
          // Until the dashboard tables load, the widget list is the synthetic
          // default layout — skeleton slots only, so no card fetches data that
          // may not match the user's real dashboard.
          isLoading ? (
            <PlaceholderWidget key={widget.id} height={widgetPixelHeight(widget)} />
          ) : (
            <ReportWidgetView key={widget.id} widget={widget} />
          ),
        )}
      </ScreenHeader.Body>

      <ScreenHeader.Floating>
        <View style={{ height: insets.top }} />
        <ScreenHeader>
          <ScreenHeader.Title>{t("title")}</ScreenHeader.Title>
        </ScreenHeader>
      </ScreenHeader.Floating>
    </ScreenHeader.ScrollArea>
  );
}
