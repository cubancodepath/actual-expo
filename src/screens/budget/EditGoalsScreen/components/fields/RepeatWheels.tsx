import { useMemo, useState } from "react";
import { View } from "react-native";
// The sheet renders at window level, but a React portal still carries the
// editor ScrollView's VirtualizedList context down to the wheels' FlatLists —
// which is what makes RN warn about nested lists and skip their windowing.
// Resetting the context is exactly what this is for.
import { VirtualizedListContextResetter } from "react-native/Libraries/Lists/VirtualizedListContext";
import { useTranslation } from "react-i18next";
import { BottomSheet, Button, Typography } from "heroui-native";
import { WheelPicker, WheelPickerGroup } from "heroui-native-pro";
import { Repeat2 } from "lucide-react-native";
import { REPEAT_MAX, type CustomRepeat, type RepeatUnit } from "@/core/server/budget/goals";
import { FieldRow } from "./FieldRow";

const UNITS: RepeatUnit[] = ["day", "week", "month", "year"];

/**
 * The repeat interval, as two wheels: how many on the left, of what on the
 * right. Each unit caps at what makes sense to say out loud (30 days, 12
 * weeks, 11 months, 2 years) — past that you'd pick the bigger unit.
 *
 * The wheels live in a sheet rather than inline because they are FlatLists:
 * nested in the editor's ScrollView they'd fight it for the vertical gesture
 * and render unwindowed (blank until touched). A sheet is also how iOS shows
 * a wheel anyway.
 */
export function RepeatWheels({
  value,
  onChange,
}: {
  value: CustomRepeat;
  onChange: (next: CustomRepeat) => void;
}) {
  const { t } = useTranslation("budget");
  const [open, setOpen] = useState(false);

  // The number wheel's length follows the unit, so switching to a shorter
  // unit can strand the current interval past the end — clamp as we go.
  const intervalItems = useMemo(
    () =>
      Array.from({ length: REPEAT_MAX[value.unit] }, (_, i) => ({
        value: i + 1,
        label: String(i + 1),
      })),
    [value.unit],
  );

  const unitItems = useMemo(
    () =>
      UNITS.map((unit) => ({
        value: unit,
        label: t(`goals.units.${unit}`, { count: value.interval }),
      })),
    [t, value.interval],
  );

  const summary = t("goals.fixed.repeatEvery", {
    count: value.interval,
    unit: t(`goals.units.${value.unit}`, { count: value.interval }).toLowerCase(),
  });

  return (
    <>
      <FieldRow onPress={() => setOpen(true)}>
        <FieldRow.Icon icon={Repeat2} />
        <FieldRow.Content>
          <FieldRow.Label>{t("goals.fixed.every")}</FieldRow.Label>
          <FieldRow.Value>{summary}</FieldRow.Value>
        </FieldRow.Content>
        <FieldRow.Suffix />
      </FieldRow>

      <BottomSheet isOpen={open} onOpenChange={setOpen}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content backgroundClassName="bg-background">
            <View className="px-4 pb-2">
              <Typography className="mb-2 text-center text-lg font-semibold text-foreground">
                {t("goals.fixed.repeatEveryTitle")}
              </Typography>
              <VirtualizedListContextResetter>
                <WheelPickerGroup
                  values={{ interval: value.interval, unit: value.unit }}
                  onValuesChange={(next) => {
                    const unit = next.unit as RepeatUnit;
                    const interval = Math.min(next.interval as number, REPEAT_MAX[unit]);
                    if (unit !== value.unit || interval !== value.interval) {
                      onChange({ unit, interval });
                    }
                  }}
                >
                  <WheelPicker
                    name="interval"
                    items={intervalItems}
                    classNames={{ itemLabel: "tabular-nums" }}
                  />
                  <WheelPicker name="unit" items={unitItems} />
                  <WheelPickerGroup.Indicator />
                  <WheelPickerGroup.Mask />
                </WheelPickerGroup>
              </VirtualizedListContextResetter>

              <Button variant="secondary" className="mt-2" onPress={() => setOpen(false)}>
                <Button.Label>{t("goals.done")}</Button.Label>
              </Button>
            </View>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </>
  );
}
