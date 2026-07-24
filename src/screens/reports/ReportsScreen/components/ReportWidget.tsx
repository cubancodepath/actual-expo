import type { ReactNode } from "react";
import { View } from "react-native";
import { Widget } from "heroui-native-pro";
import { CardErrorBoundary } from "./CardErrorBoundary";

export type LegendItem = {
  label: string;
  /** Uniwind bg class for the dot (e.g. "bg-chart-1", "bg-chart-income"). */
  colorClassName?: string;
  /** Inline color string, wins over colorClassName. */
  color?: string;
};

type ReportWidgetProps = {
  title: string;
  /** Secondary line under the title — typically the date range. */
  description?: string;
  legend?: LegendItem[];
  /** Fixed rendered height for the card (single-column layout). */
  height: number;
  /** The chart / table / KPI payload, rendered in the elevated content card. */
  children: ReactNode;
  /** Optional footer content (summary line, ± change). */
  footer?: ReactNode;
};

/**
 * Thin wrapper over heroui-native-pro's `Widget` — the dashboard container that
 * pairs a header (title + date range + legend) with an elevated content card.
 * Fixes the card height for the read-only single-column layout and isolates each
 * widget behind a {@link CardErrorBoundary}.
 */
export function ReportWidget({
  title,
  description,
  legend,
  height,
  children,
  footer,
}: ReportWidgetProps) {
  return (
    <CardErrorBoundary>
      <Widget style={{ height }}>
        <Widget.Header>
          <View className="flex-1">
            <Widget.Title>{title}</Widget.Title>
            {description ? <Widget.Description>{description}</Widget.Description> : null}
          </View>
          {legend && legend.length > 0 ? (
            <Widget.Legend>
              {legend.map((item) => (
                <Widget.LegendItem
                  key={item.label}
                  colorClassName={item.colorClassName}
                  color={item.color}
                >
                  {item.label}
                </Widget.LegendItem>
              ))}
            </Widget.Legend>
          ) : null}
        </Widget.Header>
        <Widget.Content className="flex-1">{children}</Widget.Content>
        {footer ? <Widget.Footer>{footer}</Widget.Footer> : null}
      </Widget>
    </CardErrorBoundary>
  );
}
