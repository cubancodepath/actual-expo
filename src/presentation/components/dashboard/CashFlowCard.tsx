import { useState, useMemo } from "react";
import { View, Pressable } from "react-native";
import { AnimatedView } from "../atoms/AnimatedView";
import { CartesianChart, BarGroup, useChartPressState } from "victory-native";
import { Line as SkiaLine, matchFont, vec } from "@shopify/react-native-skia";
import { useAnimatedReaction, runOnJS } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../providers/ThemeProvider";
import { Card } from "../atoms/Card";
import { Text } from "../atoms/Text";
import { Amount } from "../atoms/Amount";
import { Skeleton } from "../atoms/Skeleton";
import {
  useCashFlow,
  type CashFlowRange,
  type CashFlowPoint,
} from "../../hooks/dashboard/useCashFlow";

const RANGES: CashFlowRange[] = [3, 6, 12];

export function CashFlowCard() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { income, expenses, net, prevNet, trend, range, setRange, isLoading } = useCashFlow();
  const font = matchFont({
    fontSize: 11,
    fontFamily: "System",
    fontWeight: "400",
    fontStyle: "normal",
  });

  const change = net - prevNet;

  // Press state
  const { state: pressState, isActive: isPressActive } = useChartPressState({
    x: "" as string,
    y: { income: 0, expenses: 0 },
  });

  const [activeIndex, setActiveIndex] = useState(-1);

  useAnimatedReaction(
    () => pressState.matchedIndex.value,
    (idx, prev) => {
      if (idx !== prev) runOnJS(setActiveIndex)(idx);
    },
  );

  if (isLoading) {
    return (
      <Card style={{ padding: spacing.lg, gap: spacing.md }}>
        <Skeleton width={100} height={14} />
        <Skeleton width="100%" height={120} />
      </Card>
    );
  }

  if (income === 0 && expenses === 0 && trend.every((p) => p.income === 0 && p.expenses === 0)) {
    return (
      <Card style={{ padding: spacing.lg, gap: spacing.sm }}>
        <Text
          variant="captionSm"
          color={colors.textSecondary}
          style={{ textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          {t("dashboard.cashFlow")}
        </Text>
        <Text variant="body" color={colors.textMuted}>
          {t("dashboard.cashFlowNoData")}
        </Text>
      </Card>
    );
  }

  const activePoint: CashFlowPoint | undefined =
    isPressActive && activeIndex >= 0 && activeIndex < trend.length
      ? trend[activeIndex]
      : undefined;

  // Display values — active point or current month
  const displayIncome = activePoint ? Math.round(activePoint.income * 100) : income;
  const displayExpenses = activePoint ? Math.round(activePoint.expenses * 100) : Math.abs(expenses);
  const displayNet = activePoint
    ? Math.round((activePoint.income - activePoint.expenses) * 100)
    : net;

  return (
    <Card style={{ padding: spacing.lg, gap: spacing.sm }}>
      {/* Header row: title + range toggle */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text
          variant="captionSm"
          color={colors.textSecondary}
          style={{ textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          {t("dashboard.cashFlow")}
        </Text>
        <View style={{ flexDirection: "row", gap: 2 }}>
          {RANGES.map((r) => (
            <Pressable key={r} onPress={() => setRange(r)} hitSlop={4}>
              <AnimatedView
                animate={{
                  backgroundColor: range === r ? colors.primary : "transparent",
                  scale: range === r ? 1 : 0.95,
                }}
                transition={{ type: "timing", duration: 200, easing: "easeOut" }}
                style={{ paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 10 }}
              >
                <Text
                  variant="captionSm"
                  color={range === r ? "#fff" : colors.textMuted}
                  style={{ fontWeight: "600" }}
                >
                  {r}m
                </Text>
              </AnimatedView>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Subtitle — always rendered for stable layout */}
      {activePoint ? (
        <Text variant="captionSm" color={colors.primary} style={{ fontWeight: "600" }}>
          {activePoint.month}
        </Text>
      ) : change !== 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Amount value={change} variant="captionSm" showSign colored />
          <Text variant="captionSm" color={colors.textMuted}>
            {t("dashboard.vsLastMonth")}
          </Text>
        </View>
      ) : (
        <Text variant="captionSm" color="transparent" accessibilityElementsHidden>
          —
        </Text>
      )}

      {/* Income / Expenses summary */}
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <View style={{ gap: 1 }}>
          <Text variant="captionSm" color={colors.textMuted}>
            {t("dashboard.income")}
          </Text>
          <Amount value={displayIncome} variant="body" weight="600" color={colors.positive} />
        </View>
        <View style={{ alignItems: "flex-end", gap: 1 }}>
          <Text variant="captionSm" color={colors.textMuted}>
            {t("dashboard.expenses")}
          </Text>
          <Amount value={displayExpenses} variant="body" weight="600" color={colors.negative} />
        </View>
      </View>

      {/* Chart */}
      {trend.length > 0 && (
        <View style={{ height: 160, marginTop: spacing.sm }}>
          <CartesianChart
            data={trend}
            xKey="month"
            yKeys={["income", "expenses"]}
            chartPressState={pressState}
            domainPadding={{ left: 20, right: 20 }}
            axisOptions={{
              font,
              labelColor: colors.textMuted,
              lineColor: colors.divider,
              tickCount: { x: range, y: 5 },
              formatXLabel: (label) => label ?? "",
              formatYLabel: (val) => {
                const n = Number(val);
                if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(0)}k`;
                return n.toFixed(0);
              },
            }}
          >
            {({ points, chartBounds }) => (
              <>
                <BarGroup
                  chartBounds={chartBounds}
                  betweenGroupPadding={0.05}
                  withinGroupPadding={0}
                  roundedCorners={{ topLeft: 3, topRight: 3 }}
                >
                  <BarGroup.Bar points={points.income} color={colors.positive} />
                  <BarGroup.Bar points={points.expenses} color={colors.negative} />
                </BarGroup>
                {/* Cursor line */}
                {isPressActive &&
                  activeIndex >= 0 &&
                  activeIndex < points.income.length &&
                  points.income[activeIndex]?.y != null && (
                    <SkiaLine
                      p1={vec(points.income[activeIndex].x, chartBounds.top)}
                      p2={vec(points.income[activeIndex].x, chartBounds.bottom)}
                      color={colors.primary}
                      strokeWidth={1.5}
                      opacity={0.5}
                    />
                  )}
              </>
            )}
          </CartesianChart>
        </View>
      )}

      {/* Net row */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text variant="captionSm" color={colors.textMuted}>
          {t("dashboard.net")}
        </Text>
        <Amount value={displayNet} variant="body" weight="600" colored showSign />
      </View>
    </Card>
  );
}
