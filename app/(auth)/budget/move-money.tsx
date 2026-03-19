import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Icon } from "@/presentation/components/atoms/Icon";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { palette } from "@/theme/colors";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { transferMultipleCategories } from "@/budgets";
import { Text } from "@/presentation/components/atoms/Text";
import { Amount } from "@/presentation/components/atoms/Amount";
import { Button } from "@/presentation/components/atoms/Button";
import { GlassButton } from "@/presentation/components/atoms/GlassButton";
import { SharedAmountInput } from "@/presentation/components/transaction/SharedAmountInput";
import { EditableAmountRow } from "@/presentation/components/currency-input/EditableAmountRow";
import { useSharedAmountInput } from "@/presentation/hooks/useSharedAmountInput";

type SourceEntry = {
  id: string;
  name: string;
  balance: number;
  groupName: string;
  amount: number;
};

type MoveDirection = "to" | "from";

// ---------------------------------------------------------------------------
// Source Row — display only
// ---------------------------------------------------------------------------

function SourceRow({
  source,
  direction,
  isActive,
  expressionMode,
  fullExpression,
  onRemove,
  onPress,
}: {
  source: SourceEntry;
  direction: MoveDirection;
  isActive: boolean;
  expressionMode: boolean;
  fullExpression: string;
  onRemove: (id: string) => void;
  onPress: () => void;
}) {
  const { colors, spacing } = useTheme();
  const remainingBalance =
    direction === "to" ? source.balance - source.amount : source.balance + source.amount;

  return (
    <EditableAmountRow
      label={source.name}
      amount={source.amount}
      isActive={isActive}
      expressionMode={expressionMode}
      fullExpression={fullExpression}
      onPress={onPress}
    >
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

      <Button
        icon="closeCircle"
        buttonStyle="borderless"
        color={colors.textMuted}
        onPress={() => onRemove(source.id)}
        style={{ marginLeft: spacing.xxs }}
      />
    </EditableAmountRow>
  );
}

// ---------------------------------------------------------------------------
// Direction Toggle
// ---------------------------------------------------------------------------

const TRACK_WIDTH = 32;
const TRACK_HEIGHT = 56;
const THUMB_SIZE = 26;
const THUMB_TRAVEL = TRACK_HEIGHT - THUMB_SIZE - 6;

