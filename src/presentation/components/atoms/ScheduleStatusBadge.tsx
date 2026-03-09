import { Badge } from "./Badge";
import type { ScheduleStatus } from "../../../schedules/types";

const STATUS_CONFIG: Record<
  ScheduleStatus,
  { label: string; variant: "info" | "success" | "warning" | "error" }
> = {
  due: { label: "Due", variant: "error" },
  missed: { label: "Missed", variant: "error" },
  upcoming: { label: "Upcoming", variant: "warning" },
  paid: { label: "Paid", variant: "success" },
  scheduled: { label: "Scheduled", variant: "info" },
  completed: { label: "Completed", variant: "info" },
};

export function ScheduleStatusBadge({ status }: { status: ScheduleStatus }) {
  const config = STATUS_CONFIG[status];
  return <Badge label={config.label} variant={config.variant} />;
}
