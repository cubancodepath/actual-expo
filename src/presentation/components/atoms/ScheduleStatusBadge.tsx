import { useTranslation } from "react-i18next";
import { Pill } from "./Pill";
import type { ScheduleStatus } from "../../../schedules/types";

const STATUS_CONFIG: Record<
  ScheduleStatus,
  { labelKey: string; variant: "primary" | "success" | "warning" | "error" }
> = {
  due: { labelKey: "statusDue", variant: "error" },
  missed: { labelKey: "statusMissed", variant: "error" },
  upcoming: { labelKey: "statusUpcoming", variant: "warning" },
  paid: { labelKey: "statusPaid", variant: "success" },
  scheduled: { labelKey: "statusScheduled", variant: "primary" },
  completed: { labelKey: "statusCompleted", variant: "primary" },
};

export function ScheduleStatusBadge({ status }: { status: ScheduleStatus }) {
  const { t } = useTranslation("schedules");
  const config = STATUS_CONFIG[status];
  return (
    <Pill label={t(config.labelKey as any)} variant={config.variant} fill="subtle" size="sm" />
  );
}
