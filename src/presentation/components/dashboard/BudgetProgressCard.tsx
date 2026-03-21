import { View } from "react-native";
import { AnimatedView } from "../atoms/AnimatedView";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../providers/ThemeProvider";
import { Card } from "../atoms/Card";
import { Text } from "../atoms/Text";
import { Amount } from "../atoms/Amount";
import { useBudgetProgress } from "../../hooks/dashboard/useBudgetProgress";

export function BudgetProgressCard() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { totalBudgeted, totalSpent, toBudget, progress, progressRaw } = useBudgetProgress();

  const isOverspent = progressRaw > 1;
  const pct = Math.round(progressRaw * 100);
  const barColor = isOverspent ? colors.negative : colors.primary;

  return (
    <Card style={{ padding: spacing.lg, gap: spacing.md }}>
      {/* Header */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text
          variant="captionSm"
          color={colors.textSecondary}
          style={{ textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          {t("dashboard.budget")}
        </Text>
        <Text
          variant="captionSm"
          color={barColor}
          style={{ fontWeight: "600", fontVariant: ["tabular-nums"] }}
        >
          {pct}% {t("dashboard.spent")}
        </Text>
      </View>

      {/* Progress bar */}
      <View
        style={{ height: 20, borderRadius: 4, backgroundColor: colors.divider, overflow: "hidden" }}
      >
        <AnimatedView
          initialAnimate={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transformOrigin={{ x: 0, y: 0.5 }}
          transition={{ type: "spring", damping: 20, stiffness: 120, mass: 1 }}
          style={{
            height: 20,
            borderRadius: 4,
            backgroundColor: barColor,
            width: `${Math.min(pct, 100)}%`,
          }}
        />
      </View>

      {/* Details */}
      <View style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text variant="captionSm" color={colors.textMuted}>
            {t("dashboard.budgeted")}
          </Text>
          <Amount
            value={Math.abs(totalBudgeted)}
            variant="captionSm"
            colored={false}
            color={colors.textPrimary}
          />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text variant="captionSm" color={colors.textMuted}>
            {t("dashboard.totalSpent")}
          </Text>
          <Amount
            value={Math.abs(totalSpent)}
            variant="captionSm"
            colored={false}
            color={isOverspent ? colors.negative : colors.textPrimary}
          />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text variant="captionSm" color={colors.textMuted} style={{ fontWeight: "600" }}>
            {t("dashboard.toBudget")}
          </Text>
          <Amount value={toBudget} variant="captionSm" weight="600" colored />
        </View>
      </View>
    </Card>
  );
}
