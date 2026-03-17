import { useEffect, useMemo, useState } from "react";
import { Alert, Keyboard, Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { randomUUID } from "expo-crypto";
import { Icon } from "@/presentation/components/atoms/Icon";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { BlurView } from "expo-blur";
import { usePickerStore, type SplitLine } from "@/stores/pickerStore";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import { useKeyboardHeight } from "@/presentation/hooks/useKeyboardHeight";
import { useSharedAmountInput } from "@/presentation/hooks/useSharedAmountInput";
import { Text } from "@/presentation/components/atoms/Text";
import { Amount } from "@/presentation/components/atoms/Amount";
import { IconButton } from "@/presentation/components/atoms/IconButton";
import { GlassButton } from "@/presentation/components/atoms/GlassButton";
import { SharedAmountInput } from "@/presentation/components/transaction/SharedAmountInput";
import { CurrencyAmountDisplay } from "@/presentation/components/currency-input/CurrencyAmountDisplay";
import { formatAmount } from "@/lib/format";
import type { Theme } from "@/theme";

// ---------------------------------------------------------------------------
// Split Line Row — display only (no TextInput inside)
// ---------------------------------------------------------------------------

function SplitRow({
  line,
  isActive,
  expressionMode,
  fullExpression,
  onCategoryPress,
  onRemove,
  onPress,
}: {
  line: SplitLine;
  isActive: boolean;
  expressionMode: boolean;
  fullExpression: string;
  onCategoryPress: (id: string) => void;
  onRemove: (id: string) => void;
  onPress: () => void;
}) {
  const { colors, spacing } = useTheme();
  const { t } = useTranslation("transactions");

  const displayColor = isActive
    ? colors.primary
    : line.amount > 0
      ? colors.textPrimary
      : colors.textMuted;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingLeft: spacing.md,
        paddingRight: spacing.xs,
        paddingVertical: spacing.sm,
        minHeight: 48,
      }}
    >
      <Pressable
        onPress={() => onCategoryPress(line.id)}
        style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
      >
        <Icon
          name="folderOutline"
          size={16}
          color={colors.textMuted}
          style={{ marginRight: spacing.xs }}
        />
        <Text
          variant="body"
          color={line.categoryName ? colors.textPrimary : colors.textMuted}
          numberOfLines={1}
          style={{ flex: 1 }}
        >
          {line.categoryName || t("selectCategory")}
        </Text>
        <Icon
          name="chevronForward"
          size={14}
          color={colors.textMuted}
          style={{ marginRight: spacing.sm }}
        />
      </Pressable>

      <Pressable onPress={onPress}>
        <CurrencyAmountDisplay
          amount={line.amount}
          isActive={isActive}
          expressionMode={expressionMode}
          fullExpression={fullExpression}
          color={displayColor}
          primaryColor={colors.primary}
        />
      </Pressable>

      <IconButton
        name="closeCircle"
        size={18}
        color={colors.textMuted}
        onPress={() => onRemove(line.id)}
        style={{ marginLeft: spacing.xxs }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function SplitScreen() {
  const { amount, payeeName, payeeId, transactionId, fromCategoryPicker } = useLocalSearchParams<{
    amount: string;
    payeeName?: string;
    payeeId?: string;
    transactionId?: string;
    fromCategoryPicker?: string;
  }>();

  const router = useRouter();
  const { t } = useTranslation("transactions");
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { height: keyboardHeight, visible: keyboardVisible } = useKeyboardHeight();
  const fabStyle = useAnimatedStyle(() => ({ bottom: keyboardHeight.value }));

  const setSplitCategories = usePickerStore((s) => s.setSplitCategories);
  const existingSplit = usePickerStore((s) => s.splitCategories);
  const splitCategorySelection = usePickerStore((s) => s.splitCategorySelection);
  const clearSplitCategorySelection = usePickerStore((s) => s.setSplitCategorySelection);

  const totalCents = Number(amount) || 0;

  const [splits, setSplits] = useState<SplitLine[]>(() => {
    if (existingSplit && existingSplit.length > 0) return existingSplit;
    return [{ id: randomUUID(), categoryId: null, categoryName: "", amount: 0 }];
  });

  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const activeAmount = activeLineId ? (splits.find((s) => s.id === activeLineId)?.amount ?? 0) : 0;

  const shared = useSharedAmountInput({
    activeAmount,
    isActive: activeLineId !== null,
    onAmountChange: (cents) => {
      if (!activeLineId) return;
      setSplits((prev) => prev.map((s) => (s.id === activeLineId ? { ...s, amount: cents } : s)));
    },
    onBlur: () => setActiveLineId(null),
    onClear: () => {
      if (activeLineId) {
        setSplits((prev) => prev.map((s) => (s.id === activeLineId ? { ...s, amount: 0 } : s)));
      }
    },
  });

  function handleRowPress(id: string) {
    if (activeLineId === id) {
      shared.blur();
      return;
    }
    if (activeLineId) shared.expr.handleBlurExpression();
    setActiveLineId(id);
    shared.focus();
  }

  // Pick up category selection from split-category-picker
  useEffect(() => {
    if (splitCategorySelection) {
      const { lineId, categoryId, categoryName } = splitCategorySelection;
      clearSplitCategorySelection(null);
      setSplits((prev) =>
        prev.map((s) => (s.id === lineId ? { ...s, categoryId, categoryName } : s)),
      );
    }
  }, [splitCategorySelection]);

  const totalAllocated = splits.reduce((sum, s) => sum + s.amount, 0);
  const remaining = totalCents - totalAllocated;

  function handleCategoryPress(lineId: string) {
    const line = splits.find((s) => s.id === lineId);
    router.push({
      pathname: "./split-category-picker",
      params: { splitLineId: lineId, selectedId: line?.categoryId ?? "" },
    });
  }

  function handleRemove(id: string) {
    setSplits((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      return filtered.length === 0
        ? [{ id: randomUUID(), categoryId: null, categoryName: "", amount: 0 }]
        : filtered;
    });
    if (activeLineId === id) setActiveLineId(null);
  }

  function handleAdd() {
    setSplits((prev) => [
      ...prev,
      { id: randomUUID(), categoryId: null, categoryName: "", amount: 0 },
    ]);
  }

  function handleAssignRemaining() {
    if (!activeLineId || remaining <= 0) return;
    setSplits((prev) =>
      prev.map((s) => (s.id === activeLineId ? { ...s, amount: s.amount + remaining } : s)),
    );
    Keyboard.dismiss();
  }

  function handleDone() {
    if (totalCents > 0 && remaining !== 0) {
      Alert.alert(
        t("amountsDontMatchTitle"),
        t("amountsDontMatchMessage", { amount: formatAmount(Math.abs(remaining)) }),
      );
      return;
    }
    const validSplits = splits.filter((s) => s.amount > 0);
    if (validSplits.length === 0) {
      Alert.alert(t("noSplitsTitle"), t("noSplitsMessage"));
      return;
    }
    setSplitCategories(validSplits);
    router.dismiss(fromCategoryPicker === "1" ? 2 : 1);
  }

  const displayPayee = payeeName || t("noPayeeSet");
  const remainingColor = remaining === 0 ? theme.colors.positive : theme.colors.textMuted;

  return (
    <>
      {/* Back button */}
      <View style={{ position: "absolute", top: 12, left: theme.spacing.md, zIndex: 11 }}>
        <GlassButton icon="chevronBack" onPress={() => router.back()} />
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
        <Text variant="body" color={theme.colors.textPrimary} style={{ fontWeight: "600" }}>
          {t("splitTransaction")}
        </Text>
      </View>

      {/* Done button */}
      <View style={{ position: "absolute", top: 12, right: theme.spacing.md, zIndex: 11 }}>
        <GlassButton icon="checkmark" onPress={handleDone} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Payee + amount pill */}
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.payeePill}>
              <Icon name="personOutline" size={16} color={theme.colors.textMuted} />
              <Text
                variant="body"
                color={payeeName ? theme.colors.textPrimary : theme.colors.textMuted}
                style={{ marginLeft: theme.spacing.xs, fontWeight: "500" }}
                numberOfLines={1}
              >
                {displayPayee}
              </Text>
            </View>
            <Amount value={totalCents} variant="bodyLg" weight="700" showSign />
          </View>
        </View>

        {/* Section header */}
        <View style={styles.sectionHeader}>
          <Text variant="captionSm" color={theme.colors.textMuted} style={styles.sectionText}>
            {t("categories")}
          </Text>
          <Text variant="captionSm" color={remainingColor} style={styles.sectionText}>
            {totalCents > 0
              ? t("remaining", { amount: formatAmount(Math.abs(remaining)) })
              : t("total", { amount: formatAmount(totalAllocated) })}
          </Text>
        </View>

        {/* Split lines card */}
        <View style={styles.card}>
          {splits.map((line, index) => (
            <View key={line.id}>
              <SplitRow
                line={line}
                isActive={activeLineId === line.id}
                expressionMode={activeLineId === line.id && shared.expr.expressionMode}
                fullExpression={activeLineId === line.id ? shared.expr.fullExpression : ""}
                onCategoryPress={handleCategoryPress}
                onRemove={handleRemove}
                onPress={() => handleRowPress(line.id)}
              />
              {index < splits.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
          <View style={styles.divider} />
          <Pressable
            onPress={handleAdd}
            style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.6 }]}
          >
            <Icon name="addCircle" size={20} color={theme.colors.primary} />
            <Text variant="body" color={theme.colors.primary} style={{ fontWeight: "600" }}>
              {t("addAnother")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Shared hidden TextInput + InputAccessoryView */}
      <SharedAmountInput
        accessoryID={shared.accessoryID}
        sharedInputRef={shared.sharedInputRef}
        selfRef={shared.selfRef}
        value={shared.currentInputValue}
        onChangeText={shared.handleChangeText}
        onBlur={shared.handleBlur}
      />

      {/* Floating "assign remaining" button */}
      {keyboardVisible && totalCents > 0 && remaining > 0 && (
        <Animated.View
          style={[
            {
              position: "absolute",
              right: theme.spacing.lg,
              zIndex: 10,
              marginBottom: theme.spacing.sm,
              alignItems: "center",
            },
            fabStyle,
          ]}
        >
          <Pressable onPress={handleAssignRemaining}>
            {isLiquidGlassAvailable() ? (
              <GlassView isInteractive style={styles.fab}>
                <Text
                  variant="bodyLg"
                  color={theme.colors.textPrimary}
                  style={{ fontWeight: "700" }}
                >
                  {formatAmount(Math.abs(remaining))}
                </Text>
                <Text variant="captionSm" color={theme.colors.textSecondary}>
                  {t("remainingLabel")}
                </Text>
              </GlassView>
            ) : (
              <BlurView
                tint="systemChromeMaterial"
                intensity={100}
                style={[styles.fab, { overflow: "hidden" }]}
              >
                <Text
                  variant="bodyLg"
                  color={theme.colors.textPrimary}
                  style={{ fontWeight: "700" }}
                >
                  {formatAmount(Math.abs(remaining))}
                </Text>
                <Text variant="captionSm" color={theme.colors.textSecondary}>
                  {t("remainingLabel")}
                </Text>
              </BlurView>
            )}
          </Pressable>
        </Animated.View>
      )}
    </>
  );
}

const createStyles = (theme: Theme) => ({
  scroll: { flex: 1, backgroundColor: theme.colors.pageBackground },
  container: {
    paddingTop: 72,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  headerCard: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth.thin,
    borderColor: theme.colors.cardBorder,
    padding: theme.spacing.md,
  },
  headerRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  payeePill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    flex: 1,
    marginRight: theme.spacing.md,
  },
  sectionHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    paddingHorizontal: theme.spacing.sm,
  },
  sectionText: { fontWeight: "700" as const, letterSpacing: 0.8 },
  card: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth.thin,
    borderColor: theme.colors.cardBorder,
    overflow: "hidden" as const,
  },
  divider: {
    height: theme.borderWidth.thin,
    backgroundColor: theme.colors.divider,
    marginHorizontal: theme.spacing.md,
  },
  addButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  fab: {
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    alignItems: "center" as const,
  },
});
