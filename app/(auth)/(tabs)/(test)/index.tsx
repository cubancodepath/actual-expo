import { useImperativeHandle, useRef, useState } from "react";
import {
  Alert,
  InputAccessoryView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { ContextMenu } from "@/presentation/components/atoms/ContextMenu";
import { Input } from "@/presentation/components/atoms/Input";
import { SymbolView } from "expo-symbols";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { Text } from "@/presentation/components/atoms/Text";
import { Button } from "@/presentation/components/atoms/Button";
import { GlassButton } from "@/presentation/components/atoms/GlassButton";
import { Icon } from "@/presentation/components/atoms/Icon";
import { CurrencySymbol } from "@/presentation/components/atoms/CurrencySymbol";
import { useCursorBlink } from "@/presentation/hooks/useCursorBlink";
import { useExpressionMode } from "@/presentation/hooks/useExpressionMode";
import { useKeyboardBlur } from "@/presentation/hooks/useKeyboardBlur";
import { useSyncedPref } from "@/presentation/hooks/useSyncedPref";
import { MAX_CENTS, formatCents, formatExpression } from "@/lib/currency";
import { formatAmountParts } from "@/lib/format";

const glass = isLiquidGlassAvailable();
const ACCESSORY_ID = "sharedCalcToolbar";

// ── Demo Data ─────────────────────────────────────────────────────────

const DEMO_ACCOUNTS = [
  {
    id: "demo-1",
    name: "Checking Account",
    subtitle: "Main checking",
    balance: "$4,230.50",
    icon: "wallet" as const,
  },
  {
    id: "demo-2",
    name: "Savings Account",
    subtitle: "Emergency fund",
    balance: "$12,800.00",
    icon: "wallet" as const,
  },
  {
    id: "demo-3",
    name: "Credit Card",
    subtitle: "Visa ending 4521",
    balance: "-$1,340.25",
    icon: "wallet" as const,
  },
  {
    id: "demo-4",
    name: "Investment",
    subtitle: "Brokerage",
    balance: "$45,600.00",
    icon: "barChartOutline" as const,
  },
];

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

// ── Section Header ────────────────────────────────────────────────────

function SectionTitle({ children, first }: { children: string; first?: boolean }) {
  const { colors, spacing } = useTheme();
  return (
    <Text
      variant="captionSm"
      color={colors.textMuted}
      style={{
        fontWeight: "700",
        letterSpacing: 0.8,
        marginBottom: spacing.sm,
        marginTop: first ? 0 : spacing.xxxl,
      }}
    >
      {children}
    </Text>
  );
}

function SectionCaption({ children }: { children: string }) {
  const { colors, spacing } = useTheme();
  return (
    <Text variant="caption" color={colors.textSecondary} style={{ marginBottom: spacing.md }}>
      {children}
    </Text>
  );
}

function Row({ children, wrap }: { children: React.ReactNode; wrap?: boolean }) {
  const { spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        flexWrap: wrap ? "wrap" : undefined,
        marginBottom: spacing.lg,
      }}
    >
      {children}
    </View>
  );
}

// ── Calculator Pill ───────────────────────────────────────────────────

const OPERATORS: { icon: "plus" | "minus" | "multiply" | "divide"; value: string }[] = [
  { icon: "plus", value: "+" },
  { icon: "minus", value: "-" },
  { icon: "multiply", value: "*" },
  { icon: "divide", value: "/" },
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
  const pillStyle = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
  };

  function Btn({
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
      >
        <SymbolView name={icon} size={20} tintColor={color} />
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
        <Btn
          key={value}
          icon={icon}
          color={colors.textPrimary}
          onPress={() => inputRef.current?.injectOperator(value)}
        />
      ))}
      {divider}
      <Btn
        icon="equal"
        color={isExpressionMode ? colors.primary : colors.textMuted}
        onPress={() => inputRef.current?.evaluate()}
      />
      {divider}
      <Btn
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

