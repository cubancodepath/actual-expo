import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { BottomSheet, Separator, Typography, useThemeColor } from "heroui-native";
import { Check, Repeat } from "lucide-react-native";
import { getRecurringDescription } from "@/core/domain/schedules";
import type { RecurConfig } from "@/core/domain/schedules/types";
import { intToStr, todayInt } from "@/lib/date";
import { FieldRow } from "../FieldRow";

const FREQUENCIES = ["daily", "weekly", "monthly", "yearly"] as const;

type RecurrenceFieldProps = {
  value: RecurConfig | null;
  onChange: (config: RecurConfig | null) => void;
};

/** Recurrence picker row + bottom sheet with common presets. */
export function RecurrenceField({ value, onChange }: RecurrenceFieldProps) {
  const { t } = useTranslation("transactions");
  const [open, setOpen] = useState(false);
  const accent = useThemeColor("accent");

  const select = (frequency: RecurConfig["frequency"] | null) => {
    if (frequency === null) {
      onChange(null);
    } else {
      onChange({
        frequency,
        interval: 1,
        start: intToStr(todayInt()),
        endMode: "never",
      });
    }
    setOpen(false);
  };

  const options: { label: string; value: RecurConfig["frequency"] | null }[] = [
    { label: t("recurNever"), value: null },
    ...FREQUENCIES.map((f) => ({ label: t(`recur_${f}`), value: f })),
  ];
  const summary = value ? getRecurringDescription(value) : "";

  return (
    <>
      <FieldRow
        icon={Repeat}
        label={t("repeat")}
        value={summary}
        placeholder={t("recurNever")}
        onPress={() => setOpen(true)}
        onClear={value ? () => onChange(null) : undefined}
      />
      <BottomSheet isOpen={open} onOpenChange={setOpen}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content>
            <BottomSheet.Title className="mb-3">{t("repeat")}</BottomSheet.Title>
            {options.map((o, i) => (
              <View key={o.value ?? "never"}>
                <Pressable
                  className="flex-row items-center py-3.5 active:opacity-60"
                  onPress={() => select(o.value)}
                >
                  <Typography className="flex-1 text-base text-foreground">{o.label}</Typography>
                  {(value?.frequency ?? null) === o.value ? (
                    <Check size={18} color={accent} />
                  ) : null}
                </Pressable>
                {i < options.length - 1 ? <Separator /> : null}
              </View>
            ))}
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </>
  );
}
