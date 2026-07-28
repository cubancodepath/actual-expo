import { useCallback, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  Button,
  cn,
  Popover,
  PressableFeedback,
  Separator,
  Spinner,
  Typography,
  useThemeColor,
} from "heroui-native";
import { Zap } from "lucide-react-native";
import type { GoalAllocation } from "@/core/server/budget/goal-template";
import { Money } from "@/ui/Money";
import { useAutoAssign, type ModeSummary } from "../hooks/useAutoAssign";
import type { PendingEdits } from "../types";

/**
 * "Auto-assign": a full-width tertiary button that opens a downward popover of
 * goal-driven assign modes, each showing the net money it would move. All the
 * work lives in {@link useAutoAssign}; this only renders and drives open state.
 */
export function AutoAssignButton({
  month,
  pending,
  committedFor,
  onApply,
}: {
  month: string;
  pending: PendingEdits;
  /** The live committed budgeted amount for a category, in cents. */
  committedFor: (categoryId: string) => number;
  /** Stage the chosen mode's allocations as pending edits. */
  onApply: (allocations: GoalAllocation[]) => void;
}) {
  const { t } = useTranslation("budget");
  const insets = useSafeAreaInsets();
  const accent = useThemeColor("accent");

  const [open, setOpen] = useState(false);
  const { computed, loading, recompute, choose } = useAutoAssign({
    month,
    pending,
    committedFor,
    onApply,
  });

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) void recompute();
    },
    [recompute],
  );

  const pick = useCallback(
    (summary: ModeSummary) => {
      setOpen(false);
      choose(summary);
    },
    [choose],
  );

  return (
    <Popover isOpen={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <Button variant="tertiary" className="w-full">
          <Zap size={18} color={accent} />
          <Button.Label>{t("autoAssign.action")}</Button.Label>
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Overlay />
        <Popover.Content
          presentation="popover"
          placement="bottom"
          align="center"
          width="trigger"
          offset={insets.top + 16}
          className="border border-border p-1"
        >
          <Popover.Arrow />
          {loading || !computed ? (
            <View className="items-center py-6">
              <Spinner />
            </View>
          ) : !computed.hasGoals ? (
            <View className="px-4 py-5">
              <Typography className="text-center text-sm text-muted">
                {t("autoAssign.noGoals")}
              </Typography>
            </View>
          ) : (
            <>
              <AutoAssignOption
                title={t("autoAssign.fill")}
                description={t("autoAssign.fillHint")}
                summary={computed.fill}
                onPress={() => pick(computed.fill)}
              />
              <Separator className="mx-2" />
              <AutoAssignOption
                title={t("autoAssign.recalculate")}
                description={t("autoAssign.recalculateHint")}
                summary={computed.recalc}
                onPress={() => pick(computed.recalc)}
              />
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
}

function AutoAssignOption({
  title,
  description,
  summary,
  onPress,
}: {
  title: string;
  description: string;
  summary: ModeSummary;
  onPress: () => void;
}) {
  const { t } = useTranslation("budget");
  const disabled = summary.changed === 0;
  return (
    <PressableFeedback
      isDisabled={disabled}
      onPress={disabled ? undefined : onPress}
      className="flex-row items-center gap-3 rounded-lg px-3 py-2.5"
    >
      <View className="flex-1">
        <Typography
          className={cn("text-sm font-medium", disabled ? "text-muted" : "text-foreground")}
        >
          {title}
        </Typography>
        <Typography className="text-xs text-muted">{description}</Typography>
      </View>
      {disabled ? (
        <Typography className="text-xs text-muted">{t("autoAssign.upToDate")}</Typography>
      ) : (
        <View className="flex-row items-center">
          {summary.delta > 0 ? (
            <Typography className="text-sm font-semibold text-positive">+</Typography>
          ) : null}
          <Money cents={summary.delta} tone="auto" className="text-sm font-semibold" />
        </View>
      )}
    </PressableFeedback>
  );
}
