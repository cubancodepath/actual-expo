/**
 * useDashboardWidgets — reads the synced dashboard into a read-only, single
 * column ordered list, mirroring upstream `Overview.tsx`'s narrow-width branch.
 *
 * - Picks the first dashboard page (upstream `ReportsDashboardRouter` uses
 *   `dashboardPages[0]`), then keeps that page's widgets. Pre-migration budgets
 *   have widgets with a null `dashboard_page_id`; those are kept when there is
 *   no page yet.
 * - When the budget has no widgets at all, renders `DEFAULT_DASHBOARD_STATE`
 *   read-only with synthetic ids (never written back to the table).
 * - Sorts by (y, x) and forces a single column; height comes from the upstream
 *   min-height table × ROW_HEIGHT.
 *
 * The AQL engine parses `json` columns on select, so `meta` normally arrives as
 * an object; `parseWidget` still tolerates a raw string defensively.
 */
import { useMemo } from "react";
import { q } from "@/lib/queries";
import { useLiveQuery } from "@/hooks/useQuery";
import { DEFAULT_DASHBOARD_STATE } from "@/core/shared/dashboard";
import type { DashboardWidgetEntity, DashboardPageEntity } from "@/core/types/models/dashboard";

/** Grid row height in px (upstream `rowHeight: 100`). */
export const ROW_HEIGHT = 100;
/** Vertical gap between stacked cards. */
export const CARD_GAP = 12;

/** Minimum widget height in grid rows, per type (upstream `getWidgetMinHeight`). */
export function getWidgetMinHeight(type: DashboardWidgetEntity["type"]): number {
  switch (type) {
    case "markdown-card":
    case "custom-report":
    case "formula-card":
      return 1;
    case "sankey-card":
      return 3;
    default:
      return 2;
  }
}

/** Rendered pixel height for a widget in the single-column layout. */
export function widgetPixelHeight(widget: DashboardWidgetEntity): number {
  const rows = Math.max(widget.height ?? 0, getWidgetMinHeight(widget.type));
  return rows * ROW_HEIGHT;
}

type DashboardRow = {
  id: string;
  dashboard_page_id: string | null;
  type: DashboardWidgetEntity["type"];
  x: number;
  y: number;
  width: number;
  height: number;
  meta: string | Record<string, unknown> | null;
  tombstone: boolean;
};

function parseWidget(row: DashboardRow): DashboardWidgetEntity {
  let meta: unknown = row.meta;
  if (typeof meta === "string") {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = null;
    }
  }
  return {
    id: row.id,
    dashboard_page_id: row.dashboard_page_id ?? "",
    type: row.type,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    meta,
    tombstone: row.tombstone,
  } as DashboardWidgetEntity;
}

export type UseDashboardWidgetsResult = {
  widgets: DashboardWidgetEntity[];
  isLoading: boolean;
  /** True when showing DEFAULT_DASHBOARD_STATE (budget has no widgets). */
  isDefault: boolean;
};

export function useDashboardWidgets(): UseDashboardWidgetsResult {
  const { data: pages, hasLoaded: pagesLoaded } = useLiveQuery<DashboardPageEntity>(
    () => q("dashboard_pages").select("*"),
    [],
  );
  const { data: rows, hasLoaded: rowsLoaded } = useLiveQuery<DashboardRow>(
    () => q("dashboard").select("*"),
    [],
  );

  return useMemo(() => {
    const isLoading = !pagesLoaded || !rowsLoaded;
    const page = (pages ?? [])[0] ?? null;

    const pageWidgets = (rows ?? []).filter((row) =>
      page ? row.dashboard_page_id === page.id : row.dashboard_page_id == null,
    );

    if (pageWidgets.length === 0) {
      // Empty budget → render the default layout read-only with synthetic ids.
      const widgets = DEFAULT_DASHBOARD_STATE.map(
        (w, i) =>
          ({
            ...w,
            id: `default-${i}`,
            dashboard_page_id: "",
            tombstone: false,
          }) as DashboardWidgetEntity,
      );
      return { widgets: sortWidgets(widgets), isLoading, isDefault: true };
    }

    const widgets = pageWidgets.map(parseWidget);
    return { widgets: sortWidgets(widgets), isLoading, isDefault: false };
  }, [pages, rows, pagesLoaded, rowsLoaded]);
}

/** Single-column order: y ascending, then x ascending (upstream mobile). */
function sortWidgets(widgets: DashboardWidgetEntity[]): DashboardWidgetEntity[] {
  return [...widgets].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
}
