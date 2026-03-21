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
import { sFont } from "../tokens";
import { SText } from "../atoms/SText";
import { SAmount } from "../atoms/SAmount";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { usePrivacyStore } from "@/stores/privacyStore";
import { useSheetValueNumber } from "@/presentation/hooks/useSheetValue";
import { envelopeBudget } from "@/spreadsheet/bindings";
import { useSyncedPref } from "@/presentation/hooks/useSyncedPref";
import { useTranslation } from "react-i18next";

// Column widths — wider symbols (AED, USD) need smaller font
const COL_BUDGETED_SYM = 85;
const COL_AVAILABLE_SYM = 90;
const COL_BUDGETED_PLAIN = 100;
const COL_AVAILABLE_PLAIN = 105;

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
  const [currencyCode] = useSyncedPref("defaultCurrencyCode");
  const hasSym = !!currencyCode;
  const amountFontSize = hasSym ? 10 : 12;
  const COL_BUDGETED = hasSym ? COL_BUDGETED_SYM : COL_BUDGETED_PLAIN;
  const COL_AVAILABLE = hasSym ? COL_AVAILABLE_SYM : COL_AVAILABLE_PLAIN;

  const budgeted = useSheetValueNumber(sheet, envelopeBudget.groupBudgeted(group.id));
  const spent = useSheetValueNumber(sheet, envelopeBudget.groupSpent(group.id));
  const balance = useSheetValueNumber(sheet, envelopeBudget.groupBalance(group.id));
  const balanceValue = group.is_income ? spent : balance;

  const balanceColor = group.is_income
    ? colors.positive
    : balance < 0
      ? colors.negative
      : balance > 0
        ? colors.positive
        : colors.textMuted;

  return (
    <HStack alignment="bottom">
      <SText variant="bodySm" color={colors.textSecondary} lines={1}>
        {group.name}
      </SText>
      <Spacer />
      {(!showBar || anyEditing) && !group.is_income && (
        <VStack
          alignment="trailing"
          spacing={2}
          modifiers={[
            frame({ width: COL_BUDGETED, alignment: "trailing" }),
            padding({ trailing: -10 }),
          ]}
        >
          <SText variant="captionSm" color={colors.textMuted}>
            {t("columnBudgeted")}
          </SText>
          <SAmount
            value={budgeted}
            variant="caption"
            color={budgeted !== 0 ? colors.textSecondary : colors.textMuted}
            lines={1}
            modifiers={[sFont[hasSym ? "captionSm" : "caption"]]}
          />
        </VStack>
      )}
      <VStack
        alignment="trailing"
        spacing={2}
        modifiers={[
          frame({ width: COL_AVAILABLE, alignment: "trailing" }),
          padding({ leading: 6 }),
        ]}
      >
        <SText variant="captionSm" color={colors.textMuted}>
          {t("columnAvailable")}
        </SText>
        <SAmount
          value={balanceValue}
          color={balanceColor}
          variant="caption"
          lines={1}
          modifiers={[sFont[hasSym ? "captionSm" : "caption"]]}
        />
      </VStack>
    </HStack>
  );
}
