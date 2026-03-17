import { useImperativeHandle, useRef, useState } from "react";
import { InputAccessoryView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { Text } from "@/presentation/components/atoms/Text";
import { CurrencySymbol } from "@/presentation/components/atoms/CurrencySymbol";
import { useCursorBlink } from "@/presentation/hooks/useCursorBlink";
import { useExpressionMode } from "@/presentation/hooks/useExpressionMode";
import { useKeyboardBlur } from "@/presentation/hooks/useKeyboardBlur";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { MAX_CENTS, formatCents, formatExpression } from "@/lib/currency";
import { formatAmountParts } from "@/lib/format";

const glass = isLiquidGlassAvailable();
const ACCESSORY_ID = "sharedCalcToolbar";

const CATEGORIES = [
  "Groceries",
  "Rent",
  "Utilities",
  "Transport",
  "Entertainment",
  "Dining Out",
  "Clothing",
  "Health",
  "Insurance",
  "Savings",
];

// ---------------------------------------------------------------------------
// Calculator pill (same as production CalculatorPill)
// ---------------------------------------------------------------------------

const OPERATORS: {
  icon: "plus" | "minus" | "multiply" | "divide";
  value: string;
  label: string;
}[] = [
  { icon: "plus", value: "+", label: "Add" },
  { icon: "minus", value: "-", label: "Subtract" },
  { icon: "multiply", value: "*", label: "Multiply" },
  { icon: "divide", value: "/", label: "Divide" },
];

interface SharedInputRef {
  injectOperator: (op: string) => void;
  evaluate: () => void;
  deleteBackward: () => void;
}

function CalculatorPill({
  inputRef,
  isExpressionMode,
}: {
  inputRef: React.RefObject<SharedInputRef | null>;
  isExpressionMode: boolean;
}) {
  const { colors, spacing } = useTheme();
  const ICON_SIZE = 20;
  const pillStyle = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
  };

  function PillBtn({
    icon,
    color,
    onPress,
  }: {
    icon: Parameters<typeof SymbolView>[0]["name"];
    color: string;
    onPress: () => void;
  }) {
    return (
      <Pressable
        onPress={onPress}
        hitSlop={8}
        style={({ pressed }) => ({
          paddingHorizontal: 6,
          paddingVertical: 8,
          borderRadius: 8,
          backgroundColor: pressed ? "rgba(255,255,255,0.12)" : "transparent",
        })}
        accessibilityRole="button"
      >
        <SymbolView name={icon} size={ICON_SIZE} tintColor={color} />
      </Pressable>
    );
  }

  const divider = (
    <View
      style={{
        width: 1,
        height: 20,
        backgroundColor: colors.textMuted,
        opacity: 0.3,
        marginHorizontal: 4,
      }}
    />
  );

  const content = (
    <>
      {OPERATORS.map(({ icon, value }) => (
        <PillBtn
          key={value}
          icon={icon}
          color={colors.textPrimary}
          onPress={() => inputRef.current?.injectOperator(value)}
        />
      ))}
      {divider}
      <PillBtn
        icon="equal"
        color={isExpressionMode ? colors.primary : colors.textMuted}
        onPress={() => inputRef.current?.evaluate()}
      />
      {divider}
      <PillBtn
        icon="delete.backward"
        color={colors.textMuted}
        onPress={() => inputRef.current?.deleteBackward()}
      />
    </>
  );

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "flex-end",
        paddingHorizontal: spacing.md,
        marginBottom: 6,
      }}
    >
      {glass ? (
        <GlassView style={pillStyle}>{content}</GlassView>
      ) : (
        <BlurView tint="systemChromeMaterial" intensity={100} style={pillStyle}>
          {content}
        </BlurView>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Category row — display only, with blinking cursor when active
// ---------------------------------------------------------------------------

function CategoryRow({
  name,
  cents,
  isActive,
  expressionMode,
  fullExpression,
  previewCents,
  onPress,
}: {
  name: string;
  cents: number;
  isActive: boolean;
  expressionMode: boolean;
  fullExpression: string;
  previewCents: number | null;
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
    : cents !== 0
      ? colors.textPrimary
      : colors.textMuted;

  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: spacing.lg,
        paddingVertical: 12,
        minHeight: 44,
      }}
    >
      <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
        {name}
      </Text>
      <View style={{ alignItems: "flex-end" }}>
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
              const parts = formatAmountParts(Math.abs(cents), false);
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
                    style={{
                      fontWeight: "600",
                      fontVariant: ["tabular-nums"],
                      color: displayColor,
                    }}
                  >
                    {parts.svgSymbol ? parts.number : formatCents(Math.abs(cents))}
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
        {isActive && expressionMode && previewCents !== null && (
          <Text
            variant="captionSm"
            color={colors.textMuted}
            style={{ fontVariant: ["tabular-nums"], marginTop: 1 }}
          >
            = {formatCents(previewCents)}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Test screen — shared hidden TextInput with banking-style logic
// ---------------------------------------------------------------------------

export default function TestPlayground() {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const insets = useSafeAreaInsets();

  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(CATEGORIES.map((c) => [c, 0])),
  );
  const [activeRow, setActiveRow] = useState<string | null>(null);

  // The active row's value — drives the shared input
  const activeValue = activeRow ? (values[activeRow] ?? 0) : 0;

  function handleChangeValue(cents: number) {
    if (!activeRow) return;
    setValues((prev) => ({ ...prev, [activeRow]: cents }));
  }

  // Expression mode + shared input logic
  const sharedInputRef = useRef<TextInput>(null);
  const expr = useExpressionMode({ value: activeValue, onChangeValue: handleChangeValue });

  usePreferencesStore(
    (s) =>
      `${s.numberFormat}:${s.hideFraction}:${s.defaultCurrencyCode}:${s.defaultCurrencyCustomSymbol}:${s.currencySymbolPosition}:${s.currencySpaceBetweenAmountAndSymbol}`,
  );

  function handleBlur() {
    expr.handleBlurExpression();
    setActiveRow(null);
  }

  useKeyboardBlur(activeRow !== null, handleBlur);

  // Imperative ref for the calculator pill
  const selfRef = useRef<SharedInputRef>(null);
  useImperativeHandle(selfRef, () => ({
    injectOperator: (op: string) => expr.injectOperator(op, () => sharedInputRef.current?.focus()),
    evaluate: () => expr.evaluate(),
    deleteBackward: () => {
      if (expr.expressionMode) {
        expr.handleKeyPress({ nativeEvent: { key: "Backspace" } });
      } else {
        handleChangeValue(0);
      }
    },
  }));

  function handleRowPress(name: string) {
    if (activeRow === name) {
      sharedInputRef.current?.blur();
      return;
    }
    // If switching rows, commit current expression first
    if (activeRow && expr.expressionMode) {
      expr.handleBlurExpression();
    }
    setActiveRow(name);
    setTimeout(() => sharedInputRef.current?.focus(), 50);
  }

  const currentInputValue = expr.expressionMode
    ? expr.expressionInputValue
    : String(Math.abs(activeValue));

  function handleChangeText(text: string) {
    if (!activeRow) return;
    if (expr.expressionMode) {
      expr.handleChangeTextOperand(text);
    } else {
      const digits = text.replace(/\D/g, "");
      const newCents = Math.min(parseInt(digits || "0", 10), MAX_CENTS);
      handleChangeValue(newCents);
    }
  }

  const cardStyle = {
    backgroundColor: colors.cardBackground,
    borderRadius: br.lg,
    borderWidth: bw.thin,
    borderColor: colors.cardBorder,
    overflow: "hidden" as const,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.lg,
          paddingHorizontal: spacing.lg,
          paddingBottom: 120,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="headingLg" color={colors.textPrimary} style={{ marginBottom: spacing.xl }}>
          Test Playground
        </Text>

        <Text
          variant="captionSm"
          color={colors.textMuted}
          style={{ fontWeight: "700", letterSpacing: 0.8, marginBottom: spacing.sm }}
        >
          SHARED INPUT — FULL CURRENCY BEHAVIOR
        </Text>

        <View style={cardStyle}>
          {CATEGORIES.map((name, i) => (
            <View key={name}>
              <CategoryRow
                name={name}
                cents={values[name]}
                isActive={activeRow === name}
                expressionMode={activeRow === name && expr.expressionMode}
                fullExpression={activeRow === name ? expr.fullExpression : ""}
                previewCents={activeRow === name ? expr.previewCents : null}
                onPress={() => handleRowPress(name)}
              />
              {i < CATEGORIES.length - 1 && (
                <View
                  style={{
                    height: bw.thin,
                    backgroundColor: colors.divider,
                    marginHorizontal: spacing.lg,
                  }}
                />
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Shared hidden TextInput — one for all rows */}
      <TextInput
        ref={sharedInputRef}
        value={currentInputValue}
        onChangeText={handleChangeText}
        onBlur={handleBlur}
        keyboardType="number-pad"
        caretHidden
        contextMenuHidden
        inputAccessoryViewID={Platform.OS === "ios" ? ACCESSORY_ID : undefined}
        style={{ position: "absolute", opacity: 0, height: 0, width: 0 }}
      />

      {/* Single InputAccessoryView — calculator pill */}
      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={ACCESSORY_ID} backgroundColor="transparent">
          <CalculatorPill inputRef={selfRef} isExpressionMode={expr.expressionMode} />
        </InputAccessoryView>
      )}
    </View>
  );
}
