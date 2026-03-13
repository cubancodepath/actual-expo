import { useTranslation } from "react-i18next";
import { Badge } from "./Badge";
import type { ScheduleStatus } from "../../../schedules/types";

const STATUS_CONFIG: Record<
  ScheduleStatus,
  { labelKey: string; variant: "info" | "success" | "warning" | "error" }
> = {
  due: { labelKey: "statusDue", variant: "error" },
  missed: { labelKey: "statusMissed", variant: "error" },
  upcoming: { labelKey: "statusUpcoming", variant: "warning" },
  paid: { labelKey: "statusPaid", variant: "success" },
  scheduled: { labelKey: "statusScheduled", variant: "info" },
  completed: { labelKey: "statusCompleted", variant: "info" },
};

export function ScheduleStatusBadge({ status }: { status: ScheduleStatus }) {
  const { t } = useTranslation('schedules');
  const config = STATUS_CONFIG[status];
  return <Badge label={t(config.labelKey as any)} variant={config.variant} />;
}
