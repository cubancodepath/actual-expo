import { useEffect, useMemo, useState } from "react";
import { Alert, Keyboard, Pressable, Switch, useColorScheme, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  interpolate,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useAccountsStore } from "@/stores/accountsStore";
import { usePayeesStore } from "@/stores/payeesStore";
import { useCategoriesStore } from "@/stores/categoriesStore";
import { useSchedulesStore } from "@/stores/schedulesStore";
import { usePickerStore } from "@/stores/pickerStore";
import { useUndoStore } from "@/stores/undoStore";
import {
  getScheduleById,
  getStatus,
  getScheduledAmount,
  getRecurringDescription,
} from "@/schedules";
import { withOpacity } from "@/lib/colors";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { Button } from "@/presentation/components/atoms/Button";
import { Text } from "@/presentation/components/atoms/Text";
import { GlassButton } from "@/presentation/components/atoms/GlassButton";
import { AmountHeader } from "@/presentation/components/transaction/AmountHeader";
import { HiddenAmountInput } from "@/presentation/components/transaction/HiddenAmountInput";
import { useAmountInput } from "@/presentation/components/transaction/useAmountInput";
import { ScheduleStatusBadge } from "@/presentation/components/atoms/ScheduleStatusBadge";
import { ErrorBanner } from "@/presentation/components/molecules/ErrorBanner";
import { useErrorHandler } from "@/presentation/hooks/useErrorHandler";
import type { TransactionType } from "@/presentation/components/transaction/TypeToggle";
import { DetailRow } from "@/presentation/components/transaction/DetailRow";
import type { Schedule, RecurConfig, RuleCondition, RuleAction } from "@/schedules/types";

