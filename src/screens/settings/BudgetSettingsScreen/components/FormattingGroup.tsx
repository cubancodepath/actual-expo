import { Fragment, type ReactNode } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ListGroup, Separator, Switch, Typography, useThemeColor } from "heroui-native";
import { ChevronRight } from "lucide-react-native";
import { useSyncedPref } from "@/lib/hooks/useSyncedPref";
import { DATE_FORMAT_OPTIONS, NUMBER_FORMAT_OPTIONS } from "@/core/domain/preferences/types";
import { useDaysOfWeek } from "@/screens/settings/lib/useDaysOfWeek";

/** A row that shows the current value and drills into a picker sub-screen. */
function NavValueRow({
  title,
  value,
  onPress,
  muted,
}: {
  title: string;
  value: string;
  onPress: () => void;
  muted: string;
}) {
  return (
    <ListGroup.Item onPress={onPress}>
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle>{title}</ListGroup.ItemTitle>
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix>
        <View className="flex-row items-center gap-1">
          <Typography className="text-sm text-muted">{value}</Typography>
          <ChevronRight size={18} color={muted} />
        </View>
      </ListGroup.ItemSuffix>
    </ListGroup.Item>
  );
}

/** A row whose value is a toggle (Hide Decimals). */
function SwitchRow({
  title,
  isSelected,
  onSelectedChange,
}: {
  title: string;
  isSelected: boolean;
  onSelectedChange: (v: boolean) => void;
}) {
  return (
    <ListGroup.Item>
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle>{title}</ListGroup.ItemTitle>
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix>
        <Switch isSelected={isSelected} onSelectedChange={onSelectedChange} />
      </ListGroup.ItemSuffix>
    </ListGroup.Item>
  );
}

/**
 * The Formatting group of the Budget Settings screen (upstream's Format section,
 * adapted to mobile drill-down): Number Format + Hide Decimals, Date Format,
 * First Day of Week. Each format pref is a SyncedPref (per-file, CRDT).
 */
export function FormattingGroup() {
  const router = useRouter();
  const { t } = useTranslation("settings");
  const muted = useThemeColor("muted");

  const [numberFormat] = useSyncedPref("numberFormat");
  const [hideFraction, setHideFraction] = useSyncedPref("hideFraction");
  const [dateFormat] = useSyncedPref("dateFormat");
  const [firstDayOfWeekIdx] = useSyncedPref("firstDayOfWeekIdx");
  const days = useDaysOfWeek();

  const noFraction = hideFraction === "true";
  const numberOpt = NUMBER_FORMAT_OPTIONS.find((o) => o.value === (numberFormat || "comma-dot"));
  const numberValue = numberOpt ? (noFraction ? numberOpt.labelNoFraction : numberOpt.label) : "";
  const dateValue =
    DATE_FORMAT_OPTIONS.find((o) => o.value === (dateFormat || "MM/dd/yyyy"))?.label ?? "";
  const dayValue = days.find((d) => d.value === (firstDayOfWeekIdx || "0"))?.label ?? "";

  const wrap = (child: ReactNode, first: boolean) => (
    <Fragment>
      {!first && <Separator className="mx-4" />}
      {child}
    </Fragment>
  );

  return (
    <>
      <ListGroup>
        {wrap(
          <NavValueRow
            title={t("numberFormat")}
            value={numberValue}
            muted={muted}
            onPress={() => router.push("/(auth)/settings/number-format")}
          />,
          true,
        )}
        {wrap(
          <SwitchRow
            title={t("hideDecimalPlaces")}
            isSelected={noFraction}
            onSelectedChange={(v) => void setHideFraction(v ? "true" : "false")}
          />,
          false,
        )}
        {wrap(
          <NavValueRow
            title={t("dateFormat")}
            value={dateValue}
            muted={muted}
            onPress={() => router.push("/(auth)/settings/date-format")}
          />,
          false,
        )}
        {wrap(
          <NavValueRow
            title={t("firstDayOfWeek")}
            value={dayValue}
            muted={muted}
            onPress={() => router.push("/(auth)/settings/first-day-of-week")}
          />,
          false,
        )}
      </ListGroup>

      <Typography className="mt-3 ml-2 text-sm text-muted">{t("formattingNote")}</Typography>
    </>
  );
}
