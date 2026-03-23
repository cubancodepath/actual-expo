import { View } from "react-native";
import { AnimatedView } from "../atoms/AnimatedView";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../providers/ThemeProvider";
import { Card } from "../atoms/Card";
import { Text } from "../atoms/Text";
import { Amount } from "../atoms/Amount";
import { Skeleton } from "../atoms/Skeleton";
import {
  useSpendingByCategory,
  type SpendingCategory,
} from "../../hooks/dashboard/useSpendingByCategory";

export function SpendingByCategoryCard() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { categories, total, isLoading } = useSpendingByCategory();

  if (isLoading) {
    return (
      <Card style={{ padding: spacing.lg, gap: spacing.md }}>
        <Skeleton width={120} height={14} />
        <Skeleton width="100%" height={12} borderRadius={6} />
        <Skeleton width="100%" height={60} />
      </Card>
    );
  }

  if (categories.length === 0) {
    return (
      <Card style={{ padding: spacing.lg, gap: spacing.sm }}>
        <Text
          variant="captionSm"
          color={colors.textSecondary}
          style={{ textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          {t("dashboard.topSpending")}
        </Text>
        <Text variant="body" color={colors.textMuted}>
          {t("dashboard.noSpending")}
        </Text>
      </Card>
    );
  }

  return (
    <Card style={{ padding: spacing.lg, gap: spacing.md }}>
      {/* Header: title + total */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text
          variant="captionSm"
          color={colors.textSecondary}
          style={{ textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          {t("dashboard.topSpending")}
        </Text>
        <Amount
          value={total}
          variant="captionSm"
          weight="600"
          colored={false}
          color={colors.textPrimary}
        />
      </View>

      {/* Stacked horizontal bar */}
      <StackedBar categories={categories} colors={colors} />

      {/* Category list */}
      <View style={{ gap: spacing.sm }}>
        {categories.map((cat, i) => (
          <AnimatedView
            key={cat.id}
            initialAnimate={{ opacity: 0, translateY: 8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 300, easing: [0.25, 0.1, 0.25, 1] }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: cat.color,
                }}
              />
              <Text variant="captionSm" color={colors.textPrimary} style={{ flex: 1 }}>
                {cat.name}
              </Text>
              <Amount
                value={cat.amount}
                variant="captionSm"
                colored={false}
                color={colors.textPrimary}
              />
              <Text
                variant="captionSm"
                color={colors.textMuted}
                style={{ width: 36, textAlign: "right", fontVariant: ["tabular-nums"] }}
              >
                {cat.percent}%
              </Text>
            </View>
          </AnimatedView>
        ))}
      </View>
    </Card>
  );
}

/** iOS-style stacked horizontal bar */
function StackedBar({
  categories,
  colors,
}: {
  categories: SpendingCategory[];
  colors: { divider: string };
}) {
  return (
    <View
      style={{
        height: 20,
        borderRadius: 4,
        backgroundColor: colors.divider,
        flexDirection: "row",
        overflow: "hidden",
      }}
    >
      {categories.map((cat) => (
        <AnimatedView
          key={cat.id}
          initialAnimate={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transformOrigin={{ x: 0, y: 0.5 }}
          transition={{ type: "spring", damping: 20, stiffness: 120, mass: 1 }}
          style={{
            flex: cat.percent,
            backgroundColor: cat.color,
          }}
        />
      ))}
    </View>
  );
}
