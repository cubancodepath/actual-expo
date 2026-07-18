import { Fragment, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { BottomSheet, ListGroup, Separator, useThemeColor } from "heroui-native";
import { Check, Repeat } from "lucide-react-native";
import type { RecurConfig } from "@/core/domain/schedules/types";
import { intToStr, todayInt } from "@/lib/date";
import { CloseButton } from "@/ui/CloseButton";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { FieldRow } from "./FieldRow";

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
  const summary = value ? t(`recur_${value.frequency}`) : "";

  return (
    <>
      <FieldRow
        icon={Repeat}
        label={t("repeat")}
        value={summary}
        placeholder={t("recurNever")}
        onPress={() => setOpen(true)}
      />
      <BottomSheet isOpen={open} onOpenChange={setOpen}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content
            backgroundClassName="bg-background"
            contentContainerClassName="px-0 pt-0"
          >
            <ScreenHeader>
              <ScreenHeader.Back>
                <CloseButton onPress={() => setOpen(false)} />
              </ScreenHeader.Back>
              <ScreenHeader.Title>{t("repeat")}</ScreenHeader.Title>
            </ScreenHeader>
            <View className="px-4 pb-4">
              <ListGroup>
                {options.map((o, i) => (
                  <Fragment key={o.value ?? "never"}>
                    {i > 0 ? <Separator className="mx-4" /> : null}
                    <ListGroup.Item onPress={() => select(o.value)}>
                      <ListGroup.ItemContent>
                        <ListGroup.ItemTitle>{o.label}</ListGroup.ItemTitle>
                      </ListGroup.ItemContent>
                      {(value?.frequency ?? null) === o.value ? (
                        <ListGroup.ItemSuffix>
                          <Check size={18} color={accent} />
                        </ListGroup.ItemSuffix>
                      ) : null}
                    </ListGroup.Item>
                  </Fragment>
                ))}
              </ListGroup>
            </View>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </>
  );
}