export default function ScheduleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { t } = useTranslation(["schedules", "common"]);

  const { update, delete_, skip, postTransaction, load } = useSchedulesStore();
  const payees = usePayeesStore((s) => s.payees);
  const accounts = useAccountsStore((s) => s.accounts);
  const { groups: categoryGroups } = useCategoriesStore();

  // Picker store
  const selectedPayee = usePickerStore((s) => s.selectedPayee);
  const selectedAccount = usePickerStore((s) => s.selectedAccount);
  const selectedCategory = usePickerStore((s) => s.selectedCategory);
  const selectedRecurConfig = usePickerStore((s) => s.selectedRecurConfig);
  const clearPicker = usePickerStore((s) => s.clear);

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { error, handleError, dismissError } = useErrorHandler();

  // Amount input hook
  const amountInput = useAmountInput(0);

  // Form state
  const [type, setType] = useState<TransactionType>("expense");
  const [name, setName] = useState("");
  const [payeeId, setPayeeId] = useState<string | null>(null);
  const [payeeName, setPayeeName] = useState("");
  const [acctId, setAcctId] = useState<string | null>(null);
  const [acctName, setAcctName] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [postsTransaction, setPostsTransaction] = useState(false);
  const [recurConfig, setRecurConfig] = useState<RecurConfig | null>(null);
  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const blurContainerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 50], [0, 1], "clamp"),
  }));

  // Initial values for change detection
  const [initial, setInitial] = useState<{
    type: TransactionType;
    cents: number;
    name: string | null;
    payeeId: string | null;
    acctId: string | null;
    categoryId: string | null;
    postsTransaction: boolean;
    recurConfig: RecurConfig | null;
  } | null>(null);

  const payeeMap = useMemo(() => new Map(payees.map((p) => [p.id, p.name])), [payees]);
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const categoryMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of categoryGroups) {
      for (const c of g.categories ?? []) {
        m.set(c.id, c.name);
      }
    }
    return m;
  }, [categoryGroups]);

  // Load schedule once on mount (not on focus — avoids overwriting picker selections)
  useEffect(() => {
    if (!id) return;
    clearPicker();

    (async () => {
      setLoading(true);
      try {
        const s = await getScheduleById(id);
        if (s) {
          setSchedule(s);
          setName(s.name ?? "");
          setPostsTransaction(s.posts_transaction);

          const amt = getScheduledAmount(s._amount);
          const isIncome = amt > 0;
          setType(isIncome ? "income" : "expense");
          amountInput.setCents(Math.abs(amt));

          const pId = s._payee ?? null;
          setPayeeId(pId);
          setPayeeName(pId ? (payeeMap.get(pId) ?? "") : "");

          const aId = s._account ?? null;
          setAcctId(aId);
          setAcctName(aId ? (accountMap.get(aId) ?? "") : "");

          const cId = s._category ?? null;
          setCategoryId(cId);
          setCategoryName(cId ? (categoryMap.get(cId) ?? "") : "");

          const rc =
            s._date && typeof s._date === "object" && "frequency" in s._date
              ? (s._date as RecurConfig)
              : null;
          setRecurConfig(rc);

          setInitial({
            type: isIncome ? "income" : "expense",
            cents: Math.abs(amt),
            name: s.name ?? null,
            payeeId: pId,
            acctId: aId,
            categoryId: cId,
            postsTransaction: s.posts_transaction,
            recurConfig: rc,
          });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Sync picker selections
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
    if (selectedCategory) {
      setCategoryId(selectedCategory.id);
      setCategoryName(selectedCategory.name);
    }
  }, [selectedCategory]);

  useEffect(() => {
    if (selectedRecurConfig) {
      setRecurConfig(selectedRecurConfig);
    }
  }, [selectedRecurConfig]);

  const status = schedule ? getStatus(schedule.next_date, schedule.completed, false) : null;
  const isRecurring = recurConfig != null;
  const recurDesc = isRecurring ? getRecurringDescription(recurConfig) : "";

  // Change detection
  const hasChanges =
    initial != null &&
    (type !== initial.type ||
      amountInput.cents !== initial.cents ||
      (name.trim() || null) !== initial.name ||
      payeeId !== initial.payeeId ||
      acctId !== initial.acctId ||
      categoryId !== initial.categoryId ||
      postsTransaction !== initial.postsTransaction ||
      JSON.stringify(recurConfig) !== JSON.stringify(initial.recurConfig));

  // ── Header colors based on type ──
  const isExpense = type === "expense";
  const headerBg = isExpense
    ? isDark
      ? withOpacity(colors.negative, 0.18)
      : colors.errorBackground
    : isDark
      ? withOpacity(colors.positive, 0.18)
      : colors.successBackground;
  const headerText = isExpense
    ? isDark
      ? colors.negative
      : colors.errorText
    : isDark
      ? colors.positive
      : colors.successText;

  const cardStyle = {
    backgroundColor: colors.cardBackground,
    borderRadius: br.lg,
    borderWidth: bw.thin,
    borderColor: colors.cardBorder,
    overflow: "hidden" as const,
  };

  const dividerStyle = {
    height: bw.thin,
    backgroundColor: colors.divider,
    marginHorizontal: spacing.lg,
  };

  async function handleSave() {
    if (!schedule || !acctId) return;

    Keyboard.dismiss();
    setSaving(true);

    await handleError(async () => {
      const conditions: RuleCondition[] = [];

      if (payeeId) {
        conditions.push({ field: "payee", op: "is", value: payeeId });
      }
      conditions.push({ field: "account", op: "is", value: acctId });

      const signedAmount =
        type === "expense" ? -Math.abs(amountInput.cents) : Math.abs(amountInput.cents);
      conditions.push({ field: "amount", op: "is", value: signedAmount });

      if (recurConfig) {
        conditions.push({ field: "date", op: "isapprox", value: recurConfig });
      }

      const recurrenceChanged =
        JSON.stringify(recurConfig) !== JSON.stringify(initial?.recurConfig);

      const actions: RuleAction[] = categoryId
        ? [{ op: "set", field: "category", value: categoryId }]
        : [];

      await update({
        schedule: {
          id: schedule.id,
          name: name.trim() || null,
          posts_transaction: postsTransaction,
        },
        conditions,
        actions,
        resetNextDate: recurrenceChanged,
      });
      load();
      router.dismiss();
    });
    setSaving(false);
  }

  function handleSkip() {
    Alert.alert(t("skipNextDate"), t("skipNextDateConfirm"), [
      { text: t("common:cancel"), style: "cancel" },
      {
        text: t("skip"),
        onPress: async () => {
          await skip(schedule!.id);
          load();
          useUndoStore.getState().showUndo(t("dateSkipped"));
        },
      },
    ]);
  }

  function handlePostNow() {
    Alert.alert(t("postTransactionNow"), t("postTransactionConfirm"), [
      { text: t("common:cancel"), style: "cancel" },
      {
        text: t("post"),
        onPress: async () => {
          await postTransaction(schedule!.id);
          load();
          useUndoStore.getState().showUndo(t("transactionPosted"));
        },
      },
    ]);
  }

  function handleComplete() {
    Alert.alert(t("completeSchedule"), t("completeConfirm"), [
      { text: t("common:cancel"), style: "cancel" },
      {
        text: t("complete"),
        onPress: async () => {
          await update({
            schedule: { id: schedule!.id, completed: true },
          });
          load();
          router.dismiss();
        },
      },
    ]);
  }

  function handleDelete() {
    Alert.alert(t("deleteSchedule"), t("deleteCannotUndo"), [
      { text: t("common:cancel"), style: "cancel" },
      {
        text: t("common:delete"),
        style: "destructive",
        onPress: async () => {
          await delete_(schedule!.id);
          load();
          useUndoStore.getState().showUndo(t("scheduleDeleted"));
          router.dismiss();
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      <Animated.ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* ── Colored header ── */}
        <AmountHeader
          type={type}
          cents={amountInput.cents}
          headerBg={headerBg}
          headerText={headerText}
          expressionMode={amountInput.expr.expressionMode}
          fullExpression={amountInput.expr.fullExpression}
          amountFocused={amountInput.amountFocused}
          renderCursor={amountInput.renderCursor}
          onFocusAmount={() => amountInput.sharedInputRef.current?.focus()}
          onChangeType={setType}
          spacing={spacing}
          primaryColor={colors.primary}
        >
          {status && (
            <View style={{ alignItems: "center", marginTop: spacing.xs }}>
              <ScheduleStatusBadge status={status} />
            </View>
          )}
        </AmountHeader>
        {/* ── Details card ── */}
        <View style={{ marginTop: -20, zIndex: 1, paddingHorizontal: spacing.lg }}>
          <View style={cardStyle}>
            <DetailRow
              icon="wallet"
              label={acctName}
              placeholder={t("account")}
              onPress={() =>
                router.push({ pathname: "./account-picker", params: { selectedId: acctId ?? "" } })
              }
            />
            <View style={dividerStyle} />

            <DetailRow
              icon="personOutline"
              label={payeeName}
              placeholder={t("payee")}
              onPress={() =>
                router.push({
                  pathname: "./payee-picker",
                  params: {
                    selectedId: payeeId ?? "",
                    selectedName: payeeName,
                    accountId: acctId ?? "",
                  },
                })
              }
            />
            <View style={dividerStyle} />

            <DetailRow
              icon="folderOutline"
              label={categoryName}
              placeholder={t("category")}
              onClear={
                categoryId
                  ? () => {
                      setCategoryId(null);
                      setCategoryName("");
                    }
                  : undefined
              }
              onPress={() =>
                router.push({
                  pathname: "./category-picker",
                  params: { selectedId: categoryId ?? "", hideSplit: "1" },
                })
              }
            />
            <View style={dividerStyle} />

            <DetailRow
              icon="repeat"
              label={recurDesc}
              placeholder={t("repeat")}
              onClear={recurConfig ? () => setRecurConfig(null) : undefined}
              onPress={() => {
                router.push({
                  pathname: "./recurrence",
                  params: recurConfig ? { config: JSON.stringify(recurConfig) } : {},
                });
              }}
            />
          </View>
        </View>

        {/* ── Settings card ── */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
          <View style={cardStyle}>
            <DetailRow
              icon="textOutline"
              label={name}
              placeholder={t("name")}
              onPress={() => {
                Alert.prompt(
                  t("scheduleName"),
                  t("scheduleNamePrompt"),
                  (text) => {
                    if (text !== undefined) setName(text);
                  },
                  "plain-text",
                  name,
                );
              }}
              onClear={name ? () => setName("") : undefined}
            />
            <View style={dividerStyle} />

            <Pressable
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.md,
                minHeight: 44,
              }}
              onPress={() => setPostsTransaction(!postsTransaction)}
            >
              <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                <Text variant="body" color={colors.textPrimary}>
                  {t("autoPostTransaction")}
                </Text>
              </View>
              <Switch
                value={postsTransaction}
                onValueChange={setPostsTransaction}
                trackColor={{ false: colors.inputBorder, true: colors.primary }}
                thumbColor={colors.cardBackground}
                ios_backgroundColor={colors.inputBorder}
              />
            </Pressable>
          </View>
        </View>

        {/* ── Error banner ── */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
          <ErrorBanner error={error} onDismiss={dismissError} />
        </View>

        {/* ── Buttons ── */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xl, gap: spacing.sm }}>
          <Button
            title={t("saveChanges")}
            onPress={handleSave}
            size="lg"
            loading={saving}
            disabled={!hasChanges || saving}
          />

          {isRecurring && (
            <Button
              title={t("skipNextDate")}
              icon="playForwardOutline"
              buttonStyle="borderless"
              onPress={handleSkip}
            />
          )}

          <Button
            title={t("postTransactionNow")}
            icon="checkmarkCircleOutline"
            buttonStyle="borderless"
            onPress={handlePostNow}
          />

          {schedule && !schedule.completed && (
            <Button
              title={t("completeSchedule")}
              icon="flagOutline"
              buttonStyle="borderless"
              onPress={handleComplete}
            />
          )}

          <Button
            title={t("deleteSchedule")}
            icon="trashOutline"
            buttonStyle="borderless"
            danger
            onPress={handleDelete}
          />
        </View>
      </Animated.ScrollView>

      <HiddenAmountInput amountInput={amountInput} />

      {/* ── Fixed top blur: fades in on scroll like Apple nav bars ── */}
      <Animated.View
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
          },
          blurContainerStyle,
        ]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={[colors.pageBackground + "B3", colors.pageBackground + "1A", "transparent"]}
          style={{ height: 70 }}
        />
      </Animated.View>

      {/* Close button */}
      <View style={{ position: "absolute", top: 12, left: spacing.md, zIndex: 11 }}>
        <GlassButton icon="close" onPress={() => router.dismiss()} />
      </View>

      {/* Title */}
      <View
        style={{
          position: "absolute",
          top: 12,
          left: 0,
          right: 0,
          height: 48,
          justifyContent: "center",
          alignItems: "center",
          zIndex: 11,
          pointerEvents: "none",
        }}
      >
        <Text variant="body" color={colors.textPrimary} style={{ fontWeight: "600" }}>
          {t("editSchedule")}
        </Text>
      </View>
    </View>
  );
}
