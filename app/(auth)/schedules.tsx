import { useCallback, useMemo } from "react";
import { Alert, Pressable, SectionList, View } from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import {
  Text,
  Amount,
  EmptyState,
  SectionHeader,
  ScheduleStatusBadge,
  RowSeparator,
} from "@/presentation/components";
import { SwipeableRow } from "@/presentation/components";
import { useSchedulesStore } from "@/stores/schedulesStore";
import { usePayeesStore } from "@/stores/payeesStore";
import { useAccountsStore } from "@/stores/accountsStore";
import { useUndoStore } from "@/stores/undoStore";
import { getStatus, getScheduledAmount, getRecurringDescription } from "@/schedules";
import type { Schedule, ScheduleStatus, RecurConfig } from "@/schedules/types";
import type { Theme } from "@/theme";

type ScheduleSection = {
  title: string;
  data: Schedule[];
};

function useScheduleSections(schedules: Schedule[], t: any): ScheduleSection[] {
  return useMemo(() => {
    const keys = [
      { key: "dueMissed", label: t("dueMissed") },
      { key: "upcoming", label: t("upcoming") },
      { key: "paid", label: t("paid") },
      { key: "scheduled", label: t("scheduled") },
      { key: "completed", label: t("completed") },
    ];
    const groups: Record<string, Schedule[]> = {};
    for (const k of keys) groups[k.key] = [];

    for (const s of schedules) {
      const status = getStatus(s.next_date, s.completed, false);
      switch (status) {
        case "due":
        case "missed":
          groups["dueMissed"].push(s);
          break;
        case "upcoming":
          groups["upcoming"].push(s);
          break;
        case "paid":
          groups["paid"].push(s);
          break;
        case "completed":
          groups["completed"].push(s);
          break;
        default:
          groups["scheduled"].push(s);
      }
    }

    return keys
      .filter(({ key }) => groups[key].length > 0)
      .map(({ key, label }) => ({ title: label, data: groups[key] }));
  }, [schedules, t]);
}

function ScheduleRow({
  schedule,
  payeeName,
  accountName,
  onPress,
  onDelete,
  isLast,
}: {
  schedule: Schedule;
  payeeName: string;
  accountName: string;
  onPress: () => void;
  onDelete: () => void;
  isLast?: boolean;
}) {
  const { colors, spacing } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation(["schedules", "common"]);

  const status = getStatus(schedule.next_date, schedule.completed, false);
  const amount = getScheduledAmount(schedule._amount);
  const isRecurring =
    schedule._date && typeof schedule._date === "object" && "frequency" in schedule._date;
  const recurDesc = isRecurring ? getRecurringDescription(schedule._date as RecurConfig) : null;

  return (
    <SwipeableRow onDelete={onDelete}>
      <Pressable onPress={onPress} style={styles.row}>
        <View style={styles.rowIcon}>
          <Ionicons
            name={isRecurring ? "repeat" : "calendar-outline"}
            size={20}
            color={colors.primary}
          />
        </View>

        <View style={styles.rowContent}>
          <View style={styles.rowTop}>
            <Text variant="bodyLg" style={{ flex: 1 }} numberOfLines={1}>
              {schedule.name || payeeName || t("noPayee")}
            </Text>
            <Amount value={amount} variant="bodyLg" weight="600" />
          </View>

          <View style={styles.rowBottom}>
            <View style={{ flex: 1, gap: 2 }}>
              {schedule.name && payeeName ? (
                <Text variant="bodySm" color={colors.textSecondary} numberOfLines={1}>
                  {payeeName}
                </Text>
              ) : null}
              <Text variant="bodySm" color={colors.textSecondary} numberOfLines={1}>
                {recurDesc ?? schedule.next_date ?? t("noDate")}
                {accountName ? ` \u00B7 ${accountName}` : ""}
              </Text>
            </View>
            <ScheduleStatusBadge status={status} />
          </View>
        </View>
        {!isLast && <RowSeparator insetLeft={spacing.lg + 36 + spacing.md} />}
      </Pressable>
    </SwipeableRow>
  );
}

export default function SchedulesScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation(["schedules", "common"]);

  const { schedules, load, delete_ } = useSchedulesStore();
  const payees = usePayeesStore((s) => s.payees);
  const accounts = useAccountsStore((s) => s.accounts);

  useFocusEffect(
    useCallback(() => {
      load();
    }, []),
  );

  const payeeMap = useMemo(() => new Map(payees.map((p) => [p.id, p.name])), [payees]);
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);

  const sections = useScheduleSections(schedules, t);

  function handleDelete(schedule: Schedule) {
    const name = schedule.name || payeeMap.get(schedule._payee ?? "") || t("title").toLowerCase();
    Alert.alert(t("deleteSchedule"), t("deleteConfirm", { name }), [
      { text: t("common:cancel"), style: "cancel" },
      {
        text: t("common:delete"),
        style: "destructive",
        onPress: async () => {
          await delete_(schedule.id);
          load();
          useUndoStore.getState().showUndo(t("scheduleDeleted"));
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={() => router.push("/(auth)/schedule/new")} hitSlop={8}>
              <Ionicons name="add" size={24} color={colors.primary} />
            </Pressable>
          ),
        }}
      />

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section }) => (
          <SectionHeader
            title={section.title}
            style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}
          />
        )}
        renderItem={({ item, index, section }) => (
          <ScheduleRow
            schedule={item}
            payeeName={payeeMap.get(item._payee ?? "") ?? ""}
            accountName={accountMap.get(item._account ?? "") ?? ""}
            onPress={() =>
              router.push({
                pathname: "/(auth)/schedule/[id]",
                params: { id: item.id },
              })
            }
            onDelete={() => handleDelete(item)}
            isLast={index === section.data.length - 1}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="calendar-outline"
            title={t("noSchedules")}
            description={t("noSchedulesDescription")}
          />
        }
        contentContainerStyle={{ paddingBottom: 80 }}
        stickySectionHeadersEnabled={false}
      />
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
  } as const,
  row: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.cardBackground,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.pageBackground,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginRight: theme.spacing.md,
  },
  rowContent: {
    flex: 1,
    gap: 4,
  },
  rowTop: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: theme.spacing.sm,
  },
  rowBottom: {
    flexDirection: "row" as const,
    alignItems: "flex-end" as const,
    justifyContent: "space-between" as const,
    gap: theme.spacing.sm,
  },
});
