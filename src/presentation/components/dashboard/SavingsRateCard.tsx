import { useState, useMemo } from "react";
import { View, Pressable } from "react-native";
import { AnimatedView } from "../atoms/AnimatedView";
import { CartesianChart, Bar, useChartPressState } from "victory-native";
import { Line as SkiaLine, matchFont, vec } from "@shopify/react-native-skia";
import { useAnimatedReaction, runOnJS } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../providers/ThemeProvider";
import { Card } from "../atoms/Card";
import { Text } from "../atoms/Text";
import { Skeleton } from "../atoms/Skeleton";
import {
  useSavingsRate,
  type SavingsRateRange,
  type SavingsRatePoint,
} from "../../hooks/dashboard/useSavingsRate";

const RANGES: SavingsRateRange[] = [3, 6, 12];

export function SavingsRateCard() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { currentRate, previousRate, trend, range, setRange } = useSavingsRate();
  const font = matchFont({
    fontSize: 11,
    fontFamily: "System",
    fontWeight: "400",
    fontStyle: "normal",
  });

  const change = currentRate - previousRate;

  // Press state
  const { state: pressState, isActive: isPressActive } = useChartPressState({
    x: "" as string,
    y: { saved: 0, overspent: 0 },
  });

  const [activeIndex, setActiveIndex] = useState(-1);

  useAnimatedReaction(
    () => pressState.matchedIndex.value,
    (idx, prev) => {
      if (idx !== prev) runOnJS(setActiveIndex)(idx);
    },
  );

  const activePoint: SavingsRatePoint | undefined =
    isPressActive && activeIndex >= 0 && activeIndex < trend.length
      ? trend[activeIndex]
      : undefined;

  const displayRate = activePoint ? activePoint.rate : currentRate;
  const rateColor = displayRate >= 0 ? colors.vibrantPositive : colors.vibrantNegative;

  const barColor = isPressActive
    ? colors.primary
    : currentRate >= 0
      ? colors.vibrantPositive
      : colors.vibrantNegative;

  // Empty state — no income data (after all hooks)
  if (currentRate === 0 && previousRate === 0 && trend.every((p) => p.rate === 0)) {
    return (
      <Card style={{ padding: spacing.lg, gap: spacing.sm }}>
        <Text
          variant="captionSm"
          color={colors.textSecondary}
          style={{ textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          {t("dashboard.savingsRate")}
        </Text>
        <Text variant="body" color={colors.textMuted}>
          {t("dashboard.savingsRateNoData")}
        </Text>
      </Card>
    );
  }

  return (
    <Card style={{ padding: spacing.lg, gap: spacing.sm }}>
      {/* Header */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text
          variant="captionSm"
          color={colors.textSecondary}
          style={{ textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          {t("dashboard.savingsRate")}
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

      {/* Subtitle */}
      {activePoint ? (
        <Text variant="captionSm" color={colors.primary} style={{ fontWeight: "600" }}>
          {activePoint.month}
        </Text>
      ) : change !== 0 ? (
        <Text
          variant="captionSm"
          color={change > 0 ? colors.vibrantPositive : colors.vibrantNegative}
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {change > 0 ? "+" : ""}
          {change}% {t("dashboard.vsLastMonth")}
        </Text>
      ) : (
        <Text variant="captionSm" color="transparent" accessibilityElementsHidden>
          —
        </Text>
      )}

      {/* Big rate number */}
      <Text
        variant="displayLg"
        color={rateColor}
        style={{ fontWeight: "700", fontVariant: ["tabular-nums"] }}
      >
        {displayRate}%
      </Text>

      {/* Progress bar — shows absolute rate, colored by sign */}
      <View
        style={{ height: 20, borderRadius: 4, backgroundColor: colors.divider, overflow: "hidden" }}
      >
        <AnimatedView
          animate={{ scaleX: 1 }}
          initialAnimate={{ scaleX: 0 }}
          transformOrigin={{ x: 0, y: 0.5 }}
          transition={{ type: "spring", damping: 20, stiffness: 120, mass: 1 }}
          style={{
            height: 20,
            borderRadius: 4,
            backgroundColor: rateColor,
            width: `${Math.min(Math.abs(displayRate), 100)}%`,
          }}
        />
      </View>

      {/* Trend chart */}
      {trend.length > 0 && (
        <View style={{ height: 120, marginTop: spacing.xs }}>
          <CartesianChart
            data={trend}
            xKey="month"
            yKeys={["saved", "overspent"]}
            domain={{
              y: [
                Math.min(0, ...trend.map((t) => t.rate)),
                Math.max(100, ...trend.map((t) => t.rate)),
              ],
            }}
            chartPressState={pressState}
            domainPadding={{ left: 20, right: 20 }}
            axisOptions={{
              font,
              labelColor: colors.textMuted,
              lineColor: colors.divider,
              tickCount: { x: range, y: 4 },
              formatXLabel: (label) => label ?? "",
              formatYLabel: (val) => `${Number(val)}%`,
            }}
          >
            {({ points, chartBounds }) => (
              <>
                {/* Positive bars (saved) */}
                <Bar
                  points={points.saved}
                  chartBounds={chartBounds}
                  color={isPressActive ? colors.primary : colors.vibrantPositive}
                  roundedCorners={{ topLeft: 4, topRight: 4 }}
                  barWidth={range <= 6 ? 16 : 8}
                />
                {/* Negative bars (overspent) */}
                <Bar
                  points={points.overspent}
                  chartBounds={chartBounds}
                  color={isPressActive ? colors.primary : colors.vibrantNegative}
                  roundedCorners={{ topLeft: 4, topRight: 4 }}
                  barWidth={range <= 6 ? 16 : 8}
                />
                {/* Cursor line */}
                {isPressActive && activeIndex >= 0 && activeIndex < points.saved.length && (
                  <SkiaLine
                    p1={vec(points.saved[activeIndex].x, chartBounds.top)}
                    p2={vec(points.saved[activeIndex].x, chartBounds.bottom)}
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

      {/* Description */}
      <Text variant="captionSm" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
        {t("dashboard.savingsRateDescription")}
      </Text>
    </Card>
  );
}
