import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Switch, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  useTheme,
  useThemedStyles,
} from "../../../src/presentation/providers/ThemeProvider";
import {
  Text,
  Amount,
  Button,
  Card,
  ListItem,
  SectionHeader,
  Divider,
  ScheduleStatusBadge,
} from "../../../src/presentation/components";
import { useSchedulesStore } from "../../../src/stores/schedulesStore";
import { usePayeesStore } from "../../../src/stores/payeesStore";
import { useAccountsStore } from "../../../src/stores/accountsStore";
import { useUndoStore } from "../../../src/stores/undoStore";
import {
  getScheduleById,
  getStatus,
  getScheduledAmount,
  getRecurringDescription,
} from "../../../src/schedules";
import type { Schedule, RecurConfig, RuleCondition } from "../../../src/schedules/types";
import type { Theme } from "../../../src/theme";

export default function ScheduleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const styles = useThemedStyles(createStyles);

  const { update, delete_, skip, postTransaction, load } = useSchedulesStore();
  const payees = usePayeesStore((s) => s.payees);
  const accounts = useAccountsStore((s) => s.accounts);

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [name, setName] = useState("");
  const [postsTransaction, setPostsTransaction] = useState(false);

  const loadSchedule = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const s = await getScheduleById(id);
      if (s) {
        setSchedule(s);
        setName(s.name ?? "");
        setPostsTransaction(s.posts_transaction);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadSchedule();
    }, [loadSchedule]),
  );

  const payeeMap = useMemo(
    () => new Map(payees.map((p) => [p.id, p.name])),
    [payees],
  );
  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );

  if (loading || !schedule) {
    return (
      <View style={styles.container}>
        <Text variant="body" color={colors.textSecondary} style={{ textAlign: "center", marginTop: 80 }}>
          Loading...
        </Text>
      </View>
    );
  }

  const status = getStatus(schedule.next_date, schedule.completed, false);
  const amount = getScheduledAmount(schedule._amount);
  const payeeName = payeeMap.get(schedule._payee ?? "") ?? "No payee";
  const accountName = accountMap.get(schedule._account ?? "") ?? "No account";
  const isRecurring =
    schedule._date && typeof schedule._date === "object" && "frequency" in schedule._date;
  const recurDesc = isRecurring
    ? getRecurringDescription(schedule._date as RecurConfig)
    : "One-time";

  async function handleSave() {
    if (!schedule) return;
    setSaving(true);
    try {
      await update({
        schedule: {
          id: schedule.id,
          name: name.trim() || null,
          posts_transaction: postsTransaction,
        },
      });
      load();
      router.back();
    } finally {
      setSaving(false);
    }
  }

  function handleSkip() {
    Alert.alert("Skip Next Date", "Move to the following occurrence?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Skip",
        onPress: async () => {
          await skip(schedule!.id);
          load();
          loadSchedule();
          useUndoStore.getState().showUndo("Date skipped");
        },
      },
    ]);
  }

  function handlePostNow() {
    Alert.alert(
      "Post Transaction",
      "Create a transaction for this schedule now?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Post",
          onPress: async () => {
            await postTransaction(schedule!.id);
            load();
            loadSchedule();
            useUndoStore.getState().showUndo("Transaction posted");
          },
        },
      ],
    );
  }

  function handleComplete() {
    Alert.alert(
      "Complete Schedule",
      "Mark this schedule as completed? It will no longer generate transactions.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Complete",
          onPress: async () => {
            await update({
              schedule: { id: schedule!.id, completed: true },
            });
            load();
            router.back();
          },
        },
      ],
    );
  }

  function handleDelete() {
    Alert.alert("Delete Schedule", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await delete_(schedule!.id);
          load();
          useUndoStore.getState().showUndo("Schedule deleted");
          router.back();
        },
      },
    ]);
  }

  const hasChanges =
    (name.trim() || null) !== (schedule.name ?? null) ||
    postsTransaction !== schedule.posts_transaction;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: spacing.xxxl }}
    >
      <Stack.Screen
        options={{
          title: "Schedule",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          ),
          headerRight: () => (
            <Button
              title="Save"
              variant="primary"
              size="sm"
              onPress={handleSave}
              loading={saving}
              disabled={!hasChanges || saving}
            />
          ),
        }}
      />

      {/* Status & Amount */}
      <View style={styles.hero}>
        <Amount value={amount} variant="displayLg" weight="700" />
        <ScheduleStatusBadge status={status} />
      </View>

      {/* Details */}
      <SectionHeader title="Details" style={{ marginTop: spacing.lg, paddingHorizontal: spacing.lg }} />
      <Card>
        <ListItem title="Payee" right={<Text variant="body" color={colors.textSecondary}>{payeeName}</Text>} />
        <Divider />
        <ListItem title="Account" right={<Text variant="body" color={colors.textSecondary}>{accountName}</Text>} />
        <Divider />
        <ListItem title="Next Date" right={<Text variant="body" color={colors.textSecondary}>{schedule.next_date ?? "—"}</Text>} />
        <Divider />
        <ListItem title="Repeats" right={<Text variant="body" color={colors.textSecondary}>{recurDesc}</Text>} />
      </Card>

      {/* Settings */}
      <SectionHeader title="Settings" style={{ marginTop: spacing.xl, paddingHorizontal: spacing.lg }} />
      <Card>
        <ListItem
          title="Name"
          right={
            <Pressable onPress={() => {
              Alert.prompt("Schedule Name", "Optional display name", (text) => {
                if (text !== undefined) setName(text);
              }, "plain-text", name);
            }}>
              <Text variant="body" color={name ? colors.textPrimary : colors.textMuted}>
                {name || "Add name..."}
              </Text>
            </Pressable>
          }
        />
        <Divider />
        <ListItem
          title="Auto-post Transaction"
          subtitle="Automatically create a transaction when due"
          right={
            <Switch
              value={postsTransaction}
              onValueChange={setPostsTransaction}
              trackColor={{ true: colors.primary }}
            />
          }
        />
      </Card>

      {/* Actions */}
      <SectionHeader title="Actions" style={{ marginTop: spacing.xl, paddingHorizontal: spacing.lg }} />
      <Card>
        {isRecurring && (
          <>
            <ListItem title="Skip Next Date" onPress={handleSkip} showChevron />
            <Divider />
          </>
        )}
        <ListItem title="Post Transaction Now" onPress={handlePostNow} showChevron />
        {!schedule.completed && (
          <>
            <Divider />
            <ListItem title="Complete Schedule" onPress={handleComplete} showChevron />
          </>
        )}
      </Card>

      {/* Danger zone */}
      <View style={{ marginTop: spacing.xxl, paddingHorizontal: spacing.lg }}>
        <Button
          title="Delete Schedule"
          variant="danger"
          size="lg"
          onPress={handleDelete}
        />
      </View>
    </ScrollView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
    paddingHorizontal: theme.spacing.lg,
  } as const,
  hero: {
    alignItems: "center" as const,
    paddingVertical: theme.spacing.xl,
    gap: theme.spacing.md,
  },
});
