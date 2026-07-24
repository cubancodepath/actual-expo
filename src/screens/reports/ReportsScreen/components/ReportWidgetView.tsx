import { useTranslation } from "react-i18next";
import type { DashboardWidgetEntity } from "@/core/types/models/dashboard";
import { widgetTitle } from "../lib/widgetTitle";
import { widgetPixelHeight } from "../hooks/useDashboardWidgets";
import { PlaceholderWidget } from "./PlaceholderWidget";
import { NetWorthCard } from "./cards/NetWorthCard";

/**
 * Dispatches a dashboard widget to its card by type. Types without a ported
 * card yet fall back to {@link PlaceholderWidget}; they light up as each widget
 * lands in later phases.
 */
export function ReportWidgetView({ widget }: { widget: DashboardWidgetEntity }) {
  const { t } = useTranslation("reports");
  const title = widgetTitle(widget, t);
  const height = widgetPixelHeight(widget);

  switch (widget.type) {
    case "net-worth-card":
      return <NetWorthCard title={title} height={height} meta={widget.meta} />;
    default:
      return <PlaceholderWidget title={title} height={height} />;
  }
}
