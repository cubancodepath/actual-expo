import { Skeleton } from "heroui-native";
import { ReportWidget } from "./ReportWidget";
import { WidgetSkeleton } from "./WidgetSkeleton";

/**
 * Neutral placeholder shown for a widget type whose real graph isn't wired up
 * yet, and (title-less) for every slot while the dashboard itself is still
 * loading. Keeps the dashboard renderable end-to-end (title + slot).
 */
export function PlaceholderWidget({ title, height }: { title?: string; height: number }) {
  return (
    <ReportWidget height={height}>
      <ReportWidget.Header>
        <ReportWidget.Heading>
          {title != null ? (
            <ReportWidget.Title>{title}</ReportWidget.Title>
          ) : (
            <Skeleton className="h-4 w-28 rounded-md" />
          )}
        </ReportWidget.Heading>
      </ReportWidget.Header>
      <ReportWidget.Body>
        <WidgetSkeleton />
      </ReportWidget.Body>
    </ReportWidget>
  );
}
