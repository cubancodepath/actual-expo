import { useEffect, useState } from "react";
import { Alert, Keyboard, Pressable, Switch, useColorScheme, View } from "react-native";
import { useRouter } from "expo-router";
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  interpolate,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useAccountsStore } from "@/stores/accountsStore";
import { useSchedulesStore } from "@/stores/schedulesStore";
import { usePickerStore } from "@/stores/pickerStore";
import { useCategoriesStore } from "@/stores/categoriesStore";
import { getRecurringDescription } from "@/schedules";
import { todayStr } from "@/lib/date";
import { withOpacity } from "@/lib/colors";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { Button } from "@/presentation/components/atoms/Button";
import { Text } from "@/presentation/components/atoms/Text";
import { GlassButton } from "@/presentation/components/atoms/GlassButton";
import { AmountHeader } from "@/presentation/components/transaction/AmountHeader";
import { HiddenAmountInput } from "@/presentation/components/transaction/HiddenAmountInput";
import { useAmountInput } from "@/presentation/components/transaction/useAmountInput";
import { ErrorBanner } from "@/presentation/components/molecules/ErrorBanner";
import { useErrorHandler } from "@/presentation/hooks/useErrorHandler";
import type { TransactionType } from "@/presentation/components/transaction/TypeToggle";
import { DetailRow } from "@/presentation/components/transaction/DetailRow";
import type { RecurConfig, RuleCondition, RuleAction } from "@/schedules/types";

export default function NewScheduleScreen() {
  const router = useRouter();
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const { create, load } = useSchedulesStore();
  const accounts = useAccountsStore((s) => s.accounts);

  // Picker store
  const selectedPayee = usePickerStore((s) => s.selectedPayee);
  const selectedAccount = usePickerStore((s) => s.selectedAccount);
  const selectedCategory = usePickerStore((s) => s.selectedCategory);
  const selectedRecurConfig = usePickerStore((s) => s.selectedRecurConfig);
  const clearPicker = usePickerStore((s) => s.clear);

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
  const [recurConfig, setRecurConfig] = useState<RecurConfig>({
    frequency: "monthly",
    start: todayStr(),
  });
  const [saving, setSaving] = useState(false);
  const { error, handleError, setValidationError, dismissError } = useErrorHandler();
  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const blurContainerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 50], [0, 1], "clamp"),
  }));

  // Clear picker on mount, set default account
  useEffect(() => {
    clearPicker();
    const openAccounts = accounts.filter((a) => !a.closed);
    if (openAccounts.length > 0) {
      setAcctId(openAccounts[0].id);
      setAcctName(openAccounts[0].name);
    }
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

  const recurDesc = getRecurringDescription(recurConfig);

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
    if (!acctId) {
      setValidationError("Please select an account.");
      return;
    }
    if (amountInput.cents === 0) {
      setValidationError("Enter an amount.");
      return;
    }

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
      conditions.push({ field: "date", op: "isapprox", value: recurConfig });

      const actions: RuleAction[] = categoryId
        ? [{ op: "set", field: "category", value: categoryId }]
        : [];

      await create({
        schedule: {
          name: name.trim() || null,
          posts_transaction: postsTransaction,
        },
        conditions,
        actions,
      });

      load();
      router.dismiss();
    });
    setSaving(false);
  }

  const canSave = acctId && amountInput.cents !== 0;

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
        />

        {/* ── Details card ── */}
        <View style={{ marginTop: -20, zIndex: 1, paddingHorizontal: spacing.lg }}>
          <View style={cardStyle}>
            <DetailRow
              icon="wallet-outline"
              label={acctName}
              placeholder="Account"
              onPress={() =>
                router.push({
                  pathname: "./account-picker",
                  params: { selectedId: acctId ?? "" },
                })
              }
            />
            <View style={dividerStyle} />

            <DetailRow
              icon="person-outline"
              label={payeeName}
              placeholder="Payee"
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
              icon="folder-outline"
              label={categoryName}
              placeholder="Category"
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
              placeholder="Repeat"
              onPress={() => {
                router.push({
                  pathname: "./recurrence",
                  params: { config: JSON.stringify(recurConfig) },
                });
              }}
            />
          </View>
        </View>

        {/* ── Settings card ── */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
          <View style={cardStyle}>
            <DetailRow
              icon="text-outline"
              label={name}
              placeholder="Name"
              onPress={() => {
                Alert.prompt(
                  "Schedule Name",
                  "Optional display name",
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
                  Auto-post Transaction
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

        {/* ── Save button ── */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xl }}>
          <Button
            title="Create Schedule"
            onPress={handleSave}
            size="lg"
            loading={saving}
            disabled={!canSave || saving}
          />
        </View>
      </Animated.ScrollView>

      <HiddenAmountInput amountInput={amountInput} autoFocus />

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
        <GlassButton icon="xmark" onPress={() => router.dismiss()} />
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
          New Schedule
        </Text>
      </View>
    </View>
  );
}
