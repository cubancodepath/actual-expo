import { useTranslation } from "react-i18next";
import type { DashboardWidgetEntity } from "@/core/types/models/dashboard";
import { widgetTitle } from "../lib/widgetTitle";
import { widgetPixelHeight } from "../hooks/useDashboardWidgets";
import { PlaceholderWidget } from "./PlaceholderWidget";
import { NetWorthCard } from "./cards/NetWorthCard";
import { CashFlowCard } from "./cards/CashFlowCard";
import { SummaryCard } from "./cards/SummaryCard";
import { MarkdownCard } from "./cards/MarkdownCard";
import { AgeOfMoneyCard } from "./cards/AgeOfMoneyCard";
import { CalendarCard } from "./cards/CalendarCard";
import { SpendingCard } from "./cards/SpendingCard";
import { BudgetAnalysisCard } from "./cards/BudgetAnalysisCard";
import { FormulaCard } from "./cards/FormulaCard";

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
    case "cash-flow-card":
      return <CashFlowCard title={title} height={height} meta={widget.meta} />;
    case "summary-card":
      return <SummaryCard title={title} height={height} meta={widget.meta} />;
    case "markdown-card":
      return <MarkdownCard height={height} meta={widget.meta} />;
    case "age-of-money-card":
      return <AgeOfMoneyCard title={title} height={height} meta={widget.meta} />;
    case "calendar-card":
      return <CalendarCard title={title} meta={widget.meta} />;
    case "spending-card":
      return <SpendingCard title={title} height={height} meta={widget.meta} />;
    case "budget-analysis-card":
      return <BudgetAnalysisCard title={title} height={height} meta={widget.meta} />;
    case "formula-card":
      return <FormulaCard title={title} height={height} meta={widget.meta} />;
    default:
      return <PlaceholderWidget title={title} height={height} />;
  }
}
