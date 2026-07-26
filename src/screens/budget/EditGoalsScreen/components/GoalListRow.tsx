import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ListGroup, Typography, useThemeColor } from "heroui-native";
import { ChevronRight, TriangleAlert } from "lucide-react-native";
import { describeTemplate, type AutomationEntry } from "@/screens/budget/goals";
import type { AutomationErrorKind } from "@/screens/budget/goals";
import { isSilentError } from "../messages";
import { displayTypeMeta } from "../displayTypeMeta";

/**
 * One automation in the category's list: its type, a plain-language summary of
 * what it does, and a warning marker when it won't budget as written.
 */
export function GoalListRow({
  entry,
  error,
  scheduleName,
  onPress,
}: {
  entry: AutomationEntry;
  error?: AutomationErrorKind;
  /** Resolved name for schedule automations — the template only stores a ref. */
  scheduleName?: string;
  onPress: () => void;
}) {
  const { t, i18n } = useTranslation("budget");
  const foreground = useThemeColor("foreground");
  const muted = useThemeColor("muted");
  const danger = useThemeColor("danger");

  const meta = displayTypeMeta[entry.displayType];
  const Icon = meta.icon;
  // Silent errors (a zero amount) gray out saving without decorating the row.
  const flagged = error != null && !isSilentError(error);

  const summary =
    entry.displayType === "schedule" && scheduleName
      ? t("goals.summary.linkedToScheduleNamed", { name: scheduleName })
      : describeTemplate(entry.template, t, i18n.language);

  return (
    <ListGroup.Item onPress={onPress}>
      <ListGroup.ItemPrefix>
        <View className="w-6 items-center justify-center">
          <Icon size={18} color={flagged ? danger : foreground} />
        </View>
      </ListGroup.ItemPrefix>
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle>{t(meta.labelKey)}</ListGroup.ItemTitle>
        <Typography className="text-sm text-muted" numberOfLines={2}>
          {summary}
        </Typography>
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix>
        <View className="flex-row items-center gap-1">
          {flagged ? <TriangleAlert size={16} color={danger} /> : null}
          <ChevronRight size={18} color={muted} />
        </View>
      </ListGroup.ItemSuffix>
    </ListGroup.Item>
  );
}
