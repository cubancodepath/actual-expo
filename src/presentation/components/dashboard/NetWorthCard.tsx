import { useState, useMemo } from "react";
import { View, Pressable } from "react-native";
import { AnimatedView } from "../atoms/AnimatedView";
import { CartesianChart, Area, Line, useChartPressState } from "victory-native";
import {
  LinearGradient,
  vec,
  Circle,
  Line as SkiaLine,
  matchFont,
} from "@shopify/react-native-skia";
import { useAnimatedReaction, runOnJS } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../providers/ThemeProvider";
import { Card } from "../atoms/Card";
import { Text } from "../atoms/Text";
import { Amount } from "../atoms/Amount";
import { Skeleton } from "../atoms/Skeleton";
import {
  useNetWorth,
  type NetWorthRange,
  type TrendPoint,
} from "../../hooks/dashboard/useNetWorth";

const RANGES: NetWorthRange[] = [3, 6, 12];

export function NetWorthCard() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { total, previousTotal, assets, debt, trend, range, setRange, isLoading } = useNetWorth();
  const font = matchFont({
    fontSize: 11,
    fontFamily: "System",
    fontWeight: "400",
    fontStyle: "normal",
  });

  const change = total - previousTotal;

  // Press state for tooltip interaction
  const { state: pressState, isActive: isPressActive } = useChartPressState({
    x: "" as string,
    y: { value: 0 },
  });

  const [activeIndex, setActiveIndex] = useState(-1);

  useAnimatedReaction(
    () => pressState.matchedIndex.value,
    (idx, prev) => {
      if (idx !== prev) runOnJS(setActiveIndex)(idx);
    },
  );

  // Determine chart colors and Y domain based on data crossing zero
  const { lineColor, hasPositive, hasNegative, yDomain } = useMemo(() => {
    const values = trend.map((t) => t.value);
    const dataMax = Math.max(...values);
    const dataMin = Math.min(...values);
    const pos = dataMax > 0;
    const neg = dataMin < 0;
    const lc = pos && neg ? colors.primary : pos ? colors.positive : colors.negative;
    // Always include 0 in Y domain so the area fills between zero and the line
    const yMin = Math.min(dataMin, 0);
    const yMax = Math.max(dataMax, 0);
    return {
      lineColor: lc,
      hasPositive: pos,
      hasNegative: neg,
      yDomain: [yMin, yMax] as [number, number],
    };
  }, [trend, colors]);

  if (isLoading) {
    return (
      <Card style={{ padding: spacing.lg, gap: spacing.md }}>
        <Skeleton width={100} height={14} />
        <Skeleton width={160} height={28} />
        <Skeleton width="100%" height={120} />
      </Card>
    );
  }

  if (total === 0 && assets === 0 && debt === 0 && trend.every((p) => p.value === 0)) {
    return (
      <Card style={{ padding: spacing.lg, gap: spacing.sm }}>
        <Text
          variant="captionSm"
          color={colors.textSecondary}
          style={{ textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          {t("dashboard.netWorth")}
        </Text>
        <Text variant="body" color={colors.textMuted}>
          {t("dashboard.netWorthNoData")}
        </Text>
      </Card>
    );
  }

  const activePoint: TrendPoint | undefined =
    isPressActive && activeIndex >= 0 && activeIndex < trend.length
      ? trend[activeIndex]
      : undefined;

  return (
    <Card style={{ padding: spacing.lg, gap: spacing.sm }}>
      {/* Header row: title + range toggle */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text
          variant="captionSm"
          color={colors.textSecondary}
          style={{ textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          {t("dashboard.netWorth")}
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

      {/* Subtitle line — always rendered to prevent layout shift */}
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

      {/* Main amount */}
      <Amount
        value={activePoint ? Math.round(activePoint.value * 100) : total}
        variant="displayLg"
        weight="700"
        colored={false}
        color={colors.textPrimary}
      />

      {/* Assets / Debt row */}
      {!activePoint && (assets !== 0 || debt !== 0) && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
          <View style={{ gap: 1 }}>
            <Text variant="captionSm" color={colors.textMuted}>
              {t("dashboard.assets")}
            </Text>
            <Amount value={assets} variant="captionSm" weight="600" color={colors.positive} />
          </View>
          <View style={{ alignItems: "flex-end", gap: 1 }}>
            <Text variant="captionSm" color={colors.textMuted}>
              {t("dashboard.debt")}
            </Text>
            <Amount
              value={Math.abs(debt)}
              variant="captionSm"
              weight="600"
              color={colors.negative}
            />
          </View>
        </View>
      )}

      {/* Chart */}
      {trend.length > 0 && (
        <View style={{ height: 160, marginTop: spacing.sm }}>
          <CartesianChart
            data={trend}
            xKey="month"
            yKeys={["value"]}
            domain={{ y: yDomain }}
            chartPressState={pressState}
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
            {({ points, chartBounds, yScale }) => {
              // Use yScale to get exact pixel position of zero
              const zeroY = yScale(0);

              // When pressing, switch everything to primary color
              const activeColor = isPressActive ? colors.primary : lineColor;

              // Gradient offset: where zero sits between chart top and bottom (0=top, 1=bottom)
              const chartHeight = chartBounds.bottom - chartBounds.top;
              const off =
                hasNegative && hasPositive
                  ? (zeroY - chartBounds.top) / chartHeight
                  : hasNegative
                    ? 0
                    : 1;

              // Gradient colors — switch to primary when pressing
              const baseColor = isPressActive ? colors.primary : null;
              const gradientColors = baseColor
                ? [`${baseColor}40`, `${baseColor}08`]
                : hasNegative && hasPositive
                  ? [
                      `${colors.positive}40`,
                      `${colors.positive}08`,
                      `${colors.negative}08`,
                      `${colors.negative}40`,
                    ]
                  : hasNegative
                    ? [`${colors.negative}08`, `${colors.negative}40`]
                    : [`${colors.positive}40`, `${colors.positive}08`];

              const gradientPositions =
                !isPressActive && hasNegative && hasPositive ? [0, off, off, 1] : undefined;

              return (
                <>
                  <Area points={points.value} y0={zeroY} curveType="monotoneX">
                    <LinearGradient
                      start={vec(0, chartBounds.top)}
                      end={vec(0, chartBounds.bottom)}
                      colors={gradientColors}
                      positions={gradientPositions}
                    />
                  </Area>
                  <Line
                    points={points.value}
                    curveType="monotoneX"
                    color={activeColor}
                    strokeWidth={2}
                  />
                  {/* Cursor line when pressing */}
                  {isPressActive &&
                    activeIndex >= 0 &&
                    activeIndex < points.value.length &&
                    points.value[activeIndex]?.y != null && (
                      <SkiaLine
                        p1={vec(points.value[activeIndex].x, chartBounds.top)}
                        p2={vec(points.value[activeIndex].x, chartBounds.bottom)}
                        color={colors.primary}
                        strokeWidth={1.5}
                        opacity={0.5}
                      />
                    )}
                  {/* Data point dots */}
                  {points.value.map((p, i) =>
                    p.y != null ? (
                      <Circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={isPressActive && activeIndex === i ? 4.5 : 2.5}
                        color={activeColor}
                      />
                    ) : null,
                  )}
                </>
              );
            }}
          </CartesianChart>
        </View>
      )}
    </Card>
  );
}
