import { View } from "react-native";
import { Icon } from "@/design-system/atoms/Icon";
import { useTheme } from "@/design-system/providers/ThemeProvider";
import { palette } from "@/design-system/tokens/colors";
import { Text } from "@/design-system/atoms/Text";
import { InfoPill } from "@/design-system/atoms/InfoPill";

interface UnclearedPillProps {
  count: number;
  /** Filter label shown between count badge and "transaction(s)". Defaults to "uncleared". */
  label?: string;
  /** Visual style. "subtle" = muted card, "danger" = error colors. Defaults to "subtle". */
  variant?: "subtle" | "danger";
  onPress: () => void;
}

export function UnclearedPill({
  count,
  label: filterLabel = "uncleared",
  variant = "subtle",
  onPress,
}: UnclearedPillProps) {
  const { colors, spacing } = useTheme();

  const txnLabel = count === 1 ? "transaction" : "transactions";
  const isDanger = variant === "danger";
  const accent = colors.negative;
  const textColor = isDanger ? accent : colors.textSecondary;
  const badgeBg = isDanger ? colors.negativeFill : colors.primary;
  const chevronColor = isDanger ? accent : colors.textMuted;
  const pillBg = isDanger ? colors.negativeSubtle : colors.primarySubtle;

  return (
    <InfoPill
      backgroundColor={pillBg}
      onPress={onPress}
      accessibilityLabel={`Show ${count} ${filterLabel} ${txnLabel}. Tap to view.`}
      style={{ marginBottom: spacing.sm }}
      left={
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
          <Text variant="bodySm" color={textColor} style={{ fontWeight: "500" }}>
            Show
          </Text>
          <View
            style={{
              backgroundColor: badgeBg,
              borderRadius: 4,
              minWidth: 16,
              height: 16,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 3,
            }}
          >
            <Text
              variant="captionSm"
              color={palette.white}
              style={{ fontWeight: "700", fontSize: 10, lineHeight: 13 }}
            >
              {count}
            </Text>
          </View>
          <Text variant="bodySm" color={textColor} style={{ fontWeight: "500" }}>
            {filterLabel} {txnLabel}
          </Text>
        </View>
      }
      right={<Icon name="chevronForward" size={14} color={chevronColor} style={{ opacity: 0.6 }} />}
    />
  );
}
