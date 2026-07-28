import { Fragment } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  BottomSheet,
  Button,
  ListGroup,
  Separator,
  Typography,
  useThemeColor,
} from "heroui-native";
import { Check } from "lucide-react-native";
import { Money } from "@/ui/Money";
import { formatDateHuman, strToInt } from "@/core/shared/months";
import type { Schedule } from "@/core/types/models";
import { SURFACE_LEVELS, SurfaceLevel } from "@/ui/surface-level";

/** A schedule's amount may be a fixed number or a range ("between X and Y"). */
function scheduleAmount(amount: Schedule["_amount"]): number {
  if (amount == null) return 0;
  if (typeof amount === "number") return amount;
  return (amount.num1 + amount.num2) / 2;
}

/** Pick the schedule a goal funds. */
export function SchedulePickerSheet({
  isOpen,
  onOpenChange,
  schedules,
  selectedId,
  onSelect,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  schedules: Schedule[];
  selectedId?: string;
  onSelect: (schedule: Schedule) => void;
}) {
  // Consumed inside the portaled <SurfaceLevel context="sheet"> below: the
  // portal re-roots the tree, so the hook here would read the OUTER context.
  const { itemVariant } = SURFACE_LEVELS.sheet;
  const { t, i18n } = useTranslation("budget");
  const router = useRouter();
  const accent = useThemeColor("accent");

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content>
          <SurfaceLevel context="sheet">
            <View className="px-4 pb-4">
              <Typography className="mb-3 text-center text-lg font-semibold text-foreground">
                {t("goals.pickSchedule")}
              </Typography>

              {schedules.length === 0 ? (
                <View className="items-center gap-3 py-8">
                  <Typography className="text-center text-sm text-muted">
                    {t("goals.noSchedules")}
                  </Typography>
                  <Button
                    variant="secondary"
                    onPress={() => {
                      onOpenChange(false);
                      router.push("/(auth)/schedules");
                    }}
                  >
                    <Button.Label>{t("goals.manageSchedules")}</Button.Label>
                  </Button>
                </View>
              ) : (
                <ListGroup variant={itemVariant}>
                  {schedules.map((schedule, i) => {
                    const nextDate = schedule.next_date ? strToInt(schedule.next_date) : null;
                    return (
                      <Fragment key={schedule.id}>
                        {i > 0 ? <Separator className="mx-4" /> : null}
                        <ListGroup.Item
                          onPress={() => {
                            onSelect(schedule);
                            onOpenChange(false);
                          }}
                        >
                          <ListGroup.ItemPrefix>
                            <View className="w-5 items-center justify-center">
                              {schedule.id === selectedId ? (
                                <Check size={18} color={accent} />
                              ) : null}
                            </View>
                          </ListGroup.ItemPrefix>
                          <ListGroup.ItemContent>
                            <ListGroup.ItemTitle>{schedule.name}</ListGroup.ItemTitle>
                            {nextDate ? (
                              <Typography className="text-sm text-muted">
                                {t("goals.nextOn", {
                                  date: formatDateHuman(nextDate, i18n.language),
                                })}
                              </Typography>
                            ) : null}
                          </ListGroup.ItemContent>
                          <ListGroup.ItemSuffix>
                            <Money cents={scheduleAmount(schedule._amount)} className="text-sm" />
                          </ListGroup.ItemSuffix>
                        </ListGroup.Item>
                      </Fragment>
                    );
                  })}
                </ListGroup>
              )}
            </View>
          </SurfaceLevel>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
