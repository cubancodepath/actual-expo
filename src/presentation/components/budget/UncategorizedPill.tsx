import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "../atoms/Text";
import { Button } from "../atoms/Button";
import { InfoPill } from "../atoms/InfoPill";

interface UncategorizedPillProps {
  count: number;
  onPress: () => void;
}

export function UncategorizedPill({ count, onPress }: UncategorizedPillProps) {
  const { t } = useTranslation("budget");
  const { colors } = useTheme();

  const label = t("uncategorizedTransactions", { count });

  return (
    <InfoPill
      backgroundColor={colors.cardBackground}
      onPress={onPress}
      accessibilityLabel={`${count} ${label}. Tap to view.`}
      style={{ marginHorizontal: 0 }}
      left={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              backgroundColor: colors.vibrantNegative,
              borderRadius: 100,
              minWidth: 20,
              height: 20,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 3,
            }}
          >
            <Text
              variant="caption"
              color={colors.vibrantPillTextNegative}
              style={{ fontWeight: "700", fontVariant: ["tabular-nums"] }}
            >
              {count}
            </Text>
          </View>
          <Text variant="caption" color={colors.textPrimary} style={{ fontWeight: "400" }}>
            {label}
          </Text>
        </View>
      }
      right={
        <Button title={t("reviewAction")} buttonStyle="bordered" size="sm" onPress={onPress} />
      }
    />
  );
}
