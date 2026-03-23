/**
 * SReadyToAssignPill — SwiftUI pill with native Action Sheet for budget actions.
 *
 * Tap the pill → action sheet with contextual actions (Assign, Hold, Auto-Assign).
 */

import { useState } from "react";
import {
  HStack,
  ConfirmationDialog,
  Button as SUIButton,
  Spacer,
  Text as SUIText,
} from "@expo/ui/swift-ui";
import {
  background,
  cornerRadius,
  padding,
  onTapGesture,
  contentShape,
  frame,
} from "@expo/ui/swift-ui/modifiers";
import { shapes } from "@expo/ui/swift-ui/modifiers";
import { ScalableText } from "../../../../modules/actual-ui";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { usePrivacyStore } from "@/stores/privacyStore";
import { formatPrivacyAware } from "@/lib/format";
import { useTranslation } from "react-i18next";

interface SReadyToAssignPillProps {
  amount: number;
  buffered: number;
  goalsEnabled: boolean;
  onMoveToBudget: () => void;
  onHold: () => void;
  onAutoAssign: () => void;
  onResetHold: () => void;
}

export function SReadyToAssignPill({
  amount,
  buffered,
  goalsEnabled,
  onMoveToBudget,
  onHold,
  onAutoAssign,
  onResetHold,
}: SReadyToAssignPillProps) {
  const { t } = useTranslation("budget");
  const { colors } = useTheme();
  usePrivacyStore();
  const [open, setOpen] = useState(false);

  const isPositive = amount > 0;
  const isNegative = amount < 0;

  const pillBg = isPositive
    ? colors.vibrantPositive
    : isNegative
      ? colors.vibrantNegative
      : colors.cardBackground;

  const textColor = isPositive
    ? colors.vibrantPillText
    : isNegative
      ? colors.vibrantPillTextNegative
      : colors.textMuted;

  const label = isPositive
    ? t("readyToAssign")
    : isNegative
      ? t("overassigned")
      : t("fullyAssigned");

  function action(fn: () => void) {
    return () => {
      setOpen(false);
      fn();
    };
  }

  return (
    <ConfirmationDialog
      title={formatPrivacyAware(amount)}
      isPresented={open}
      onIsPresentedChange={setOpen}
      titleVisibility="visible"
    >
      <ConfirmationDialog.Message>
        <SUIText>{label}</SUIText>
      </ConfirmationDialog.Message>
      <ConfirmationDialog.Trigger>
        <HStack
          modifiers={[
            padding({ horizontal: 16, vertical: 11 }),
            background(pillBg),
            cornerRadius(100),
            frame({ minHeight: 44 }),
            contentShape(shapes.capsule()),
            onTapGesture(() => setOpen(true)),
          ]}
        >
          <ScalableText
            text={formatPrivacyAware(amount)}
            fontSize={17}
            fontWeight="bold"
            color={textColor}
            maxLines={1}
            minScale={0.5}
            monoDigits
            letterSpacing={-0.5}
          />
          <Spacer />
          <ScalableText
            text={label}
            fontSize={12}
            fontWeight="medium"
            color={textColor}
            maxLines={1}
            minScale={0.7}
          />
        </HStack>
      </ConfirmationDialog.Trigger>
      <ConfirmationDialog.Actions>
        {/* Assign / Fix — always shown */}
        <SUIButton
          label={isNegative ? t("fixOverbudgeting") : t("assignToCategories")}
          systemImage={isNegative ? "arrow.uturn.backward" : "wallet.bifold"}
          onPress={action(onMoveToBudget)}
        />

        {/* Hold — when not negative */}
        {!isNegative && (
          <SUIButton
            label={t("holdForNextMonth")}
            systemImage="calendar.badge.clock"
            onPress={action(onHold)}
          />
        )}

        {/* Auto-Assign — when goals enabled */}
        {goalsEnabled && (
          <SUIButton
            label={t("autoAssign")}
            systemImage="sparkles"
            onPress={action(onAutoAssign)}
          />
        )}

        {/* Reset Hold — when there's a hold */}
        {buffered > 0 && (
          <SUIButton
            label={t("resetHold")}
            systemImage="trash"
            role="destructive"
            onPress={action(onResetHold)}
          />
        )}
      </ConfirmationDialog.Actions>
    </ConfirmationDialog>
  );
}
