import { useCallback, useMemo } from "react";
import { Alert, Pressable, SectionList, View } from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  useTheme,
  useThemedStyles,
} from "../../src/presentation/providers/ThemeProvider";
import {
  Text,
  Amount,
  Card,
  EmptyState,
  SectionHeader,
  Divider,
  ScheduleStatusBadge,
} from "../../src/presentation/components";
import { SwipeableRow } from "../../src/presentation/components";
import { useSchedulesStore } from "../../src/stores/schedulesStore";
import { usePayeesStore } from "../../src/stores/payeesStore";
import { useAccountsStore } from "../../src/stores/accountsStore";
import { useUndoStore } from "../../src/stores/undoStore";
import { getStatus, getScheduledAmount, getRecurringDescription } from "../../src/schedules";
import type { Schedule, ScheduleStatus, RecurConfig } from "../../src/schedules/types";
import type { Theme } from "../../src/theme";

type ScheduleSection = {
  title: string;
  data: Schedule[];
};

function useScheduleSections(schedules: Schedule[]): ScheduleSection[] {
  return useMemo(() => {
    const groups: Record<string, Schedule[]> = {
      "Due & Missed": [],
      "Upcoming": [],
      "Paid": [],
      "Scheduled": [],
      "Completed": [],
    };

    for (const s of schedules) {
      const status = getStatus(s.next_date, s.completed, false);
      switch (status) {
        case "due":
        case "missed":
          groups["Due & Missed"].push(s);
          break;
        case "upcoming":
          groups["Upcoming"].push(s);
          break;
        case "paid":
          groups["Paid"].push(s);
          break;
        case "completed":
          groups["Completed"].push(s);
          break;
        default:
          groups["Scheduled"].push(s);
      }
    }

    return Object.entries(groups)
      .filter(([, data]) => data.length > 0)
      .map(([title, data]) => ({ title, data }));
  }, [schedules]);
}

function ScheduleRow({
  schedule,
  payeeName,
  accountName,
  onPress,
  onDelete,
}: {
  schedule: Schedule;
  payeeName: string;
  accountName: string;
  onPress: () => void;
  onDelete: () => void;
}) {
  const { colors, spacing } = useTheme();
  const styles = useThemedStyles(createStyles);

  const status = getStatus(schedule.next_date, schedule.completed, false);
  const amount = getScheduledAmount(schedule._amount);
  const isRecurring =
    schedule._date && typeof schedule._date === "object" && "frequency" in schedule._date;
  const recurDesc = isRecurring
    ? getRecurringDescription(schedule._date as RecurConfig)
    : null;

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
              {schedule.name || payeeName || "No payee"}
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
                {recurDesc ?? schedule.next_date ?? "No date"}
                {accountName ? ` \u00B7 ${accountName}` : ""}
              </Text>
            </View>
            <ScheduleStatusBadge status={status} />
          </View>
        </View>
      </Pressable>
    </SwipeableRow>
  );
}

export default function SchedulesScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const styles = useThemedStyles(createStyles);

  const { schedules, load, delete_ } = useSchedulesStore();
  const payees = usePayeesStore((s) => s.payees);
  const accounts = useAccountsStore((s) => s.accounts);

  useFocusEffect(
    useCallback(() => {
      load();
    }, []),
  );

  const payeeMap = useMemo(
    () => new Map(payees.map((p) => [p.id, p.name])),
    [payees],
  );
  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );

  const sections = useScheduleSections(schedules);

  function handleDelete(schedule: Schedule) {
    Alert.alert(
      "Delete Schedule",
      `Delete "${schedule.name || payeeMap.get(schedule._payee ?? "") || "this schedule"}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await delete_(schedule.id);
            load();
            useUndoStore.getState().showUndo("Schedule deleted");
          },
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Pressable
                onPress={() => router.push("/(auth)/schedule/new")}
                hitSlop={8}
              >
                <Ionicons name="add" size={24} color={colors.primary} />
              </Pressable>
              <Pressable onPress={() => router.back()} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>
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
          <>
            {index > 0 && <Divider style={{ marginLeft: 56 + spacing.lg }} />}
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
            />
          </>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="calendar-outline"
            title="No Schedules"
            description="Create a schedule to automate recurring transactions"
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
