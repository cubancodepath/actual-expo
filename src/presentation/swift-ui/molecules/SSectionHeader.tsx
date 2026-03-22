/**
 * SSectionHeader — Budget group section header.
 *
 * Shows group name + Budgeted column + Available column.
 * Reads spreadsheet values reactively via hooks.
 */

import { HStack, VStack, Text as SUIText, Spacer } from "@expo/ui/swift-ui";
import {
  foregroundStyle,
  monospacedDigit,
  lineLimit,
  frame,
  padding,
} from "@expo/ui/swift-ui/modifiers";
import { SText } from "../atoms/SText";
import { SAmount } from "../atoms/SAmount";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { usePrivacyStore } from "@/stores/privacyStore";
import { useSheetValueNumber } from "@/presentation/hooks/useSheetValue";
import { envelopeBudget } from "@/spreadsheet/bindings";
import { useTranslation } from "react-i18next";

// Column widths — minimumScaleFactor handles overflow
const COL_BUDGETED = 90;
const COL_AVAILABLE = 95;

interface SSectionHeaderProps {
  group: { id: string; name: string; is_income: boolean };
  sheet: string;
  showBar?: boolean;
  anyEditing?: boolean;
}

export function SSectionHeader({
  group,
  sheet,
  showBar = false,
  anyEditing = false,
}: SSectionHeaderProps) {
  const { colors } = useTheme();
  const { t } = useTranslation("budget");
  usePrivacyStore();

  const budgeted = useSheetValueNumber(sheet, envelopeBudget.groupBudgeted(group.id));
  const spent = useSheetValueNumber(sheet, envelopeBudget.groupSpent(group.id));
  const balance = useSheetValueNumber(sheet, envelopeBudget.groupBalance(group.id));
  const balanceValue = group.is_income ? spent : balance;

  const balanceColor = group.is_income
    ? colors.vibrantPositive
    : balance < 0
      ? colors.vibrantNegative
      : balance > 0
        ? colors.vibrantPositive
        : colors.textMuted;

  return (
    <HStack alignment="center" spacing={8}>
      <SText variant="bodySm" color={colors.textSecondary} lines={1}>
        {group.name}
      </SText>
      <Spacer />
      {(!showBar || anyEditing) && !group.is_income && (
        <VStack
          alignment="trailing"
          spacing={2}
          modifiers={[frame({ width: COL_BUDGETED, alignment: "trailing" })]}
        >
          <SText variant="captionSm" color={colors.textMuted}>
            {t("columnBudgeted")}
          </SText>
          <SAmount
            value={budgeted}
            variant="caption"
            color={colors.textPrimary}
            weight="semibold"
            letterSpacing={-0.5}
            lines={1}
          />
        </VStack>
      )}
      <VStack
        alignment="trailing"
        spacing={2}
        modifiers={[frame({ width: COL_AVAILABLE, alignment: "trailing" })]}
      >
        <SText variant="captionSm" color={colors.textMuted}>
          {t("columnAvailable")}
        </SText>
        <SAmount
          value={balanceValue}
          color={colors.textPrimary}
          variant="caption"
          weight="semibold"
          letterSpacing={-0.5}
          lines={1}
        />
      </VStack>
    </HStack>
  );
}
