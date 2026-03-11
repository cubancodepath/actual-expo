import { useState, useMemo } from "react";
import { ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Host, DatePicker, Picker, Text as SwiftText } from "@expo/ui/swift-ui";
import { datePickerStyle, frame, pickerStyle, tag, tint } from "@expo/ui/swift-ui/modifiers";
import { useTheme } from "../../../src/presentation/providers/ThemeProvider";
import {
  Text,
  Card,
  SectionHeader,
} from "../../../src/presentation/components";
import { ListItem } from "../../../src/presentation/components/molecules/ListItem";
import { GlassButton } from "../../../src/presentation/components/atoms/GlassButton";
import { usePickerStore } from "../../../src/stores/pickerStore";
import { getRecurringDescription } from "../../../src/schedules";
import { getUpcomingDates, dayFromDate, getDateWithSkippedWeekend } from "../../../src/schedules/recurrence";
import { todayStr } from "../../../src/lib/date";
import { formatDateLong, strToInt } from "../../../src/lib/date";
import type { RecurConfig } from "../../../src/schedules/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FREQUENCIES: { value: RecurConfig["frequency"]; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const INTERVAL_OPTIONS = Array.from({ length: 30 }, (_, i) => ({
  value: i + 1,
  label: String(i + 1),
}));

const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => ({
  value: i + 1,
  label: String(i + 1),
}));