// ── Category Row (currency input demo) ────────────────────────────────

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
  useSyncedPref("numberFormat");
  useSyncedPref("hideFraction");
  useSyncedPref("defaultCurrencyCode");
  useSyncedPref("defaultCurrencyCustomSymbol");
  useSyncedPref("currencySymbolPosition");
  useSyncedPref("currencySpaceBetweenAmountAndSymbol");

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

// ═══════════════════════════════════════════════════════════════════════
// Test Playground
// ═══════════════════════════════════════════════════════════════════════

export default function TestPlayground() {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const insets = useSafeAreaInsets();

  // ── Currency input state ──
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(CATEGORIES.map((c) => [c, 0])),
  );
  const [activeRow, setActiveRow] = useState<string | null>(null);
  const activeValue = activeRow ? (values[activeRow] ?? 0) : 0;

  function handleChangeValue(cents: number) {
    if (!activeRow) return;
    setValues((prev) => ({ ...prev, [activeRow]: cents }));
  }

  const sharedInputRef = useRef<TextInput>(null);
  const expr = useExpressionMode({ value: activeValue, onChangeValue: handleChangeValue });
  useSyncedPref("numberFormat");
  useSyncedPref("hideFraction");
  useSyncedPref("defaultCurrencyCode");
  useSyncedPref("defaultCurrencyCustomSymbol");
  useSyncedPref("currencySymbolPosition");
  useSyncedPref("currencySpaceBetweenAmountAndSymbol");

  function handleBlur() {
    expr.handleBlurExpression();
    setActiveRow(null);
  }

  useKeyboardBlur(activeRow !== null, handleBlur);

  const selfRef = useRef<SharedInputRef>(null);
  useImperativeHandle(selfRef, () => ({
    injectOperator: (op: string) => expr.injectOperator(op, () => sharedInputRef.current?.focus()),
    evaluate: () => expr.evaluate(),
    deleteBackward: () => {
      if (expr.expressionMode) expr.handleKeyPress({ nativeEvent: { key: "Backspace" } });
      else handleChangeValue(0);
    },
  }));

  function handleRowPress(name: string) {
    if (activeRow === name) {
      sharedInputRef.current?.blur();
      return;
    }
    if (activeRow && expr.expressionMode) expr.handleBlurExpression();
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
      return;
    }
    const newCents = Math.min(parseInt(text.replace(/\D/g, "") || "0", 10), MAX_CENTS);
    handleChangeValue(newCents);
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
        <Text variant="headingLg" color={colors.textPrimary} style={{ marginBottom: spacing.xs }}>
          Component Playground
        </Text>
        <Text variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.xl }}>
          Development only — preview components, styles, and interactions
        </Text>

        {/* ── ScalableText Test ───────────────────────── */}
        <SectionTitle first>SCALABLE TEXT TEST</SectionTitle>
        <View
          style={{
            backgroundColor: colors.cardBackground,
            borderRadius: 12,
            padding: 16,
            marginBottom: spacing.lg,
          }}
        >
          {(() => {
            const { Host, Text: SUIText, HStack, VStack } = require("@expo/ui/swift-ui");
            const { font, lineLimit, frame } = require("@expo/ui/swift-ui/modifiers");
            const { ScalableText } = require("../../../../modules/actual-ui");
            return (
              <Host style={{ height: 250 }} colorScheme="dark">
                <VStack spacing={8}>
                  <SUIText modifiers={[font({ size: 12 })]}>SUIText (truncates):</SUIText>
                  <HStack>
                    <SUIText modifiers={[font({ size: 14 }), lineLimit(1), frame({ width: 100 })]}>
                      AED9,999,999.99
                    </SUIText>
                  </HStack>
                  <SUIText modifiers={[font({ size: 12 })]}>ScalableText minScale=0.5:</SUIText>
                  <HStack>
                    <ScalableText
                      text="AED9,999,999.99"
                      fontSize={14}
                      maxLines={1}
                      minScale={0.5}
                      color="#ffffff"
                      monoDigits
                      modifiers={[frame({ width: 100 })]}
                    />
                  </HStack>
                  <SUIText modifiers={[font({ size: 12 })]}>ScalableText minScale=0.1:</SUIText>
                  <HStack>
                    <ScalableText
                      text="AED9,999,999.99"
                      fontSize={14}
                      maxLines={1}
                      minScale={0.1}
                      color="#ffffff"
                      monoDigits
                      modifiers={[frame({ width: 100 })]}
                    />
                  </HStack>
                  <SUIText modifiers={[font({ size: 12 })]}>ScalableText fits normally:</SUIText>
                  <HStack>
                    <ScalableText
                      text="AED547.45"
                      fontSize={14}
                      maxLines={1}
                      minScale={0.5}
                      color="#34d399"
                      monoDigits
                      modifiers={[frame({ width: 100 })]}
                    />
                  </HStack>
                </VStack>
              </Host>
            );
          })()}
        </View>

        {/* ── 0. SwiftUI List Prototype ─────────────────────────── */}
        <Pressable
          onPress={() => require("expo-router").router.push("/(auth)/(tabs)/(test)/swiftui-list")}
          style={{
            backgroundColor: colors.primary,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 10,
            marginBottom: spacing.lg,
            alignItems: "center",
          }}
        >
          <Text variant="body" color="#fff" style={{ fontWeight: "600" }}>
            SwiftUI List Prototype
          </Text>
        </Pressable>

        {/* ── 1. Currency Input ─────────────────────────────────── */}

        <SectionTitle first>CURRENCY INPUT</SectionTitle>
        <SectionCaption>Shared hidden TextInput with banking-style behavior</SectionCaption>

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

        {/* ── 2. Buttons ───────────────────────────────────────── */}

        <SectionTitle>BUTTONS — STYLES x SIZES</SectionTitle>

        {(["borderedProminent", "bordered", "borderedSecondary", "borderless"] as const).map(
          (bs) => (
            <View key={bs} style={{ marginBottom: spacing.xl }}>
              <Text
                variant="caption"
                color={colors.textSecondary}
                style={{ marginBottom: spacing.sm }}
              >
                {bs}
              </Text>
              <Row>
                <Button
                  title="Play"
                  icon="playSkipForwardOutline"
                  buttonStyle={bs}
                  size="sm"
                  onPress={() => {}}
                />
                <Button
                  title="Play"
                  icon="playSkipForwardOutline"
                  buttonStyle={bs}
                  size="md"
                  onPress={() => {}}
                />
                <Button
                  title="Play"
                  icon="playSkipForwardOutline"
                  buttonStyle={bs}
                  size="lg"
                  onPress={() => {}}
                />
              </Row>
              <Row>
                <Button icon="checkmark" buttonStyle={bs} size="sm" onPress={() => {}} />
                <Button icon="checkmark" buttonStyle={bs} size="md" onPress={() => {}} />
                <Button icon="checkmark" buttonStyle={bs} size="lg" onPress={() => {}} />
              </Row>
            </View>
          ),
        )}

        <SectionTitle>BUTTONS — DANGER</SectionTitle>
        <Row wrap>
          <Button
            title="Delete"
            icon="trashOutline"
            buttonStyle="borderedProminent"
            danger
            onPress={() => {}}
          />
          <Button
            title="Delete"
            icon="trashOutline"
            buttonStyle="bordered"
            danger
            onPress={() => {}}
          />
          <Button
            title="Delete"
            icon="trashOutline"
            buttonStyle="borderedSecondary"
            danger
            onPress={() => {}}
          />
          <Button
            title="Delete"
            icon="trashOutline"
            buttonStyle="borderless"
            danger
            onPress={() => {}}
          />
        </Row>
        <Row>
          <Button
            icon="trashOutline"
            buttonStyle="borderedProminent"
            danger
            size="md"
            onPress={() => {}}
          />
          <Button icon="trashOutline" buttonStyle="bordered" danger size="md" onPress={() => {}} />
          <Button
            icon="trashOutline"
            buttonStyle="borderedSecondary"
            danger
            size="md"
            onPress={() => {}}
          />
          <Button
            icon="trashOutline"
            buttonStyle="borderless"
            danger
            size="md"
            onPress={() => {}}
          />
        </Row>

        <SectionTitle>BUTTONS — STATES</SectionTitle>
        <Row wrap>
          <Button title="Loading" buttonStyle="borderedProminent" loading onPress={() => {}} />
          <Button title="Disabled" buttonStyle="borderedProminent" disabled onPress={() => {}} />
          <Button title="Loading" buttonStyle="bordered" loading onPress={() => {}} />
          <Button title="Disabled" buttonStyle="bordered" disabled onPress={() => {}} />
        </Row>

        <SectionTitle>BUTTONS — LABEL ONLY</SectionTitle>
        <Row wrap>
          <Button title="Label" buttonStyle="borderedProminent" size="sm" onPress={() => {}} />
          <Button title="Label" buttonStyle="bordered" size="sm" onPress={() => {}} />
          <Button title="Label" buttonStyle="borderedSecondary" size="sm" onPress={() => {}} />
          <Button title="Label" buttonStyle="borderless" size="sm" onPress={() => {}} />
        </Row>

        <SectionTitle>BUTTONS — HAPTIC FEEDBACK</SectionTitle>
        <Row wrap>
          <Button
            title="Light"
            haptic="light"
            buttonStyle="borderedSecondary"
            size="sm"
            onPress={() => {}}
          />
          <Button
            title="Medium"
            haptic="medium"
            buttonStyle="borderedSecondary"
            size="sm"
            onPress={() => {}}
          />
          <Button
            title="Heavy"
            haptic="heavy"
            buttonStyle="borderedSecondary"
            size="sm"
            onPress={() => {}}
          />
        </Row>
        <Row wrap>
          <Button title="Success" haptic="success" size="sm" onPress={() => {}} />
          <Button
            title="Warning"
            haptic="warning"
            buttonStyle="borderedSecondary"
            danger
            size="sm"
            onPress={() => {}}
          />
          <Button title="Error" haptic="error" danger size="sm" onPress={() => {}} />
        </Row>

        {/* ── 3. Glass Buttons ─────────────────────────────────── */}

        <SectionTitle>GLASS BUTTONS — ICON</SectionTitle>
        <Row>
          <GlassButton icon="close" onPress={() => {}} />
          <GlassButton icon="checkmark" onPress={() => {}} />
          <GlassButton icon="add" onPress={() => {}} />
          <GlassButton icon="search" onPress={() => {}} />
        </Row>

        <SectionTitle>GLASS BUTTONS — LABEL</SectionTitle>
        <Row wrap>
          <GlassButton label="Split" onPress={() => {}} />
          <GlassButton label="Done" onPress={() => {}} />
          <GlassButton label="Cancel" onPress={() => {}} />
        </Row>

        <SectionTitle>GLASS BUTTONS — TINTED</SectionTitle>
        <Row wrap>
          <GlassButton icon="close" variant="tinted" onPress={() => {}} />
          <GlassButton icon="checkmark" variant="tinted" onPress={() => {}} />
          <GlassButton label="Save" variant="tinted" onPress={() => {}} />
          <GlassButton label="Done" variant="tinted" onPress={() => {}} />
        </Row>

        <SectionTitle>GLASS BUTTONS — CUSTOM COLORS</SectionTitle>
        <Row wrap>
          <GlassButton icon="trashOutline" color={colors.negative} onPress={() => {}} />
          <GlassButton icon="checkmark" color={colors.positive} onPress={() => {}} />
          <GlassButton
            label="Delete"
            variant="tinted"
            tintColor={colors.negative}
            onPress={() => {}}
          />
          <GlassButton
            label="Confirm"
            variant="tinted"
            tintColor={colors.positive}
            onPress={() => {}}
          />
        </Row>

        <SectionTitle>GLASS BUTTONS — EFFECTS</SectionTitle>
        <Row>
          <GlassButton icon="add" glassEffectStyle="regular" onPress={() => {}} />
          <GlassButton icon="add" glassEffectStyle="clear" onPress={() => {}} />
          <GlassButton label="Regular" glassEffectStyle="regular" onPress={() => {}} />
          <GlassButton label="Clear" glassEffectStyle="clear" onPress={() => {}} />
        </Row>

        <SectionTitle>GLASS BUTTONS — DISABLED</SectionTitle>
        <Row wrap>
          <GlassButton icon="close" disabled onPress={() => {}} />
          <GlassButton icon="checkmark" disabled onPress={() => {}} />
          <GlassButton label="Split" disabled onPress={() => {}} />
          <GlassButton icon="add" variant="tinted" disabled onPress={() => {}} />
          <GlassButton label="Save" variant="tinted" disabled onPress={() => {}} />
        </Row>

        {/* ── 4. Icons ─────────────────────────────────────────── */}

        <SectionTitle>ICONS — WEIGHTS</SectionTitle>
        <Row>
          <Icon name="checkmarkCircle" size={28} weight="ultraLight" />
          <Icon name="checkmarkCircle" size={28} weight="thin" />
          <Icon name="checkmarkCircle" size={28} weight="light" />
          <Icon name="checkmarkCircle" size={28} weight="regular" />
          <Icon name="checkmarkCircle" size={28} weight="medium" />
          <Icon name="checkmarkCircle" size={28} weight="semibold" />
          <Icon name="checkmarkCircle" size={28} weight="bold" />
          <Icon name="checkmarkCircle" size={28} weight="heavy" />
          <Icon name="checkmarkCircle" size={28} weight="black" />
        </Row>

        <SectionTitle>ICONS — SCALES</SectionTitle>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.xl,
            marginBottom: spacing.lg,
          }}
        >
          <Icon name="star" size={28} scale="small" />
          <Icon name="star" size={28} scale="medium" />
          <Icon name="star" size={28} scale="large" />
        </View>

        <SectionTitle>ICONS — ANIMATIONS</SectionTitle>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.xl,
            marginBottom: spacing.lg,
          }}
        >
          <View style={{ alignItems: "center", gap: spacing.xs }}>
            <Icon
              name="checkmarkCircle"
              size={32}
              color={colors.positive}
              animationSpec={{
                effect: { type: "bounce", direction: "up" },
                repeating: true,
                speed: 2,
              }}
            />
            <Text variant="captionSm" color={colors.textMuted}>
              bounce
            </Text>
          </View>
          <View style={{ alignItems: "center", gap: spacing.xs }}>
            <Icon
              name="alertCircle"
              size={32}
              color={colors.negative}
              animationSpec={{ effect: { type: "pulse" }, repeating: true, speed: 1.5 }}
            />
            <Text variant="captionSm" color={colors.textMuted}>
              pulse
            </Text>
          </View>
          <View style={{ alignItems: "center", gap: spacing.xs }}>
            <Icon
              name="search"
              size={32}
              color={colors.primary}
              animationSpec={{ effect: { type: "scale" }, repeating: true, speed: 2 }}
            />
            <Text variant="captionSm" color={colors.textMuted}>
              scale
            </Text>
          </View>
        </View>

        {/* ── 5. Context Menu ──────────────────────────────────── */}

        <SectionTitle>CONTEXT MENU</SectionTitle>
        <SectionCaption>Long-press any row for native iOS context menu</SectionCaption>

        <View
          style={{
            backgroundColor: colors.cardBackground,
            borderRadius: br.lg,
            borderCurve: "continuous",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}
        >
          {DEMO_ACCOUNTS.map((account, i) => (
            <View key={account.id}>
              <ContextMenu>
                <ContextMenu.Trigger>
                  <Pressable
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: spacing.lg,
                      paddingVertical: 14,
                      gap: spacing.md,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        borderCurve: "continuous",
                        backgroundColor: `${colors.primary}15`,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon name={account.icon} size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="body" style={{ fontWeight: "500" }}>
                        {account.name}
                      </Text>
                      <Text variant="captionSm" color={colors.textMuted}>
                        {account.subtitle}
                      </Text>
                    </View>
                    <Text
                      variant="body"
                      color={account.balance.startsWith("-") ? colors.negative : colors.positive}
                      style={{ fontWeight: "600", fontVariant: ["tabular-nums"] }}
                    >
                      {account.balance}
                    </Text>
                  </Pressable>
                </ContextMenu.Trigger>
                <ContextMenu.Content>
                  <ContextMenu.Item
                    key="reconcile"
                    onSelect={() => Alert.alert("Reconcile", account.name)}
                  >
                    <ContextMenu.ItemTitle>Reconcile</ContextMenu.ItemTitle>
                    <ContextMenu.ItemIcon ios={{ name: "checkmark.circle" }} />
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    key="search"
                    onSelect={() => Alert.alert("Search", account.name)}
                  >
                    <ContextMenu.ItemTitle>Search Transactions</ContextMenu.ItemTitle>
                    <ContextMenu.ItemIcon ios={{ name: "magnifyingglass" }} />
                  </ContextMenu.Item>
                  <ContextMenu.Separator />
                  <ContextMenu.Item
                    key="rename"
                    onSelect={() => Alert.alert("Rename", account.name)}
                  >
                    <ContextMenu.ItemTitle>Rename</ContextMenu.ItemTitle>
                    <ContextMenu.ItemIcon ios={{ name: "pencil" }} />
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    key="settings"
                    onSelect={() => Alert.alert("Settings", account.name)}
                  >
                    <ContextMenu.ItemTitle>Settings</ContextMenu.ItemTitle>
                    <ContextMenu.ItemIcon ios={{ name: "gearshape" }} />
                  </ContextMenu.Item>
                  <ContextMenu.Separator />
                  <ContextMenu.Item
                    key="close"
                    destructive
                    onSelect={() => Alert.alert("Close Account", account.name)}
                  >
                    <ContextMenu.ItemTitle>Close Account</ContextMenu.ItemTitle>
                    <ContextMenu.ItemIcon ios={{ name: "trash" }} />
                  </ContextMenu.Item>
                </ContextMenu.Content>
              </ContextMenu>
              {i < DEMO_ACCOUNTS.length - 1 && (
                <View
                  style={{
                    height: bw.thin,
                    backgroundColor: colors.divider,
                    marginLeft: spacing.lg + 36 + spacing.md,
                  }}
                />
              )}
            </View>
          ))}
        </View>

        {/* ── 6. Input ─────────────────────────────────────────── */}

        <SectionTitle>INPUT — BASIC</SectionTitle>
        <Input placeholder="Account name" containerStyle={{ marginBottom: spacing.md }} />
        <Input
          placeholder="https://your-server.com"
          icon="serverOutline"
          containerStyle={{ marginBottom: spacing.md }}
        />
        <Input
          placeholder="Password"
          icon="lockClosedOutline"
          secureTextEntry
          containerStyle={{ marginBottom: spacing.md }}
        />

        <SectionTitle>INPUT — ERROR STATE</SectionTitle>
        <Input
          placeholder="Invalid input"
          icon="alertCircle"
          error
          containerStyle={{ marginBottom: spacing.md }}
        />

        <SectionTitle>INPUT — DISABLED</SectionTitle>
        <Input
          value="Read only value"
          editable={false}
          containerStyle={{ marginBottom: spacing.md, opacity: 0.5 }}
        />

        <SectionTitle>INPUT — KEYBOARD TYPES</SectionTitle>
        <Input
          placeholder="https://your-server.com"
          icon="serverOutline"
          keyboardType="url"
          autoCapitalize="none"
          containerStyle={{ marginBottom: spacing.md }}
        />
        <Input
          placeholder="email@example.com"
          icon="personOutline"
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </ScrollView>

      {/* Hidden shared TextInput for currency input demo */}
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

      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={ACCESSORY_ID} backgroundColor="transparent">
          <CalculatorPill inputRef={selfRef} isExpressionMode={expr.expressionMode} />
        </InputAccessoryView>
      )}
    </View>
  );
}
