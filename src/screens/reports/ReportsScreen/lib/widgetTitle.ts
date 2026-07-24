import type { TFunction } from "i18next";
import type { DashboardWidgetEntity } from "@/core/types/models/dashboard";

/**
 * Display title for a widget: the user-set `meta.name` when present, otherwise
 * the localized default name for the widget type (mirrors upstream's `t()`
 * fallbacks on each card).
 */
export function widgetTitle(widget: DashboardWidgetEntity, t: TFunction<"reports">): string {
  const name = (widget.meta as { name?: string } | null)?.name;
  if (name) return name;
  return t(`widgetNames.${widget.type}` as const);
}