function frequencyLabel(f: string): string {
  switch (f) {
    case "daily": return "days";
    case "weekly": return "weeks";
    case "monthly": return "months";
    case "yearly": return "years";
    default: return "days";
  }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function RecurrenceCustomScreen() {
  const { config: configParam } = useLocalSearchParams<{ config?: string }>();
  const router = useRouter();
  const { colors, spacing } = useTheme();

  const initial: RecurConfig = configParam
    ? JSON.parse(configParam)
    : { frequency: "monthly", start: todayStr() };

  const [frequency, setFrequency] = useState<RecurConfig["frequency"]>(initial.frequency);
  const [interval, setIntervalVal] = useState(initial.interval ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState<number>(() => {
    const dayPattern = initial.patterns?.find((p) => p.type === "day");
    return dayPattern ? dayPattern.value : 0; // 0 = from start date
  });
  const [showEndDate, setShowEndDate] = useState(!!initial.endDate);
  const [endDate, setEndDate] = useState<Date>(() => {
    if (initial.endDate) {
      const d = new Date(initial.endDate);
      return isNaN(d.getTime()) ? new Date() : d;
    }
    // Default: 1 year from now
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);

  const config: RecurConfig = useMemo(() => {
    const c: RecurConfig = {
      frequency,
      interval: interval > 1 ? interval : undefined,
      start: initial.start,
    };

    if (frequency === "monthly" && dayOfMonth > 0) {
      c.patterns = [{ type: "day", value: dayOfMonth }];
    }

    if (showEndDate) {
      const y = endDate.getFullYear();
      const m = String(endDate.getMonth() + 1).padStart(2, "0");
      const d = String(endDate.getDate()).padStart(2, "0");
      c.endMode = "on_date";
      c.endDate = `${y}-${m}-${d}`;
    }

    return c;
  }, [frequency, interval, dayOfMonth, showEndDate, endDate]);

  const description = getRecurringDescription(config);

  // Preview next 5 dates
  const previewDates = useMemo(() => {
    try {
      const dates: Date[] = getUpcomingDates(config, 5);
      return dates.map((d) => {
        let date = d;
        if (config.skipWeekend) {
          date = getDateWithSkippedWeekend(date, config.weekendSolveMode ?? "after");
        }
        return dayFromDate(date);
      });
    } catch {
      return [];
    }
  }, [config]);

  function handleDone() {
    usePickerStore.getState().setRecurConfig(config);
    // Go back two levels: custom → presets → parent
    router.dismiss(2);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Custom header ── */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.lg,
          paddingBottom: spacing.sm,
        }}
      >
        <GlassButton icon="chevron.left" onPress={() => router.back()} />
        <Text variant="headingSm" color={colors.headerText}>
          Custom Repeat
        </Text>
        <GlassButton icon="checkmark" onPress={handleDone} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.xxxl,
        }}
        keyboardDismissMode="on-drag"
      >
        {/* Summary */}
        <View style={{ paddingVertical: spacing.md }}>
          <Text
            variant="bodyLg"
            color={colors.textSecondary}
            style={{ textAlign: "center" }}
          >
            {description}
          </Text>
        </View>

        {/* Frequency — segmented picker */}
        <SectionHeader title="Frequency" style={{ paddingHorizontal: 0 }} />
        <Host matchContents>
          <Picker
            selection={frequency}
            onSelectionChange={(val) =>
              setFrequency(val as RecurConfig["frequency"])
            }
            modifiers={[pickerStyle("segmented"), tint(colors.primary)]}
          >
            {FREQUENCIES.map((f) => (
              <SwiftText key={f.value} modifiers={[tag(f.value)]}>
                {f.label}
              </SwiftText>
            ))}
          </Picker>
        </Host>

        {/* Interval — menu picker */}
        <SectionHeader
          title="Interval"
          style={{ marginTop: spacing.lg, paddingHorizontal: 0 }}
        />
        <Card>
          <ListItem
            title={`Every`}
            right={
              <Host matchContents>
                <Picker
                  selection={interval}
                  onSelectionChange={(val) => setIntervalVal(val as number)}
                  modifiers={[
                    pickerStyle("menu"),
                    tint(colors.primary),
                    frame({ minWidth: 120, alignment: "trailing" }),
                  ]}
                >
                  {INTERVAL_OPTIONS.map((opt) => (
                    <SwiftText key={opt.value} modifiers={[tag(opt.value)]}>
                      {`${opt.label} ${frequencyLabel(frequency)}`}
                    </SwiftText>
                  ))}
                </Picker>
              </Host>
            }
          />
        </Card>

        {/* Day of month (monthly only) */}
        {frequency === "monthly" && (
          <>
            <SectionHeader
              title="Day of Month"
              style={{ marginTop: spacing.lg, paddingHorizontal: 0 }}
            />
            <Card>
              <ListItem
                title="On day"
                right={
                  <Host matchContents>
                    <Picker
                      selection={dayOfMonth}
                      onSelectionChange={(val) => setDayOfMonth(val as number)}
                      modifiers={[
                        pickerStyle("menu"),
                        tint(colors.primary),
                        frame({ minWidth: 180, alignment: "trailing" }),
                      ]}
                    >
                      <SwiftText key={0} modifiers={[tag(0)]}>
                        From start date
                      </SwiftText>
                      {DAY_OPTIONS.map((opt) => (
                        <SwiftText key={opt.value} modifiers={[tag(opt.value)]}>
                          {opt.label}
                        </SwiftText>
                      ))}
                    </Picker>
                  </Host>
                }
              />
            </Card>
          </>
        )}

        {/* End date (optional) */}
        <SectionHeader
          title="Ends"
          style={{ marginTop: spacing.lg, paddingHorizontal: 0 }}
        />
        <Card>
          <ListItem
            title="End date"
            right={
              showEndDate ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.sm,
                  }}
                >
                  <Text variant="body" color={colors.primary}>
                    {formatDateLong(
                      strToInt(
                        `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`,
                      )!,
                    )}
                  </Text>
                  <Ionicons
                    name={showDatePicker ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={colors.textMuted}
                  />
                </View>
              ) : (
                <Text variant="body" color={colors.textMuted}>
                  Never
                </Text>
              )
            }
            onPress={() => {
              if (showEndDate) {
                setShowDatePicker(!showDatePicker);
              } else {
                setShowEndDate(true);
                setShowDatePicker(true);
              }
            }}
            showSeparator={showEndDate}
          />
          {showEndDate && showDatePicker && (
            <View style={{ paddingHorizontal: spacing.md }}>
              <Host matchContents={{ vertical: true }}>
                <DatePicker
                  selection={endDate}
                  displayedComponents={["date"]}
                  modifiers={[datePickerStyle("graphical"), tint(colors.primary)]}
                  onDateChange={(d) => {
                    setEndDate(d);
                    setShowDatePicker(false);
                  }}
                />
              </Host>
            </View>
          )}
          {showEndDate && (
            <ListItem
              title="Remove end date"
              onPress={() => {
                setShowEndDate(false);
                setShowDatePicker(false);
              }}
            />
          )}
        </Card>

        {/* Preview */}
        {previewDates.length > 0 && (
          <>
            <SectionHeader
              title="Preview"
              style={{ marginTop: spacing.lg, paddingHorizontal: 0 }}
            />
            <Card>
              {previewDates.map((date, i) => (
                <ListItem
                  key={date}
                  title={date}
                  showSeparator={i < previewDates.length - 1}
                />
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}
