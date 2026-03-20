import { View } from "react-native";
import { EaseView } from "react-native-ease";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../providers/ThemeProvider";
import { Card } from "../atoms/Card";
import { Text } from "../atoms/Text";
import { useAgeOfMoney } from "../../hooks/dashboard/useAgeOfMoney";

const GOAL_DAYS = 30;

export function AgeOfMoneyCard() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { age, previousAge } = useAgeOfMoney();

  // Empty state — not enough data to calculate
  if (age === 0) {
    return (
      <Card style={{ padding: spacing.lg, gap: spacing.sm }}>
        <Text
          variant="captionSm"
          color={colors.textSecondary}
          style={{ textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          {t("dashboard.moneyBuffer")}
        </Text>
        <Text variant="body" color={colors.textMuted}>
          {t("dashboard.moneyBufferNoData")}
        </Text>
      </Card>
    );
  }

  const change = age - previousAge;
  const progressPercent = Math.min((age / GOAL_DAYS) * 100, 100);
  const barFillColor = age >= GOAL_DAYS ? colors.positive : colors.primary;

  return (
    <Card style={{ padding: spacing.lg, gap: spacing.sm }}>
      {/* Header */}
      <Text
        variant="captionSm"
        color={colors.textSecondary}
        style={{ textTransform: "uppercase", letterSpacing: 0.5 }}
      >
        {t("dashboard.moneyBuffer")}
      </Text>

      {/* Subtitle — change vs last month */}
      {change !== 0 ? (
        <Text
          variant="captionSm"
          color={change > 0 ? colors.positive : colors.negative}
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {change > 0 ? "+" : ""}
          {change} {t("dashboard.days")} {t("dashboard.vsLastMonth")}
        </Text>
      ) : (
        <Text variant="captionSm" color="transparent" accessibilityElementsHidden>
          —
        </Text>
      )}

      {/* Big number */}
      <Text
        variant="displayLg"
        color={barFillColor}
        style={{ fontWeight: "700", fontVariant: ["tabular-nums"] }}
      >
        {age} {t("dashboard.days")}
      </Text>

      {/* Progress bar toward 30-day goal */}
      <View
        style={{ height: 20, borderRadius: 4, backgroundColor: colors.divider, overflow: "hidden" }}
      >
        <EaseView
          animate={{ scaleX: 1 }}
          initialAnimate={{ scaleX: 0 }}
          transformOrigin={{ x: 0, y: 0.5 }}
          transition={{ type: "spring", damping: 20, stiffness: 120, mass: 1 }}
          style={{
            height: 20,
            borderRadius: 4,
            backgroundColor: barFillColor,
            width: `${progressPercent}%`,
          }}
        />
      </View>

      {/* Description */}
      <Text variant="captionSm" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
        {t("dashboard.moneyBufferDescription")}
      </Text>
    </Card>
  );
}
