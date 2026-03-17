import { InputAccessoryView, Platform, TextInput, View, useColorScheme } from "react-native";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  interpolate,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { withOpacity } from "@/lib/colors";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { Button } from "@/presentation/components/atoms/Button";
import { ErrorBanner } from "@/presentation/components/molecules/ErrorBanner";
import { Text } from "@/presentation/components/atoms/Text";
import { GlassButton } from "@/presentation/components/atoms/GlassButton";
import { NotesField } from "@/presentation/components/transaction/NotesField";
import { ClearedToggle } from "@/presentation/components/transaction/ClearedToggle";
import { DetailRow } from "@/presentation/components/transaction/DetailRow";
import { CalculatorPill } from "@/presentation/components/currency-input/CalculatorPill";
import { AmountHeader } from "@/presentation/components/transaction/AmountHeader";
import { TransactionDetailsCard } from "@/presentation/components/transaction/TransactionDetailsCard";
import { useAmountInput } from "@/presentation/components/transaction/useAmountInput";
import { useTransactionForm } from "@/presentation/components/transaction/useTransactionForm";

export default function NewTransactionScreen() {
  const params = useLocalSearchParams<{
    accountId: string;
    accountName?: string;
    categoryId?: string;
    categoryName?: string;
    amount?: string;
    payeeName?: string;
    transactionId?: string;
  }>();
  const { t } = useTranslation("transactions");
  const router = useRouter();
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  // ── Hooks ──
  const amountInput = useAmountInput(params.amount ? Number(params.amount) : 0);
  const form = useTransactionForm(params, amountInput);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });
  const blurContainerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 50], [0, 1], "clamp"),
  }));

  // ── Header colors based on transaction type ──
  const isExpense = form.type === "expense";
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      <Animated.ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        keyboardShouldPersistTaps="handled"
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* ── Colored header ── */}
        <AmountHeader
          type={form.type}
          cents={amountInput.cents}
          headerBg={headerBg}
          headerText={headerText}
          expressionMode={amountInput.expr.expressionMode}
          fullExpression={amountInput.expr.fullExpression}
          amountFocused={amountInput.amountFocused}
          renderCursor={amountInput.renderCursor}
          onFocusAmount={() => amountInput.sharedInputRef.current?.focus()}
          onChangeType={form.setType}
          spacing={spacing}
          primaryColor={colors.primary}
        />

        {/* ── Main details card (overlaps header) ── */}
        <TransactionDetailsCard
          acctId={form.acctId}
          acctName={form.acctName}
          payeeId={form.payeeId}
          payeeName={form.payeeName}
          isTransfer={form.isTransfer}
          categoryId={form.categoryId}
          categoryName={form.categoryName}
          isSplit={form.isSplit}
          splitCount={form.splitCategories?.length ?? 0}
          dateInt={form.dateInt}
          dateStr={form.dateStr}
          cents={amountInput.cents}
          transactionId={params.transactionId}
          isEdit={form.isEdit}
          onDateChange={(newInt) => form.setDateInt(newInt)}
          onClearCategory={
            form.isEdit && form.categoryId && !form.isSplit && !form.isTransfer
              ? () => {
                  form.setCategoryId(null);
                  form.setCategoryName("");
                }
              : undefined
          }
          cardStyle={cardStyle}
          dividerStyle={dividerStyle}
          spacing={spacing}
        />

        {/* ── Notes card ── */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
          <View style={cardStyle}>
            <NotesField value={form.notes} onChangeText={form.setNotes} />
          </View>
        </View>

        {/* ── Status card (cleared + tags) ── */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
          <View style={cardStyle}>
            <ClearedToggle value={form.cleared} onValueChange={form.setCleared} />
            {!form.isEdit && (
              <>
                <View style={dividerStyle} />
                <DetailRow
                  icon="repeat"
                  label={form.recurConfig ? form.getRecurringDescription(form.recurConfig) : ""}
                  placeholder={t("repeat")}
                  onClear={form.recurConfig ? () => form.setRecurConfig(null) : undefined}
                  onPress={() => {
                    router.push({
                      pathname: "./recurrence",
                      params: form.recurConfig ? { config: JSON.stringify(form.recurConfig) } : {},
                    });
                  }}
                />
              </>
            )}
            <View style={dividerStyle} />
            <DetailRow
              icon="pricetags-outline"
              label={
                form.extractTagsFromNotes(form.notes).length > 0
                  ? form.extractTagsFromNotes(form.notes)
                      .map((tag) => `#${tag}`)
                      .join(", ")
                  : ""
              }
              placeholder={t("tags")}
              onPress={() => {
                router.push({
                  pathname: "./tags",
                  params: { mode: "picker", currentNotes: form.notes },
                });
              }}
            />
          </View>
        </View>

        {/* ── Error banner ── */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
          <ErrorBanner error={form.error} onDismiss={form.dismissError} />
        </View>

        {/* ── Action buttons ── */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xl }}>
          <Button
            title={form.isEdit ? t("saveChanges") : t("addTransaction")}
            onPress={form.handleSave}
            size="lg"
            loading={form.loading}
            disabled={amountInput.cents === 0 || (!form.isEdit && !form.acctId)}
          />

          {form.isEdit && (
            <Button
              title={t("deleteTransaction")}
              icon="trash-outline"
              variant="ghost"
              textColor={colors.negative}
              onPress={form.handleDelete}
              style={{ marginTop: spacing.sm }}
            />
          )}
        </View>
      </Animated.ScrollView>

      {/* InputAccessoryView registered BEFORE TextInput — iOS needs it available at focus time */}
      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={amountInput.AMOUNT_ACCESSORY_ID} backgroundColor="transparent">
          <CalculatorPill inputRef={amountInput.selfRef} />
        </InputAccessoryView>
      )}

      {/* Shared hidden TextInput — outside ScrollView for reliable focus */}
      <TextInput
        ref={amountInput.sharedInputRef}
        value={amountInput.currentAmountInputValue}
        onChangeText={amountInput.handleAmountChangeText}
        onFocus={() => amountInput.setAmountFocused(true)}
        onBlur={amountInput.handleAmountBlur}
        keyboardType="number-pad"
        autoFocus={!form.isEdit}
        caretHidden
        contextMenuHidden
        inputAccessoryViewID={Platform.OS === "ios" ? amountInput.AMOUNT_ACCESSORY_ID : undefined}
        style={{ position: "absolute", opacity: 0, height: 1, width: 1, pointerEvents: "none" }}
      />

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

      {/* Close button — always visible, fixed at top-left of modal */}
      <View style={{ position: "absolute", top: 12, left: spacing.md, zIndex: 11 }}>
        <GlassButton icon="xmark" onPress={() => router.dismiss()} />
      </View>

      {/* Title — always visible, vertically centered with close button */}
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
          {form.isEdit ? t("editTransaction") : t("addTransaction")}
        </Text>
      </View>

    </View>
  );
}
