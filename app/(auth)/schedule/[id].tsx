import { useLocalSearchParams } from "expo-router";
import { ScheduleDetailScreen } from "@/features/schedules/screens/ScheduleDetailScreen";

export default function ScheduleDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ScheduleDetailScreen id={id} />;
}
