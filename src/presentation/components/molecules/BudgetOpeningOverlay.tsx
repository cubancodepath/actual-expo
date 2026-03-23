import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "../atoms/Text";

type BudgetOpenPhase = "downloading" | "opening";

interface BudgetOpeningOverlayProps {
  visible: boolean;
  phase?: BudgetOpenPhase;
  budgetName?: string | null;
}

export function BudgetOpeningOverlay({
  visible,
  phase = "opening",
  budgetName,
}: BudgetOpeningOverlayProps) {
  const { colors, spacing } = useTheme();
  const { t } = useTranslation();

  if (!visible) return null;

  const label = phase === "downloading" ? t("budget.downloading") : t("budget.opening");

  return (
    <View style={styles.scrim} pointerEvents="box-only">
      <View
        style={[styles.hudCard, { backgroundColor: colors.cardBackground, padding: spacing.xl }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text
          variant="bodyLg"
          color={colors.textPrimary}
          style={{ marginTop: spacing.md, textAlign: "center", fontWeight: "600" }}
        >
          {label}
        </Text>
        {budgetName && (
          <Text
            variant="bodySm"
            color={colors.textMuted}
            style={{ marginTop: spacing.xs, textAlign: "center" }}
          >
            {budgetName}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  hudCard: {
    borderRadius: 16,
    alignItems: "center",
    minWidth: 200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
});
