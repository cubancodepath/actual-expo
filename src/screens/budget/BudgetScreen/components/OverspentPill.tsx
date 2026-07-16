import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Chip, PressableFeedback, useThemeColor } from "heroui-native";
import { ChevronRight } from "lucide-react-native";

interface OverspentPillProps {
  /** Number of overspent categories this month (caller ensures > 0). */
  count: number;
  onPress: () => void;
}

/**
 * Neutral pill flagging overspent categories, shown at the top of the scrollable
 * budget list. A small danger Chip on the left holds the count; the whole pill is
 * tappable (scale + highlight feedback) to open cover-overspent.
 */
export function OverspentPill({ count, onPress }: OverspentPillProps) {
  const { t } = useTranslation("budget");
  const muted = useThemeColor("muted");

  return (
    <PressableFeedback animation={false} onPress={onPress}>
      <PressableFeedback.Scale>
        <Chip
          variant="secondary"
          color="default"
          size="lg"
          pointerEvents="none"
          className="w-full justify-between px-3 py-2.5"
        >
          <View className="flex-row items-center gap-2">
            <Chip
              variant="primary"
              color="danger"
              size="sm"
              className="h-5 min-w-5 justify-center rounded-full px-1.5"
            >
              <Chip.Label className="text-[11px] font-bold text-danger-foreground">
                {count}
              </Chip.Label>
            </Chip>
            <Chip.Label className="text-sm font-medium text-foreground">
              {t("overspent", { count })}
            </Chip.Label>
          </View>
          <ChevronRight size={16} color={muted} />
        </Chip>
      </PressableFeedback.Scale>
      <PressableFeedback.Highlight className="rounded-3xl" />
    </PressableFeedback>
  );
}
