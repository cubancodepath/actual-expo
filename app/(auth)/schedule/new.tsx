import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Keyboard, Pressable, ScrollView, Switch, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  useTheme,
  useThemedStyles,
} from "../../../src/presentation/providers/ThemeProvider";
import {
  Text,
  Button,
  Card,
  ListItem,
  SectionHeader,
  Divider,
  CurrencyInput,
  type CurrencyInputRef,
} from "../../../src/presentation/components";
import { useSchedulesStore } from "../../../src/stores/schedulesStore";
import { usePayeesStore } from "../../../src/stores/payeesStore";
import { useAccountsStore } from "../../../src/stores/accountsStore";
import { usePickerStore } from "../../../src/stores/pickerStore";
import { getRecurringDescription } from "../../../src/schedules";
import { todayStr } from "../../../src/lib/date";
import type { RecurConfig, RuleCondition } from "../../../src/schedules/types";
import type { Theme } from "../../../src/theme";

export default function NewScheduleScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const styles = useThemedStyles(createStyles);

  const { create, load } = useSchedulesStore();
  const payees = usePayeesStore((s) => s.payees);
  const accounts = useAccountsStore((s) => s.accounts);

  // Picker store for payee/account selection
  const selectedPayee = usePickerStore((s) => s.selectedPayee);
  const selectedAccount = usePickerStore((s) => s.selectedAccount);
  const clearPicker = usePickerStore((s) => s.clear);

  // Form state
  const [name, setName] = useState("");
  const [cents, setCents] = useState(0);
  const [payeeId, setPayeeId] = useState<string | null>(null);
  const [payeeName, setPayeeName] = useState("");
  const [acctId, setAcctId] = useState<string | null>(null);
  const [acctName, setAcctName] = useState("");
  const [postsTransaction, setPostsTransaction] = useState(false);
  const [recurConfig, setRecurConfig] = useState<RecurConfig>({
    frequency: "monthly",
    start: todayStr(),
  });
  const [saving, setSaving] = useState(false);
  const currencyRef = useRef<CurrencyInputRef>(null);

  // Sync picker selections
  const selectedRecurConfig = usePickerStore((s) => s.selectedRecurConfig);

  useEffect(() => {
    if (selectedPayee) {
      setPayeeId(selectedPayee.id);
      setPayeeName(selectedPayee.name);
    }
  }, [selectedPayee]);

  useEffect(() => {
    if (selectedAccount) {
      setAcctId(selectedAccount.id);
      setAcctName(selectedAccount.name);
    }
  }, [selectedAccount]);

  useEffect(() => {
    if (selectedRecurConfig) {
      setRecurConfig(selectedRecurConfig);
    }
  }, [selectedRecurConfig]);

  // Clear picker on mount
  useEffect(() => {
    clearPicker();
    // Set default account
    const openAccounts = accounts.filter((a) => !a.closed);
    if (openAccounts.length > 0) {
      setAcctId(openAccounts[0].id);
      setAcctName(openAccounts[0].name);
    }
  }, []);

  const recurDesc = getRecurringDescription(recurConfig);

  function handleRecurrencePicker() {
    router.push({
      pathname: "/(auth)/schedule/recurrence",
      params: {
        config: JSON.stringify(recurConfig),
      },
    });
  }

  async function handleSave() {
    if (!acctId) {
      Alert.alert("Error", "Please select an account.");
      return;
    }

    Keyboard.dismiss();
    setSaving(true);

    try {
      const conditions: RuleCondition[] = [];

      if (payeeId) {
        conditions.push({ field: "payee", op: "is", value: payeeId });
      }
      conditions.push({ field: "account", op: "is", value: acctId });
      conditions.push({ field: "amount", op: "is", value: -Math.abs(cents) });
      conditions.push({ field: "date", op: "isapprox", value: recurConfig });

      await create({
        schedule: {
          name: name.trim() || null,
          posts_transaction: postsTransaction,
        },
        conditions,
      });

      load();
      router.back();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to create schedule");
    } finally {
      setSaving(false);
    }
  }

  const canSave = acctId && cents !== 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: spacing.xxxl }}
      keyboardDismissMode="on-drag"
    >
      <Stack.Screen
        options={{
          title: "New Schedule",
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
              disabled={!canSave || saving}
            />
          ),
        }}
      />

      {/* Amount */}
      <View style={styles.amountContainer}>
        <CurrencyInput
          ref={currencyRef}
          value={cents}
          onChangeValue={setCents}
          autoFocus
        />
      </View>

      {/* Details */}
      <SectionHeader title="Details" style={{ marginTop: spacing.lg, paddingHorizontal: spacing.lg }} />
      <Card>
        <ListItem
          title="Payee"
          right={
            <Text variant="body" color={payeeName ? colors.textPrimary : colors.textMuted}>
              {payeeName || "Optional"}
            </Text>
          }
          showChevron
          onPress={() => router.push("/(auth)/transaction/payee-picker")}
        />
        <Divider />
        <ListItem
          title="Account"
          right={
            <Text variant="body" color={acctName ? colors.textPrimary : colors.textMuted}>
              {acctName || "Select account"}
            </Text>
          }
          showChevron
          onPress={() => router.push("/(auth)/transaction/account-picker")}
        />
        <Divider />
        <ListItem
          title="Repeats"
          right={
            <Text variant="body" color={colors.textSecondary} numberOfLines={1} style={{ maxWidth: 200 }}>
              {recurDesc}
            </Text>
          }
          showChevron
          onPress={handleRecurrencePicker}
        />
      </Card>

      {/* Settings */}
      <SectionHeader title="Settings" style={{ marginTop: spacing.xl, paddingHorizontal: spacing.lg }} />
      <Card>
        <ListItem
          title="Name"
          right={
            <Pressable
              onPress={() => {
                Alert.prompt("Schedule Name", "Optional display name", (text) => {
                  if (text !== undefined) setName(text);
                }, "plain-text", name);
              }}
            >
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
    </ScrollView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
    paddingHorizontal: theme.spacing.lg,
  } as const,
  amountContainer: {
    alignItems: "center" as const,
    paddingVertical: theme.spacing.xl,
  },
});
