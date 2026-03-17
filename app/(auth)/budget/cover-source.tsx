import { useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { palette } from "@/theme/colors";
import { useBudgetStore } from "@/stores/budgetStore";
import { transferMultipleCategories } from "@/budgets";
import { TO_BUDGET_ID } from "./cover-category-picker";
import { Text } from "@/presentation/components/atoms/Text";
import { Amount } from "@/presentation/components/atoms/Amount";
import { Button } from "@/presentation/components/atoms/Button";
import { IconButton } from "@/presentation/components/atoms/IconButton";
import { GlassButton } from "@/presentation/components/atoms/GlassButton";
import { SharedAmountInput } from "@/presentation/components/transaction/SharedAmountInput";
import { CurrencySymbol } from "@/presentation/components/atoms/CurrencySymbol";
import { useCursorBlink } from "@/presentation/hooks/useCursorBlink";
import { useExpressionMode } from "@/presentation/hooks/useExpressionMode";
import { useKeyboardBlur } from "@/presentation/hooks/useKeyboardBlur";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { formatAmountParts } from "@/lib/format";
import { formatCents, formatExpression, MAX_CENTS } from "@/lib/currency";
import type { CurrencyInputRef } from "@/presentation/components/currency-input";

type SourceEntry = {
  id: string;
  name: string;
  balance: number;
  groupName: string;
  amount: number;
};

// ---------------------------------------------------------------------------
// Source Row — display only
// ---------------------------------------------------------------------------

function SourceRow({
  source,
  isActive,
  expressionMode,
  fullExpression,
  onRemove,
  onPress,
}: {
  source: SourceEntry;
  isActive: boolean;
  expressionMode: boolean;
  fullExpression: string;
  onRemove: (id: string) => void;
  onPress: () => void;
}) {
  const { colors, spacing } = useTheme();
  const { renderCursor } = useCursorBlink(isActive);
  usePreferencesStore(
    (s) =>
      `${s.numberFormat}:${s.hideFraction}:${s.defaultCurrencyCode}:${s.defaultCurrencyCustomSymbol}:${s.currencySymbolPosition}:${s.currencySpaceBetweenAmountAndSymbol}`,
  );

  const displayColor = isActive
    ? colors.primary
    : source.amount > 0
      ? colors.textPrimary
      : colors.textMuted;
  const remainingBalance = source.balance - source.amount;

  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingLeft: spacing.md,
        paddingRight: spacing.xs,
        paddingVertical: spacing.sm,
        minHeight: 48,
      }}
    >
      <Text variant="body" color={colors.textPrimary} numberOfLines={1} style={{ flex: 1 }}>
        {source.name}
      </Text>

      {/* Amount display */}
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {isActive && expressionMode ? (
          <Text
            variant="body"
            style={{ fontWeight: "600", fontVariant: ["tabular-nums"], color: colors.primary }}
            numberOfLines={1}
          >
            {formatExpression(fullExpression)}
          </Text>
        ) : (
          (() => {
            const parts = formatAmountParts(Math.abs(source.amount), false);
            const fontSize = 14;
            return (
              <>
                {parts.svgSymbol && parts.position === "before" && (
                  <>
                    <CurrencySymbol
                      symbol={parts.symbol}
                      svgSymbol={parts.svgSymbol}
                      fontSize={fontSize}
                      color={displayColor}
                    />
                    {parts.spaceBetween && <View style={{ width: Math.round(fontSize / 3) }} />}
                  </>
                )}
                <Text
                  variant="body"
                  style={{ fontWeight: "600", fontVariant: ["tabular-nums"], color: displayColor }}
                >
                  {parts.svgSymbol ? parts.number : formatCents(Math.abs(source.amount))}
                </Text>
                {parts.svgSymbol && parts.position === "after" && (
                  <>
                    {parts.spaceBetween && <View style={{ width: Math.round(fontSize / 3) }} />}
                    <CurrencySymbol
                      symbol={parts.symbol}
                      svgSymbol={parts.svgSymbol}
                      fontSize={fontSize}
                      color={displayColor}
                    />
                  </>
                )}
              </>
            );
          })()
        )}
        {renderCursor({ width: 1.5, height: 16, marginLeft: 1, borderRadius: 1 }, colors.primary)}
      </View>

      {/* Remaining pill */}
      <View
        style={{
          backgroundColor: remainingBalance >= 0 ? colors.positiveSubtle : colors.negativeSubtle,
          borderRadius: 100,
          paddingHorizontal: 8,
          paddingVertical: 2,
          marginLeft: spacing.sm,
          alignItems: "center",
        }}
      >
        <Amount
          value={remainingBalance}
          variant="captionSm"
          color={remainingBalance >= 0 ? colors.positive : colors.negative}
          weight="700"
        />
      </View>

      <IconButton
        sfSymbol="xmark.circle.fill"
        size={18}
        color={colors.textMuted}
        onPress={() => onRemove(source.id)}
        style={{ marginLeft: spacing.xxs }}
      />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function CoverSourceScreen() {
  const { t } = useTranslation("budget");
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { catId, catName, balance } = useLocalSearchParams<{
    catId: string;
    catName: string;
    balance: string;
  }>();

  const month = useBudgetStore((s) => s.month);
  const loadBudget = useBudgetStore((s) => s.load);
  const coverTarget = useBudgetStore((s) => s.coverTarget);
  const setCoverTarget = useBudgetStore((s) => s.setCoverTarget);

  const balanceCents = Math.abs(Number(balance));
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [saving, setSaving] = useState(false);

  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const activeAmount = activeSourceId
    ? (sources.find((s) => s.id === activeSourceId)?.amount ?? 0)
    : 0;

  // Shared hidden input
  const accessoryID = useId();
  const sharedInputRef = useRef<TextInput>(null);
  const selfRef = useRef<CurrencyInputRef>(null);

  const expr = useExpressionMode({
    value: activeAmount,
    onChangeValue: (cents) => {
      if (!activeSourceId) return;
      setSources((prev) =>
        prev.map((s) => (s.id === activeSourceId ? { ...s, amount: cents } : s)),
      );
    },
  });

  useKeyboardBlur(activeSourceId !== null, () => {
    expr.handleBlurExpression();
    setActiveSourceId(null);
  });

  useImperativeHandle(selfRef, () => ({
    focus: () => sharedInputRef.current?.focus(),
    injectOperator: (op: string) =>
      expr.injectOperator(op, () => sharedInputRef.current?.focus()),
    evaluate: () => expr.evaluate(),
    deleteBackward: () => {
      if (expr.expressionMode) {
        expr.handleKeyPress({ nativeEvent: { key: "Backspace" } });
      } else if (activeSourceId) {
        setSources((prev) =>
          prev.map((s) => (s.id === activeSourceId ? { ...s, amount: 0 } : s)),
        );
      }
    },
  }));

  const currentInputValue = expr.expressionMode
    ? expr.expressionInputValue
    : String(activeAmount);

  function handleChangeText(text: string) {
    if (!activeSourceId) return;
    if (expr.expressionMode) {
      expr.handleChangeTextOperand(text);
    } else {
      const digits = text.replace(/\D/g, "");
      const newCents = Math.min(parseInt(digits || "0", 10), MAX_CENTS);
      setSources((prev) =>
        prev.map((s) => (s.id === activeSourceId ? { ...s, amount: newCents } : s)),
      );
    }
  }

  function handleRowPress(id: string) {
    if (activeSourceId === id) {
      sharedInputRef.current?.blur();
      return;
    }
    if (activeSourceId) expr.handleBlurExpression();
    setActiveSourceId(id);
    setTimeout(() => sharedInputRef.current?.focus(), 50);
  }

  const totalCovered = sources.reduce((sum, s) => sum + s.amount, 0);
  const remaining = balanceCents - totalCovered;

  // Open picker after mount
  const [didAutoOpen, setDidAutoOpen] = useState(false);
  useEffect(() => {
    if (!didAutoOpen && sources.length === 0) {
      setDidAutoOpen(true);
      const timer = setTimeout(() => handleAddCategory(), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Pick up category from picker
  useEffect(() => {
    if (coverTarget) {
      const { catId: srcId, catName: srcName, balance: srcBalance } = coverTarget;
      setCoverTarget(null);
      if (sources.some((s) => s.id === srcId)) return;
      const defaultAmount = Math.min(Math.abs(srcBalance), Math.max(remaining, 0));
      setSources((prev) => [
        ...prev,
        { id: srcId, name: srcName, balance: srcBalance, groupName: "", amount: defaultAmount },
      ]);
    }
  }, [coverTarget]);

  function handleRemoveSource(id: string) {
    setSources((prev) => prev.filter((s) => s.id !== id));
    if (activeSourceId === id) setActiveSourceId(null);
  }

  function handleAddCategory() {
    const excludeIds = sources.map((s) => s.id).join(",");
    router.push({
      pathname: "/(auth)/budget/cover-category-picker",
      params: { excludeIds, overspentCatId: catId },
    });
  }

  async function handleCover() {
    if (!catId || saving) return;
    setSaving(true);
    try {
      const toBudgetSource = sources.find((s) => s.id === TO_BUDGET_ID && s.amount > 0);
      const categorySources = sources.filter((s) => s.id !== TO_BUDGET_ID && s.amount > 0);

      if (toBudgetSource) {
        const data = useBudgetStore.getState().data;
        const targetCat = data?.groups.flatMap((g) => g.categories).find((c) => c.id === catId);
        const currentBudgeted = targetCat?.budgeted ?? 0;
        await useBudgetStore.getState().setAmount(catId, currentBudgeted + toBudgetSource.amount);
      }

      if (categorySources.length > 0) {
        await transferMultipleCategories(
          month,
          catId,
          categorySources.map((s) => ({ categoryId: s.id, amountCents: s.amount, name: s.name })),
          "to",
          catName,
        );
      }

      await loadBudget();
      router.dismiss(2);
    } finally {
      setSaving(false);
    }
  }

  const isCovered = remaining <= 0 && sources.length > 0;
  const headerBg = isCovered ? colors.positiveFill : colors.warningFill;
  const headerText = palette.white;

  return (
    <>
      <ScrollView
        style={{ backgroundColor: colors.pageBackground }}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        <Stack.Screen options={{ headerShown: false }} />

        {/* Header */}
        <View
          style={{
            backgroundColor: headerBg,
            paddingTop: 56,
            paddingBottom: spacing.xxxl,
            paddingHorizontal: spacing.lg,
            borderBottomLeftRadius: br.lg,
            borderBottomRightRadius: br.lg,
            alignItems: "center",
            gap: spacing.sm,
          }}
        >
          <View style={{ position: "absolute", top: 16, left: spacing.md }}>
            <GlassButton icon="xmark" onPress={() => router.back()} color={headerText} />
          </View>
          <Text variant="headingSm" color={headerText} align="center">
            {catName}
          </Text>
          <View
            style={{
              backgroundColor: "rgba(255,255,255,0.2)",
              borderRadius: br.full,
              paddingHorizontal: 12,
              paddingVertical: 4,
            }}
          >
            <Amount value={-remaining} variant="body" color={palette.white} weight="700" />
          </View>
        </View>

        {/* Source card */}
        <View style={{ marginTop: -20, zIndex: 1, paddingHorizontal: spacing.lg }}>
          <View
            style={{
              backgroundColor: colors.cardBackground,
              borderRadius: br.lg,
              borderWidth: bw.thin,
              borderColor: colors.cardBorder,
              overflow: "hidden",
            }}
          >
            {sources.map((source, index) => (
              <View key={source.id}>
                <SourceRow
                  source={source}
                  isActive={activeSourceId === source.id}
                  expressionMode={activeSourceId === source.id && expr.expressionMode}
                  fullExpression={activeSourceId === source.id ? expr.fullExpression : ""}
                  onRemove={handleRemoveSource}
                  onPress={() => handleRowPress(source.id)}
                />
                <View
                  style={{
                    height: bw.thin,
                    backgroundColor: colors.divider,
                    marginHorizontal: spacing.md,
                  }}
                />
              </View>
            ))}

            <Pressable
              onPress={handleAddCategory}
              style={({ pressed }) => [
                {
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: spacing.md,
                  gap: spacing.xs,
                },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Ionicons name="add-circle" size={20} color={colors.primary} />
              <Text variant="body" color={colors.primary} style={{ fontWeight: "600" }}>
                {sources.length === 0 ? t("addCategory") : t("addAnother")}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xl }}>
          <Button
            title={saving ? t("coveringEllipsis") : t("cover")}
            variant="primary"
            loading={saving}
            disabled={totalCovered === 0}
            onPress={handleCover}
            style={{ borderRadius: br.lg }}
          />
        </View>
      </ScrollView>

      {/* Shared hidden input + toolbar */}
      <SharedAmountInput
        accessoryID={accessoryID}
        sharedInputRef={sharedInputRef}
        selfRef={selfRef}
        value={currentInputValue}
        onChangeText={handleChangeText}
        onBlur={() => {
          expr.handleBlurExpression();
          setActiveSourceId(null);
        }}
      />
    </>
  );
}