function DirectionToggle({
  direction,
  onToggle,
  fromLabel,
  toLabel,
}: {
  direction: MoveDirection;
  onToggle: () => void;
  fromLabel: string;
  toLabel: string;
}) {
  const { colors } = useTheme();
  const progress = useSharedValue(direction === "to" ? 0 : 1);

  useEffect(() => {
    progress.value = withTiming(direction === "to" ? 0 : 1, { duration: 250 });
  }, [direction]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.value, [0, 1], [0, THUMB_TRAVEL]) }],
  }));

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(progress.value, [0, 1], [0, 180])}deg` }],
  }));

  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          onToggle();
        }}
        hitSlop={8}
      >
        <View
          style={{
            width: TRACK_WIDTH,
            height: TRACK_HEIGHT,
            borderRadius: TRACK_WIDTH / 2,
            backgroundColor: "rgba(255,255,255,0.3)",
            alignItems: "center",
            paddingTop: 3,
          }}
        >
          <Animated.View
            style={[
              {
                width: THUMB_SIZE,
                height: THUMB_SIZE,
                borderRadius: THUMB_SIZE / 2,
                backgroundColor: "#ffffff",
                alignItems: "center",
                justifyContent: "center",
              },
              thumbStyle,
            ]}
          >
            <Animated.View style={arrowStyle}>
              <Icon name="arrowUp" size={16} color={colors.primary} />
            </Animated.View>
          </Animated.View>
        </View>
      </Pressable>
      <Animated.View
        key={direction}
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(100)}
      >
        <Text variant="captionSm" color="rgba(255,255,255,0.8)" style={{ fontWeight: "600" }}>
          {direction === "to" ? fromLabel : toLabel}
        </Text>
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function MoveMoneyScreen() {
  const { t } = useTranslation("budget");
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { catId, catName, balance } = useLocalSearchParams<{
    catId: string;
    catName: string;
    balance: string;
  }>();

  const month = useBudgetUIStore((s) => s.month);
  const coverTarget = useBudgetUIStore((s) => s.coverTarget);
  const setCoverTarget = useBudgetUIStore((s) => s.setCoverTarget);

  const [direction, setDirection] = useState<MoveDirection>("to");
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [saving, setSaving] = useState(false);

  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const activeAmount = activeSourceId
    ? (sources.find((s) => s.id === activeSourceId)?.amount ?? 0)
    : 0;

  const shared = useSharedAmountInput({
    activeAmount,
    isActive: activeSourceId !== null,
    onAmountChange: (cents) => {
      if (!activeSourceId) return;
      setSources((prev) =>
        prev.map((s) => (s.id === activeSourceId ? { ...s, amount: cents } : s)),
      );
    },
    onBlur: () => setActiveSourceId(null),
    onClear: () => {
      if (activeSourceId) {
        setSources((prev) => prev.map((s) => (s.id === activeSourceId ? { ...s, amount: 0 } : s)));
      }
    },
  });

  function handleRowPress(id: string) {
    if (activeSourceId === id) {
      shared.blur();
      return;
    }
    if (activeSourceId) shared.expr.handleBlurExpression();
    setActiveSourceId(id);
    shared.focus();
  }

  const balanceCents = Number(balance);
  const totalAmount = sources.reduce((sum, s) => sum + s.amount, 0);
  const projectedBalance =
    direction === "to" ? balanceCents + totalAmount : balanceCents - totalAmount;

  // Open picker after mount
  const [didAutoOpen, setDidAutoOpen] = useState(false);
  useEffect(() => {
    if (!didAutoOpen && sources.length === 0) {
      setDidAutoOpen(true);
      const timer = setTimeout(() => handleAddCategory(), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (coverTarget) {
      const { catId: srcId, catName: srcName, balance: srcBalance } = coverTarget;
      setCoverTarget(null);
      if (sources.some((s) => s.id === srcId)) return;
      setSources((prev) => [
        ...prev,
        { id: srcId, name: srcName, balance: srcBalance, groupName: "", amount: 0 },
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
      pathname: "/(auth)/budget/move-category-picker",
      params: { excludeIds, moveCatId: catId, direction },
    });
  }

  async function handleMove() {
    if (!catId || saving) return;
    setSaving(true);
    try {
      const entries = sources.filter((s) => s.amount > 0);
      if (entries.length === 0) return;
      await transferMultipleCategories(
        month,
        catId,
        entries.map((s) => ({ categoryId: s.id, amountCents: s.amount, name: s.name })),
        direction === "to" ? "to" : "from",
        catName,
      );
      router.back();
    } finally {
      setSaving(false);
    }
  }

  const headerBg =
    projectedBalance > 0
      ? colors.positiveFill
      : projectedBalance < 0
        ? colors.negativeFill
        : colors.primary;
  const headerText = palette.white;

  return (
    <>
      <ScrollView
        style={{ backgroundColor: colors.pageBackground }}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        <Stack.Screen options={{ headerShown: false }} />

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
            <GlassButton icon="close" onPress={() => router.back()} color={headerText} />
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
            <Amount value={projectedBalance} variant="body" color={headerText} weight="700" />
          </View>

          <DirectionToggle
            direction={direction}
            onToggle={() => setDirection((d) => (d === "to" ? "from" : "to"))}
            fromLabel={t("from")}
            toLabel={t("to")}
          />
        </View>

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
            {sources.map((source) => (
              <View key={source.id}>
                <SourceRow
                  source={source}
                  direction={direction}
                  isActive={activeSourceId === source.id}
                  expressionMode={activeSourceId === source.id && shared.expr.expressionMode}
                  fullExpression={activeSourceId === source.id ? shared.expr.fullExpression : ""}
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
              <Icon name="addCircle" size={20} color={colors.primary} />
              <Text variant="body" color={colors.primary} style={{ fontWeight: "600" }}>
                {sources.length === 0 ? t("addCategory") : t("addAnother")}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xl }}>
          <Button
            title={saving ? t("movingEllipsis") : t("move")}
            loading={saving}
            disabled={totalAmount === 0}
            onPress={handleMove}
            style={{ borderRadius: br.lg }}
          />
        </View>
      </ScrollView>

      <SharedAmountInput
        accessoryID={shared.accessoryID}
        sharedInputRef={shared.sharedInputRef}
        selfRef={shared.selfRef}
        value={shared.currentInputValue}
        onChangeText={shared.handleChangeText}
        onBlur={shared.handleBlur}
      />
    </>
  );
}
