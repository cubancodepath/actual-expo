import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "../atoms/Text";
import { Icon } from "../atoms/Icon";
import { InfoPill } from "../atoms/InfoPill";

interface OverspentPillProps {
  count: number;
  onPress: () => void;
}

export function OverspentPill({ count, onPress }: OverspentPillProps) {
  const { t } = useTranslation("budget");
  const { colors } = useTheme();

  const label = t("overspent", { count });

  return (
    <InfoPill
      backgroundColor={colors.cardBackground}
      onPress={onPress}
      accessibilityLabel={`${label}. Tap to cover.`}
      style={{ marginHorizontal: 0 }}
      left={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              backgroundColor: colors.vibrantNegativeBadge,
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
        <Icon name="chevronForward" size={14} color={colors.textMuted} style={{ opacity: 0.6 }} />
      }
    />
  );
}
