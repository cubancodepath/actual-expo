import type { ReactNode } from "react";
import { View } from "react-native";
import { Card } from "heroui-native";
import { CardErrorBoundary } from "./CardErrorBoundary";

/**
 * Report card as a compound component over heroui-native `Card`. Consumers
 * compose the pieces they need instead of passing a bag of props:
 *
 * ```tsx
 * <ReportWidget height={h}>
 *   <ReportWidget.Header>
 *     <ReportWidget.Heading>
 *       <ReportWidget.Title>Net Worth</ReportWidget.Title>
 *       <ReportWidget.Description>May – Jul</ReportWidget.Description>
 *     </ReportWidget.Heading>
 *     <ReportWidget.HeaderRight>{kpi}</ReportWidget.HeaderRight>
 *   </ReportWidget.Header>
 *   <ReportWidget.Body>{chart}</ReportWidget.Body>
 *   <ReportWidget.Footer>{summary}</ReportWidget.Footer>
 * </ReportWidget>
 * ```
 *
 * The slots are pure layout wrappers (no shared state → no context needed). The
 * root fixes the card height for the single-column layout and isolates the whole
 * card behind a {@link CardErrorBoundary}.
 */
function ReportWidgetRoot({ height, children }: { height: number; children: ReactNode }) {
  return (
    <CardErrorBoundary>
      <Card style={{ height }}>{children}</Card>
    </CardErrorBoundary>
  );
}

/** Header row: heading on the left, right-aligned content on the right. */
function Header({ children }: { children: ReactNode }) {
  return (
    <Card.Header className="mb-3 flex-row items-start justify-between gap-3">
      {children}
    </Card.Header>
  );
}

/** Left column of the header (title + description), takes the remaining width. */
function Heading({ children }: { children: ReactNode }) {
  return <View className="flex-1">{children}</View>;
}

function Title({ children }: { children: ReactNode }) {
  return <Card.Title className="text-sm font-medium">{children}</Card.Title>;
}

function Description({ children }: { children: ReactNode }) {
  return <Card.Description className="text-xs">{children}</Card.Description>;
}

/** Right side of the header (a KPI value + trend chip, or a legend). */
function HeaderRight({ children }: { children: ReactNode }) {
  return <View className="items-end justify-end">{children}</View>;
}

function Body({ children }: { children: ReactNode }) {
  return <Card.Body className="flex-1">{children}</Card.Body>;
}

function Footer({ children }: { children: ReactNode }) {
  return <Card.Footer className="mt-2">{children}</Card.Footer>;
}

export type LegendItem = {
  label: string;
  /** Uniwind bg class for the dot (e.g. "bg-chart-1", "bg-chart-income"). */
  colorClassName?: string;
  /** Inline color string, wins over colorClassName. */
  color?: string;
};

/** Convenience legend (colored dots + labels), typically placed in HeaderRight. */
function Legend({ items }: { items: LegendItem[] }) {
  return (
    <View className="flex-row flex-wrap items-center justify-end gap-x-3 gap-y-1">
      {items.map((item) => (
        <View key={item.label} className="flex-row items-center gap-1.5">
          <View
            className={`size-2 rounded-full ${item.colorClassName ?? ""}`}
            style={item.color ? { backgroundColor: item.color } : undefined}
          />
          <Description>{item.label}</Description>
        </View>
      ))}
    </View>
  );
}

export const ReportWidget = Object.assign(ReportWidgetRoot, {
  Header,
  Heading,
  Title,
  Description,
  HeaderRight,
  Body,
  Footer,
  Legend,
});
